/* Static-site smoke check. No dependencies: Node 22+ has a WebSocket client
 * built in, so this drives headless Chrome over CDP directly.
 *
 *   node tools/check.mjs
 *
 * It serves the repo on a loopback port, opens every page, and fails the run
 * on console errors, CSP violations, failed requests, duplicate or missing
 * H1s, or horizontal scroll at phone width.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = ['/', '/privacy.html', '/terms.html', '/disclaimer.html', '/404.html'];
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 780 },
  { name: 'desktop', width: 1280, height: 900 },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await stat(candidate);
      return candidate;
    } catch (error) {
      /* try the next one */
    }
  }
  throw new Error(
    'No Chrome, Chromium or Edge binary found. Set CHROME_PATH to one, ' +
    'or add its path to CHROME_CANDIDATES in tools/check.mjs.',
  );
}

function serve() {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const relative = urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath;
    const file = normalize(join(ROOT, relative));

    if (!file.startsWith(normalize(ROOT))) {
      res.writeHead(403).end('forbidden');
      return;
    }

    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.listeners.forEach((fn) => fn(msg));
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}, sessionId) {
    this.id += 1;
    const id = this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = id && sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  on(fn) {
    this.listeners.push(fn);
  }
}

async function main() {
  const chrome = await findChrome();
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  const userDataDir = join(process.env.TEMP || '/tmp', `sherlock-check-${Date.now()}`);

  const browser = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
  ]);

  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not expose a debug endpoint')), 20000);
    browser.stderr.on('data', (chunk) => {
      const match = /ws:\/\/[^\s]+/.exec(String(chunk));
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });

  const cdp = await Cdp.connect(wsUrl);
  const failures = [];
  const notes = [];

  for (const page of PAGES) {
    for (const viewport of VIEWPORTS) {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

      const session = {
        send: (method, params = {}) =>
          new Promise((resolve, reject) => {
            cdp.id += 1;
            const id = cdp.id;
            cdp.pending.set(id, { resolve, reject });
            cdp.socket.send(JSON.stringify({ id, method, params, sessionId }));
          }),
      };

      const problems = [];
      cdp.on((msg) => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
          problems.push(`console.error: ${msg.params.args.map((a) => a.value || a.description).join(' ')}`);
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          problems.push(`exception: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description || ''}`);
        }
        if (msg.method === 'Log.entryAdded') {
          const entry = msg.params.entry;
          if (entry.level === 'error') problems.push(`log.${entry.source}: ${entry.text}`);
        }
        if (msg.method === 'Network.loadingFailed') {
          problems.push(`request failed: ${msg.params.errorText}`);
        }
      });

      await session.send('Runtime.enable');
      await session.send('Log.enable');
      await session.send('Network.enable');
      await session.send('Page.enable');
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.name === 'phone',
      });

      await session.send('Page.navigate', { url: base + page });
      await new Promise((resolve) => setTimeout(resolve, 1400));

      const { result } = await session.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          title: document.title,
          h1: document.querySelectorAll('h1').length,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          imgNoAlt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
          brokenImg: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
          inlineStyle: document.querySelectorAll('[style]').length,
          inlineScript: [...document.querySelectorAll('script')].filter(s => !s.src && s.type !== 'application/ld+json').length,
          canonical: document.querySelector('link[rel=canonical]')?.href || null,
          desc: document.querySelector('meta[name=description]')?.content?.length || 0,
          lang: document.documentElement.lang,
          brokenUse: [...document.querySelectorAll('use')].filter(u => !document.querySelector(u.getAttribute('href'))).length,
          visibleHidden: [...document.querySelectorAll('[hidden]')].filter(e => e.getClientRects().length > 0).length,
          tinyTargets: [...document.querySelectorAll('a, button, input, select, summary')]
            .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).length,
          firmwareOptions: document.querySelectorAll('#firmware option').length
        })`,
        returnByValue: true,
      });

      const data = JSON.parse(result.value);
      const label = `${page} @ ${viewport.name}`;

      problems.forEach((p) => failures.push(`${label}: ${p}`));
      if (data.h1 !== 1) failures.push(`${label}: expected 1 h1, found ${data.h1}`);
      if (data.scrollW > data.clientW + 1) {
        failures.push(`${label}: horizontal scroll (${data.scrollW} > ${data.clientW})`);
      }
      if (data.imgNoAlt) failures.push(`${label}: ${data.imgNoAlt} image(s) without alt`);
      if (data.brokenImg) failures.push(`${label}: ${data.brokenImg} broken image(s)`);
      if (data.inlineStyle) failures.push(`${label}: ${data.inlineStyle} inline style attribute(s)`);
      if (data.inlineScript) failures.push(`${label}: ${data.inlineScript} inline script(s)`);
      if (data.brokenUse) failures.push(`${label}: ${data.brokenUse} icon(s) point at a missing symbol`);
      if (data.visibleHidden) failures.push(`${label}: ${data.visibleHidden} [hidden] element(s) still rendering`);
      if (data.tinyTargets) failures.push(`${label}: ${data.tinyTargets} tap target(s) under 24px`);
      if (!data.lang) failures.push(`${label}: no lang on <html>`);
      if (data.desc < 50) failures.push(`${label}: meta description missing or too short`);
      if (!data.title) failures.push(`${label}: no title`);

      if (viewport.name === 'desktop') {
        notes.push(`${page} title="${data.title}" h1=${data.h1} desc=${data.desc}ch` +
          (page === '/' ? ` firmwareOptions=${data.firmwareOptions}` : ''));
      }

      /* The flasher library is imported lazily, so a CSP that blocks it would
         not surface until someone clicked Connect. Load it here instead. */
      if (page === '/' && viewport.name === 'desktop') {
        const probe = await session.send('Runtime.evaluate', {
          expression: `(async () => {
            const m = await import('/assets/vendor/esptool-js/bundle.js');
            const t = new m.Transport({ readable: null, writable: null, getInfo: () => ({}) });
            const l = new m.ESPLoader({ transport: t, baudrate: 921600, romBaudrate: 115200,
              terminal: { clean(){}, write(){}, writeLine(){} } });
            const md5 = (await import('/assets/js/md5.js')).md5('abc');
            return JSON.stringify({
              api: ['main','writeFlash','after','eraseFlash'].every(k => typeof l[k] === 'function'),
              md5: md5 === '900150983cd24fb0d6963f7d28e17f72'
            });
          })()`,
          returnByValue: true,
          awaitPromise: true,
        });

        if (probe.exceptionDetails) {
          failures.push(`${label}: esptool-js failed to load: ${probe.exceptionDetails.text}`);
        } else {
          const flasher = JSON.parse(probe.result.value);
          if (!flasher.api) failures.push(`${label}: esptool-js is missing a method the flasher calls`);
          if (!flasher.md5) failures.push(`${label}: md5 produced the wrong digest in the browser`);
          if (flasher.api && flasher.md5) notes.push('  flasher: esptool-js loads under CSP, API and md5 verified');
        }
      }

      await cdp.send('Target.closeTarget', { targetId });
    }
  }

  browser.kill();
  server.close();

  notes.forEach((n) => console.log(`  ${n}`));
  console.log('');

  if (failures.length) {
    console.log(`FAIL (${failures.length})`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log(`PASS: ${PAGES.length} pages x ${VIEWPORTS.length} viewports, no errors.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
