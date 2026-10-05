# Deploying

Two things ship separately: the static site, and the contact worker. The site works without the
worker. The contact form does not.

## 1. Put the site on GitHub Pages

Create a repo and push everything in this folder to `main`.

```bash
git init
git add .
git commit -m "Sherlock site"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

In the repo, go to **Settings, Pages** and set **Source** to **GitHub Actions**. The workflow in
`.github/workflows/pages.yml` runs the tests, stages only the site files, and publishes them.

Two naming options:

- Repo named `<user>.github.io` gives you `https://<user>.github.io/`.
- Any other repo name gives you `https://<user>.github.io/<repo>/`. If you use this, every
  absolute URL in the site needs the subpath. Easier to use the first option or a custom domain.

## 2. Fix the domain references

The site ships pointing at `https://sherlocknots.github.io`. Replace that with the real address in
exactly these places:

| File | What |
| --- | --- |
| `index.html` | `link[rel=canonical]`, `og:url`, the JSON-LD `url` |
| `privacy.html`, `terms.html`, `disclaimer.html` | `link[rel=canonical]` |
| `robots.txt` | the `Sitemap:` line |
| `sitemap.xml` | all four `<loc>` entries |
| `worker/wrangler.toml` | `ALLOWED_ORIGIN` |

Nothing else hardcodes the host.

For a custom domain, add a `CNAME` file at the repo root containing the bare domain, point DNS at
GitHub, and tick **Enforce HTTPS** in Settings, Pages.

## 3. Deploy the contact worker

Full steps in [worker/README.md](worker/README.md). Summary:

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create RATE_LIMIT     # paste the id into wrangler.toml
npx wrangler secret put DISCORD_WEBHOOK_URL     # paste the webhook, it stays server-side
npx wrangler deploy
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to the site's exact origin first, no trailing slash.

The KV namespace is not optional. `wrangler.toml` ships with a placeholder id so a deploy that
skips this step fails, and the worker returns 503 rather than running with no rate limiting.

Rate limiting in KV bounds a sequential flood, not a parallel one, because KV has no atomic
increment. If the form ever gets attacked properly, add a rate limiting rule in the Cloudflare
dashboard for the worker's route. That runs at the edge, before the worker, and it is a real limit.

Until you do this, the form falls back to the Web3Forms relay keyed by the `access_key` in
`index.html`, so it sends either way. The worker is still worth deploying: it rate limits, it
accepts attachments, and none of it is public.

Then put the deployed URL into `assets/js/config.js`:

```js
export const CONTACT_ENDPOINT = 'https://sherlock-contact.<subdomain>.workers.dev';
```

**The webhook that was in the original page is compromised.** It sat in public HTML, so anyone who
viewed source has it. Delete it in Discord, create a fresh one, and only ever give the new one to
`wrangler secret put`.

## 4. Mind the CSP

The site ships a locked-down Content Security Policy. Anything the browser has to *fetch* from
another host must be listed in `connect-src`, in two places: the `<meta http-equiv>` tag in
`index.html`, and `_headers`.

Already allowed: `*.workers.dev`, and the GitHub hosts firmware downloads usually come from. A
worker on a custom domain, or firmware hosted somewhere else, has to be added. A blocked request
fails silently apart from a console error, so if something stops working, check the console first.

Once the worker is deployed, **narrow `https://*.workers.dev` to the exact subdomain you got**.
Anyone can register a `workers.dev` subdomain, so the wildcard is a convenience for first setup,
not something to leave in place.

## 5. Headers

`_headers` carries HSTS, `frame-ancestors`, `Permissions-Policy` and the rest. **GitHub Pages
ignores it.** Pages cannot set custom headers at all, and a `<meta>` CSP cannot express
`frame-ancestors` or HSTS.

So on GitHub Pages you get the meta CSP and nothing else. That is a reasonable baseline. For the
full set, either host on Cloudflare Pages (which reads `_headers` natively) or put Cloudflare in
front of the Pages site. Do not pretend the headers are live when they are not.

Note that `_headers` sets `Permissions-Policy: serial=(self)`. Removing that line, or setting
`serial=()`, turns the flasher off.

## Going-live checklist

- [ ] Old Discord webhook deleted, new one created
- [ ] Worker deployed, KV namespace bound (not the placeholder id), `ALLOWED_ORIGIN` correct
- [ ] `connect-src` narrowed from `*.workers.dev` to the real worker host
- [ ] `CONTACT_ENDPOINT` set in `assets/js/config.js`
- [ ] Domain replaced everywhere in the table above
- [ ] Contact form tested from the live site, message arrives in Discord
- [ ] Flasher tested on a real board over HTTPS
- [ ] `npm test` passes
- [ ] A junk URL returns the branded 404
- [ ] Share the URL somewhere that renders a preview card and confirm it looks right
