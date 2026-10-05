# Sherlock

Personal site: about, projects, links, Kali CMD notes and contact buttons.

Static HTML, CSS and JavaScript. No framework, no build step, no bundler. Clone it, open it, edit it.

## What is in here

```
index.html              the whole front page
privacy.html            privacy policy
terms.html              terms of service
disclaimer.html         hardware and legal notes
404.html                custom not-found page
_headers                response headers for Cloudflare Pages / Netlify
robots.txt sitemap.xml site.webmanifest

assets/css/styles.css   every style on the site
assets/js/              one module per feature
assets/data/firmware.json   drives the flasher's firmware dropdown
assets/vendor/esptool-js/   the flashing library, self-hosted

worker/                 Cloudflare Worker that relays the contact form
tools/                  local server and the test suite
```

The JavaScript is split by job. `theme.js` handles the light/dark switcher, `kalicmd.js` the copy
buttons, `scroll-progress.js` the top progress bar, `contact.js` the form, `flasher.js` the ESP32 flashing, `hardware.js` the chip and
offset checks that keep a flash from bricking a board, `md5.js` the post-flash verification,
`ui.js` the shared status and button helpers, and `config.js` holds the handful of values you
actually edit.

## Running it locally

```bash
npm run serve      # http://127.0.0.1:8080
```

Use this rather than opening `index.html` from disk. The flasher needs a secure context, which
`127.0.0.1` counts as and `file://` does not.

## Editing content

**Projects.** The six cards near the top of `index.html`. Swap the title and description for a real
project.

**Links.** The four cards in the `#links` section of `index.html`.

**Firmware list.** `assets/data/firmware.json`. A build gets its binary either from a pinned `url`
to a merged `.bin`, or from a `release` block that pulls the project's own latest GitHub release at
flash time. A build with neither shows up greyed out on purpose, so the page never offers something
it cannot deliver. The file explains both formats.

**Contact form.** Not on the page at the moment; the Contact section is four plain buttons. If you add the form back, it posts to the Web3Forms relay whose access key is in the form markup, so it
works out of the box. Deploying `worker/` and setting `CONTACT_ENDPOINT` in `assets/js/config.js`
takes over from it, and is the better path: rate limiting, attachment handling, nothing public.

## Tests

```bash
npm test
```

Four suites:

- `tools/hardware.test.mjs` covers the two flasher decisions that can destroy a board: which chip is
  connected, and which address gets written. 13 cases, pure functions, no browser.
- `tools/worker.test.mjs` runs the contact worker's logic in Node with a stubbed Discord, and asserts
  the security controls actually hold. 39 cases covering origin checks, the honeypot, rate limiting,
  markdown and mention injection, magic-byte checks on uploads, and the fail-closed path when no
  rate limiter is bound.
- `tools/check.mjs` drives headless Chrome over CDP and opens every page at phone and desktop width.
  It fails on console errors, CSP violations, failed requests, missing or duplicate H1s, images
  without alt text, inline styles or scripts, `hidden` elements that still render, tap targets under
  24 px, and horizontal scroll. It also imports esptool-js under the live CSP and checks the
  flasher's API is intact, because that library loads lazily and a CSP mistake would otherwise stay
  invisible until somebody clicked Connect.

- `tools/effects.test.mjs` drives `index.html` through jsdom and exercises the background effects:
  mode switching, pause, off, persistence, pointer input, theme changes, and the reduced-motion
  path. 15 cases. This is the one suite with a dependency — `npm install jsdom` — because the module
  is all DOM wiring and a pure-function test would have proved nothing.

All four run in CI before the site deploys.

## Deploying

See [DEPLOY.md](DEPLOY.md). Short version: push to `main`, turn on GitHub Pages with the Actions
source, and deploy the worker separately if you want the contact form live.

## Licences

Site code is Sherlock's. Third-party components keep their own, listed in
[THIRD-PARTY.md](THIRD-PARTY.md).
