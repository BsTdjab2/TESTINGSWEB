# Sherlock

Personal site: about, projects, links, Kali CMD notes (Sherlock, Forex Booster, Nuclei), a 10-item Showcase with Details views, a photo carousel and a wiring tutorial for Project 1, and contact buttons.

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
buttons, `typing.js` the hero typing effect, `showcase.js` the Showcase list, Details and Tutorial views, `carousel.js` the Project 1 photo slider,
`scroll-progress.js` the top progress bar, `contact.js` the form, `flasher.js` the ESP32 flashing, `hardware.js` the chip and
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

**Hero sentences.** The three `.hero-typing-sizer` spans in the header of `index.html`. `typing.js` reads
them, so edit the text there and nowhere else. Timings are the constants at the top of `typing.js`.

**Images.** Everything lives in `Images/`. File names are case-sensitive on most hosts, so keep the
capitals exactly: `Board.jpeg`, `Cables.jpeg`, `Nrf.jpeg`, `Antenna.jpeg` (Project 1 cover and carousel),
`Nrftuto.jpg` and `ESP32D.jpeg` (Project 1 tutorial). `Nuclei.svg` and `ForexBooster.svg` are simple
stand-in icons for the Kali tool cards. To use the official logos, save them over those two names, or
change the `src` of the `.kali-tool-icon` image in `index.html` if your file has another extension.

**Kali tools.** Each tool is one `<section class="section section-tight">` in `index.html` with a name,
an icon, a description and a list of `.kali-step` blocks. A step is a title plus a copy button whose
`data-copy-text` is the exact command that gets copied. Forex Booster still has placeholder text.

**Project 1 carousel and tutorial.** The carousel is the `.carousel` block inside `showcase-detail-1`;
add or remove `.carousel-slide` figures there and the buttons, counter and swipe follow. The tutorial is
`showcase-tutorial-1`, opened by `#showcase/1/tutorial`. To give another project a tutorial, copy that
block, rename its ids to the project number and add an Open Tutorial button to that project's details.

**Showcase.** Ten `.showcase-item` cards in `#showcaseList` and ten matching `.showcase-detail` blocks
(`showcase-detail-1` to `showcase-detail-10`) in `index.html`. Item N's Details button links to
`#showcase/N`, which opens detail block N. Replace the "Picture coming soon" box with an `<img>` (with
alt text) and fill in each block's How it's working, Source and Tutorial text.

**Firmware list.** `assets/data/firmware.json`. A build gets its binary either from a pinned `url`
to a merged `.bin`, or from a `release` block that pulls the project's own latest GitHub release at
flash time. A build with neither shows up greyed out on purpose, so the page never offers something
it cannot deliver. The file explains both formats.

**Contact form.** Not on the page at the moment; the Contact section is four plain buttons (Discord, GitHub, email, Instagram). If you add the form back, it posts to the Web3Forms relay whose access key is in the form markup, so it
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
