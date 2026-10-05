# Security notes

What was wrong with the original single-file version of this site, what changed, and what is still
left for a human to do.

## Fixed

### 1. Discord webhook exposed in client-side JavaScript (critical)

The webhook URL was a string literal in a `<script>` block. A webhook URL is a bearer credential with
no origin check and permissive CORS, so anyone who read the page source could:

- post to the channel from anywhere, fully controlling `username`, `avatar_url` and `content`, which
  means convincing messages that appear to come from the site
- mention `@everyone` and `@here`
- upload arbitrary files
- `DELETE` the webhook and take the contact form offline

**Now:** the browser posts to a Cloudflare Worker (`worker/`) which holds the webhook as a
`wrangler secret`. Nothing sensitive ships to the client.

Be precise about what this fixes. Identity spoofing and webhook deletion are gone, because the
credential is no longer reachable and the worker builds the `username`, `avatar_url` and `content`
itself. Unauthenticated posting is **not** gone. The worker checks the `Origin` header, which stops
a browser on another site, because browsers set that header honestly. `curl` can send any header it
likes, so anyone who finds the worker URL can still post. What bounds that is the rate limiter
below, not the origin check. Treat the origin check as a same-origin policy, not authentication.

**Still on the owner:** the original webhook was public and must be treated as compromised. Delete it
in Discord and create a new one.

### 2. Unrestricted file upload into Discord (high)

Any visitor could attach any file of any type or size and have it posted into the channel under the
site's name and avatar. A convincing setup for handing malware to the community.

**Now:** 5 MB cap, extension allowlist (`png jpg jpeg gif webp pdf txt log bin`), and a magic-byte
check on top of the extension. Images and PDFs must actually start with their own signature, and
anything starting like a PE, ELF, Mach-O, zip or `#!` script is refused whatever it is called, so
`screenshot.png` containing a Windows executable does not get through. Accepted files are renamed
`visitor_*`, handed to Discord as `application/octet-stream` rather than a content type inferred
from the filename, and the embed says the attachment came from an unverified visitor.
`ALLOW_ATTACHMENTS="false"` turns the feature off entirely.

### 3. Unsanitized text rendered as Discord markdown (high)

Form input went straight into embed fields. Discord renders markdown in embeds, so
`[Verify your account](https://evil.tld)` posted a clean clickable phishing link attributed to the
site.

**Now:** control characters and bidi overrides are stripped, the markdown metacharacters
`` \ ` * _ ~ | > [ ] ( ) # - `` are escaped, `@` gets a zero-width space so mentions render as text,
`://` gets the same treatment so a bare URL cannot auto-link into a one-click phishing target, and
`allowed_mentions: {parse: []}` blocks pings at the API level. Tested in `tools/worker.test.mjs`.

Not escaped: `:`, so `:warning:` still renders as an emoji. That is cosmetic, not a link.

### 4. No rate limiting or spam protection (high)

Nothing stopped a script flooding the channel.

**Now:** three messages per IP per ten minutes and a 200 per day global cap, both in Cloudflare KV,
returning 429 with `Retry-After`. Plus a honeypot field, a minimum fill time, and a `Content-Length`
guard so an oversized body is refused before it is parsed. The limit is checked before the body is
read, and only incremented once a message is actually accepted, so a mistyped email does not burn
somebody's quota. Turnstile is wired in and enforced automatically if `TURNSTILE_SECRET` is set.

**Know the limit of this.** Workers KV has no atomic increment and its reads are eventually
consistent, so a burst of simultaneous requests can each read the same counter and slip through.
This bounds a sequential flood, not a parallel one. For a hard limit, add a Cloudflare rate limiting
rule in the dashboard, which runs at the edge before the worker, or move the counter to a Durable
Object. The test suite proves the sequential case only; it stubs KV with a `Map`, which is strongly
consistent, so it cannot see the race.

A missing KV binding used to mean no rate limiting and no warning. The worker now returns 503 and
names the missing binding, and `wrangler.toml` ships with a placeholder id that makes a careless
deploy fail. Running unmetered requires setting `ALLOW_UNLIMITED="true"` on purpose.

### 5. No length limits (medium)

A message over 1024 characters exceeded Discord's embed field limit and returned a 400, which the
page reported as a generic failure.

**Now:** 1000 characters enforced in the browser and again in the worker, with a live counter, and a
hard truncation before the payload is built.

### 6. Third-party assets with no integrity control (medium)

FontAwesome loaded from cdnjs with no `integrity` attribute, and the logo was hotlinked from a free
image host that could have swapped it at any time.

**Now:** zero third-party requests. Icons are an inline SVG sprite built from FontAwesome's own paths
(11 KB, versus 380 KB of webfonts). The site ships no logo or banner images. esptool-js is
vendored at a pinned version with its licence.

### 7. No Content Security Policy (medium)

**Now:** `default-src 'self'` with `base-uri 'none'`, `object-src 'none'`, and no `'unsafe-inline'`
anywhere. Every inline `onclick` and `style` attribute was removed to make that possible, and
`tools/check.mjs` fails the build if any come back. `_headers` adds HSTS, `frame-ancestors 'none'`,
`nosniff`, `Referrer-Policy` and `Permissions-Policy`.

### 8. Smaller items

- `target="_blank"` on the GitHub link had no `rel="noopener noreferrer"`. Fixed.
- `window.onclick` was assigned globally, clobbering any other handler. Now `addEventListener`.
- PII was collected with no privacy policy and three dead footer links. All three pages now exist and
  say what actually happens to the data.
- Errors surfaced through `alert()`. Now inline status text in an ARIA live region.
- No `lang`, no meta description, no canonical, no favicon, no Open Graph, no 404, no robots or
  sitemap. All present.

### 9. Flasher safety

Three defects found in an adversarial review of this rebuild, all fixed and all now covered by tests.

The chip-mismatch guard used a prefix match, so `'ESP32-S3'.startsWith('ESP32')` was true and the
default "ESP32 (classic / WROOM)" selection accepted every variant. The guard that exists to stop a
bricked board was off on the most likely path through the page. It now compares chip families
exactly.

`parseOffset` used `parseInt`, which reads `+0x1000` as `0`. A visitor typing that would have had
their image written over the bootloader with no error shown. Offsets are now matched against a
strict pattern and bounded to the largest real flash size, and a bad offset in `firmware.json` is
refused rather than coerced to 0.

Remote firmware was fetched and flashed with no integrity check. `firmware.json` now takes an
optional `sha256` per build, verified in the browser before anything is written, and the console
says so explicitly when a build ships without one.

## Not fixed, by design

**`.bin` uploads are still accepted.** This is a firmware site and people send crash logs and
firmware images. A `.bin` cannot be a PE, ELF, Mach-O, zip or shell script, because those signatures
are rejected, but it can still be arbitrary binary content, which is the point of the format. The
remaining mitigations are the size cap, the rename, the octet-stream content type, and the
untrusted-visitor warning in the embed. Set `ALLOW_ATTACHMENTS="false"` to turn uploads off.

**Headers do not apply on GitHub Pages.** Pages cannot set response headers, and a `<meta>` CSP
cannot carry `frame-ancestors`, HSTS or `Permissions-Policy`. The meta CSP is live; the rest of
`_headers` needs Cloudflare Pages or Cloudflare in front. Documented rather than papered over.

**No captcha by default.** Turnstile is implemented and enforced the moment `TURNSTILE_SECRET`
exists. Until then the honeypot, timing check and rate limits carry the load, which stops casual spam
and not a determined attacker.

## Verification

`tools/worker.test.mjs` runs the real worker code against a stubbed Discord endpoint. 39 cases,
including foreign origins, honeypot submissions, markdown and bare-URL injection, bidi character
smuggling, `invoice.pdf.exe`, a PE renamed `.png`, an ELF renamed `.txt`, a 6 MB upload, `elapsed`
smuggled as a file part, an unbound rate limiter, the rate limit boundary, the daily cap, a failing
Turnstile, and confirmation that a Discord outage never leaks the webhook URL into an error
response. Every test binds a KV namespace, so the suite exercises the configuration people are
meant to deploy rather than the unmetered one.

`tools/hardware.test.mjs` covers the two flasher decisions that can destroy hardware: 10 cases over
chip family matching and offset parsing, including every ESP32 variant against a plain ESP32
selection, and the `parseInt` inputs that used to resolve silently to address 0.

What is still not covered: the KV race described above, and anything that needs real hardware or a
live deployment.

`tools/check.mjs` asserts the front end has no console errors, no CSP violations, no failed requests
and no inline styles or scripts, across five pages at two viewports.

Neither suite can test a real flash to real hardware. That remains unverified.
