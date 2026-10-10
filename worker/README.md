# Contact worker

The contact form posts here instead of posting to Discord directly. This worker holds the webhook URL,
so it never reaches a visitor's browser.

## Why this exists

A Discord webhook URL is a credential. Anything holding it can post to that channel as anyone, ping
`@everyone`, upload files, and delete the webhook. In the original single-file version of this site the
URL sat in the page source, which meant every visitor had it.

## Deploy

You need a free Cloudflare account and Node installed.

```bash
cd worker
npm install -g wrangler        # or use npx wrangler for every command
wrangler login
```

Create the rate-limit store and wire it up:

```bash
wrangler kv namespace create RATE_LIMIT
```

Paste the printed `id` into `wrangler.toml` and uncomment the three `[[kv_namespaces]]` lines.

Set the webhook as a secret. This is the one value that must never be committed:

```bash
wrangler secret put DISCORD_WEBHOOK_URL
```

Edit `ALLOWED_ORIGIN` in `wrangler.toml` to the exact origin the site is served from, scheme included
and no trailing slash. Then deploy:

```bash
wrangler deploy
```

Wrangler prints a URL like `https://sherlock-contact.<your-subdomain>.workers.dev`. Put that in
`assets/js/config.js` as `CONTACT_ENDPOINT`, and make sure the same host is covered by `connect-src`
in the CSP (`index.html` meta tag and `_headers`). The shipped policy already allows
`https://*.workers.dev`.

## Optional: Turnstile

Turnstile is Cloudflare's free captcha. Without it the form is protected by a honeypot field, a
minimum fill time, and rate limiting, which stops casual spam but not a determined script.

1. Create a Turnstile widget in the Cloudflare dashboard.
2. `wrangler secret put TURNSTILE_SECRET`
3. Add the widget script and div to the contact form, and add `https://challenges.cloudflare.com` to
   `script-src` and `frame-src` in the CSP.

The worker enforces Turnstile as soon as `TURNSTILE_SECRET` exists, and skips it when it does not.

## What it enforces

| Control | Behaviour |
| --- | --- |
| Origin check | Rejects anything whose `Origin` is not `ALLOWED_ORIGIN`. Stops other websites, not `curl` |
| Honeypot | A filled `company` field gets a silent 200 and is dropped |
| Fill timing | Submissions under 3 seconds old are refused |
| Per-IP limit | 3 messages per 10 minutes, returns 429 with `Retry-After` |
| Daily cap | 200 messages per day across all IPs |
| Field limits | Name 80, email 120, message 1000 characters, validated server-side |
| Markdown neutering | Escapes Discord formatting, and breaks `://` so a bare URL cannot auto-link |
| Mention blocking | `allowed_mentions: {parse: []}` plus a zero-width space after every `@` |
| Attachments | 5 MB cap, extension allowlist, magic-byte check, forced `application/octet-stream`, renamed `visitor_*`, flagged as untrusted |
| Body size | `Content-Length` over 6 MB refused before the body is parsed |

Without the `RATE_LIMIT` binding the worker returns 503 and names what is missing, rather than
quietly accepting everything. `ALLOW_UNLIMITED="true"` overrides that if you really mean it.

KV has no atomic increment and eventually consistent reads, so simultaneous requests can each read
the same counter. The limits hold against a sequential flood, not a parallel one. Add a Cloudflare
rate limiting rule on the worker's route for a hard limit.

## Other hosts

Nothing here is Cloudflare-specific beyond the KV binding and `CF-Connecting-IP`. On Netlify or Vercel
the same logic drops into a function; swap the IP header and replace KV with that platform's store.
