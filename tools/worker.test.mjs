import worker from '../worker/src/index.js';

const ORIGIN = 'https://sherlocknots.github.io';
const WEBHOOK = 'https://discord.com/api/webhooks/test/token';

let sent = [];
const realFetch = globalThis.fetch;

function installFetch(discordHandler) {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('discord.com')) {
      sent.push({ url: String(url), body: init.body });
      return discordHandler ? discordHandler() : new Response('{}', { status: 200 });
    }
    if (String(url).includes('turnstile')) {
      return new Response(JSON.stringify({ success: globalThis.__turnstileOk !== false }), { status: 200 });
    }
    return realFetch(url, init);
  };
}
installFetch();

function fakeKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}

/* A KV binding by default: an unbound one is now refused, and the suite
   should exercise the configuration people are meant to deploy. */
function baseEnv(extra = {}) {
  return {
    DISCORD_WEBHOOK_URL: WEBHOOK,
    ALLOWED_ORIGIN: ORIGIN,
    ALLOW_ATTACHMENTS: 'true',
    RATE_LIMIT: fakeKv(),
    ...extra,
  };
}

function makeForm(fields = {}, file) {
  const fd = new FormData();
  const defaults = { name: 'Ada', email: 'ada@example.com', message: 'hello', company: '', elapsed: '20' };
  Object.entries({ ...defaults, ...fields }).forEach(([k, v]) => fd.append(k, v));
  if (file) fd.append('attachment', file.blob, file.name);
  return fd;
}

function req(form, { origin = ORIGIN, method = 'POST', headers = {} } = {}) {
  return new Request('https://worker.example/', {
    method,
    headers: { Origin: origin, 'CF-Connecting-IP': '203.0.113.7', ...headers },
    body: form,
  });
}

const results = [];
async function test(name, fn) {
  sent = [];
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function discordPayload() {
  assert(sent.length === 1, `expected 1 discord call, got ${sent.length}`);
  const form = sent[0].body;
  return { json: JSON.parse(form.get('payload_json')), form };
}

function messageValue() {
  return discordPayload().json.embeds[0].fields[2].value;
}

/* --- transport and configuration --- */

await test('OPTIONS preflight returns 204 with CORS', async () => {
  const res = await worker.fetch(new Request('https://w/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), baseEnv());
  assert(res.status === 204, `status ${res.status}`);
  assert(res.headers.get('Access-Control-Allow-Origin') === ORIGIN, 'missing ACAO');
});

await test('GET is rejected', async () => {
  const res = await worker.fetch(new Request('https://w/', { method: 'GET', headers: { Origin: ORIGIN } }), baseEnv());
  assert(res.status === 405, `status ${res.status}`);
});

await test('foreign origin is rejected', async () => {
  const res = await worker.fetch(req(makeForm(), { origin: 'https://evil.example' }), baseEnv());
  assert(res.status === 403, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called');
});

await test('no origin header is rejected', async () => {
  const res = await worker.fetch(new Request('https://w/', { method: 'POST', body: makeForm() }), baseEnv());
  assert(res.status === 403, `status ${res.status}`);
});

await test('missing webhook config returns 503', async () => {
  const res = await worker.fetch(req(makeForm()), baseEnv({ DISCORD_WEBHOOK_URL: '' }));
  assert(res.status === 503, `status ${res.status}`);
});

await test('an unbound rate limiter fails closed, it does not silently allow', async () => {
  const env = baseEnv();
  delete env.RATE_LIMIT;
  const res = await worker.fetch(req(makeForm()), env);
  assert(res.status === 503, `status ${res.status}, expected 503`);
  assert(sent.length === 0, 'discord was called with no rate limiting');
  const body = await res.json();
  assert(/RATE_LIMIT/.test(body.detail || ''), `error does not name the missing binding: ${body.detail}`);
});

await test('ALLOW_UNLIMITED is the deliberate opt out', async () => {
  const env = baseEnv({ ALLOW_UNLIMITED: 'true' });
  delete env.RATE_LIMIT;
  const res = await worker.fetch(req(makeForm()), env);
  assert(res.status === 200, `status ${res.status}`);
  assert(sent.length === 1, 'message did not go through');
});

await test('an oversized declared body is refused before parsing', async () => {
  const res = await worker.fetch(
    req(makeForm(), { headers: { 'Content-Length': String(50 * 1024 * 1024) } }),
    baseEnv(),
  );
  assert(res.status === 413, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called');
});

/* --- bot and validation gates --- */

await test('honeypot gets a silent 200 and sends nothing', async () => {
  const res = await worker.fetch(req(makeForm({ company: 'AcmeBot' })), baseEnv());
  assert(res.status === 200, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called for a bot');
});

await test('too-fast submission is rejected', async () => {
  const res = await worker.fetch(req(makeForm({ elapsed: '1' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called');
});

await test('elapsed sent as a file part cannot bypass the timing gate', async () => {
  const fd = makeForm();
  fd.delete('elapsed');
  fd.append('elapsed', new File(['x'], 'elapsed.txt'), 'elapsed.txt');
  const res = await worker.fetch(req(fd), baseEnv());
  assert(res.status === 400, `status ${res.status}, NaN slipped through the comparison`);
  assert(sent.length === 0, 'discord was called');
});

await test('invalid email is rejected', async () => {
  const res = await worker.fetch(req(makeForm({ email: 'not-an-email' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('empty message is rejected', async () => {
  const res = await worker.fetch(req(makeForm({ message: '   ' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('over-long message is rejected', async () => {
  const res = await worker.fetch(req(makeForm({ message: 'x'.repeat(1001) })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('over-long name is rejected, not silently truncated', async () => {
  const res = await worker.fetch(req(makeForm({ name: 'x'.repeat(81) })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called');
});

/* --- delivery and injection --- */

await test('happy path posts one embed', async () => {
  const res = await worker.fetch(req(makeForm()), baseEnv());
  assert(res.status === 200, `status ${res.status}`);
  const { json } = discordPayload();
  assert(json.embeds.length === 1, 'no embed');
  assert(json.embeds[0].fields.length === 3, 'wrong field count');
});

await test('mentions cannot ping', async () => {
  await worker.fetch(req(makeForm({ message: '@everyone @here <@123> hi' })), baseEnv());
  const { json } = discordPayload();
  assert(JSON.stringify(json.allowed_mentions) === '{"parse":[]}', 'allowed_mentions not locked');
  assert(messageValue().includes('@​'), `@ not neutered: ${JSON.stringify(messageValue())}`);
});

await test('markdown link injection is escaped', async () => {
  await worker.fetch(req(makeForm({ message: '[Verify your account](https://evil.tld) **bold** `code`' })), baseEnv());
  const value = messageValue();
  assert(!/\[[^\]\\]*\]\(/.test(value), `clickable markdown link survived: ${value}`);
  assert(value.includes('\\['), 'bracket not escaped');
  assert(value.includes('\\*'), 'asterisk not escaped');
  assert(value.includes('\\`'), 'backtick not escaped');
});

await test('a bare URL cannot auto-link into a one-click phish', async () => {
  await worker.fetch(req(makeForm({ message: 'Account flagged, verify at https://evil.tld/verify now' })), baseEnv());
  const value = messageValue();
  assert(!/https:\/\/evil\.tld/.test(value), `bare URL left auto-linkable: ${value}`);
  assert(value.includes('https:​//evil.tld'), `scheme not broken: ${JSON.stringify(value)}`);
});

await test('bullet syntax is escaped', async () => {
  await worker.fetch(req(makeForm({ message: '- item one' })), baseEnv());
  assert(messageValue().startsWith('\\-'), `hyphen not escaped: ${messageValue()}`);
});

await test('control and bidi characters are stripped', async () => {
  await worker.fetch(req(makeForm({ name: 'Ada‮Evil' })), baseEnv());
  const value = discordPayload().json.embeds[0].fields[0].value;
  assert(!/[‮]/.test(value), `control chars survived: ${JSON.stringify(value)}`);
});

await test('embed field stays within Discord 1024 limit', async () => {
  await worker.fetch(req(makeForm({ message: '*'.repeat(1000) })), baseEnv());
  assert(messageValue().length <= 1024, `field is ${messageValue().length}`);
});

/* --- attachments --- */

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngBlob = (extra = 32) => new Blob([new Uint8Array([...PNG, ...new Array(extra).fill(0)])]);

await test('oversized attachment is rejected with 413', async () => {
  const blob = new Blob([new Uint8Array(6 * 1024 * 1024)]);
  const res = await worker.fetch(req(makeForm({}, { blob, name: 'big.png' })), baseEnv());
  assert(res.status === 413, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called');
});

await test('executable attachment is rejected', async () => {
  const res = await worker.fetch(req(makeForm({}, { blob: new Blob(['MZ']), name: 'payload.exe' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('double-extension attachment is rejected', async () => {
  const res = await worker.fetch(req(makeForm({}, { blob: new Blob(['MZ']), name: 'invoice.pdf.exe' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('a PE renamed .png is rejected on its bytes', async () => {
  const blob = new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])]);
  const res = await worker.fetch(req(makeForm({}, { blob, name: 'screenshot.png' })), baseEnv());
  assert(res.status === 400, `status ${res.status}, a renamed executable got through`);
  assert(sent.length === 0, 'discord was called');
});

await test('an ELF renamed .txt is rejected', async () => {
  const blob = new Blob([new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01])]);
  const res = await worker.fetch(req(makeForm({}, { blob, name: 'notes.txt' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('a zip renamed .bin is rejected', async () => {
  const blob = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])]);
  const res = await worker.fetch(req(makeForm({}, { blob, name: 'firmware.bin' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('a file that is not really a PNG is rejected', async () => {
  const blob = new Blob(['just some text pretending']);
  const res = await worker.fetch(req(makeForm({}, { blob, name: 'photo.png' })), baseEnv());
  assert(res.status === 400, `status ${res.status}`);
});

await test('a genuine PNG is accepted, renamed and flagged', async () => {
  const res = await worker.fetch(req(makeForm({}, { blob: pngBlob(), name: '../../etc/pwn.png' })), baseEnv());
  assert(res.status === 200, `status ${res.status}`);
  const { json, form } = discordPayload();
  const file = form.get('files[0]');
  assert(file, 'file not attached');
  assert(file.name.startsWith('visitor_'), `not renamed: ${file.name}`);
  assert(!file.name.includes('/') && !file.name.includes('..'), `path survived: ${file.name}`);
  assert(json.embeds[0].fields.some((f) => f.name === 'Attachment' && f.value.includes('untrusted')), 'no untrusted warning');
});

await test('an accepted upload is never labelled with an image type', async () => {
  await worker.fetch(req(makeForm({}, { blob: pngBlob(), name: 'ok.png' })), baseEnv());
  const file = discordPayload().form.get('files[0]');
  assert(file.type === 'application/octet-stream', `forged content type: ${file.type}`);
});

await test('a real firmware .bin is accepted', async () => {
  const blob = new Blob([new Uint8Array([0xe9, 0x04, 0x02, 0x20, 0x00, 0x00])]);
  const res = await worker.fetch(req(makeForm({}, { blob, name: 'firmware.bin' })), baseEnv());
  assert(res.status === 200, `status ${res.status}`);
});

await test('attachments can be disabled entirely', async () => {
  const res = await worker.fetch(req(makeForm({}, { blob: pngBlob(), name: 'ok.png' })), baseEnv({ ALLOW_ATTACHMENTS: 'false' }));
  assert(res.status === 400, `status ${res.status}`);
});

/* --- rate limiting --- */

await test('per-IP rate limit kicks in on the 4th message', async () => {
  const env = baseEnv();
  const codes = [];
  for (let i = 0; i < 5; i += 1) {
    const res = await worker.fetch(req(makeForm()), env);
    codes.push(res.status);
    if (res.status === 429) {
      assert(Number(res.headers.get('Retry-After')) > 0, 'no Retry-After');
      assert(res.headers.get('Access-Control-Expose-Headers').includes('Retry-After'), 'Retry-After not exposed to JS');
    }
  }
  assert(JSON.stringify(codes) === JSON.stringify([200, 200, 200, 429, 429]), `codes ${codes}`);
  assert(sent.length === 3, `discord called ${sent.length} times, expected 3`);
});

await test('a rejected submission does not burn the sender quota', async () => {
  const env = baseEnv();
  for (let i = 0; i < 5; i += 1) {
    const res = await worker.fetch(req(makeForm({ email: 'bad' })), env);
    assert(res.status === 400, `status ${res.status}`);
  }
  const res = await worker.fetch(req(makeForm()), env);
  assert(res.status === 200, `a valid message after 5 typos was refused with ${res.status}`);
});

await test('daily cap blocks once reached', async () => {
  const env = baseEnv();
  env.RATE_LIMIT.store.set(`day:${new Date().toISOString().slice(0, 10)}`, '200');
  const res = await worker.fetch(req(makeForm()), env);
  assert(res.status === 429, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called past the daily cap');
});

await test('turnstile failure blocks the send', async () => {
  globalThis.__turnstileOk = false;
  const res = await worker.fetch(req(makeForm()), baseEnv({ TURNSTILE_SECRET: 'secret' }));
  globalThis.__turnstileOk = true;
  assert(res.status === 403, `status ${res.status}`);
  assert(sent.length === 0, 'discord was called');
});

await test('discord failure never leaks the webhook url', async () => {
  installFetch(() => new Response('bad', { status: 500 }));
  try {
    const res = await worker.fetch(req(makeForm()), baseEnv());
    const text = await res.text();
    assert(res.status === 502, `status ${res.status}`);
    assert(!text.includes('webhook') && !text.includes('discord.com'), `leaked: ${text}`);
  } finally {
    installFetch();
  }
});

await test('the fetch stub is still intact for any later test', async () => {
  const res = await worker.fetch(req(makeForm()), baseEnv());
  assert(res.status === 200, `status ${res.status}`);
});

const failed = results.filter((r) => !r).length;
globalThis.fetch = realFetch;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
