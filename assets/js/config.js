/* Site configuration. This is the only file you need to edit to go live. */

/* Where the contact form posts. Deploy worker/ and paste its URL here.
   Left empty, the form stays visible but tells people to use Discord
   instead of failing silently. Whatever you put here must also appear in
   connect-src in index.html's CSP meta tag and in _headers. */
export const CONTACT_ENDPOINT = '';

/* Fallback used when CONTACT_ENDPOINT is empty, so the form works from the
   moment the site goes up rather than sitting there refusing to send.
   It posts to Web3Forms, which relays to the inbox the access key belongs to.
   The key lives in the form markup in index.html: Web3Forms access keys are
   public by design and carry no account access, which is why this one is not
   the same kind of thing as the Discord webhook that was pulled out of this
   codebase. Worst case for a leaked key is spam into your own inbox, and you
   rotate it from the Web3Forms dashboard.

   The worker is still the better path: it is rate limited, it strips the
   attachment types it does not want, and nothing about it is public. Deploy
   worker/, set CONTACT_ENDPOINT above, and this fallback stops being used. */
export const CONTACT_FALLBACK_ENDPOINT = 'https://api.web3forms.com/submit';

/* Attachments go through the worker only. Web3Forms drops file uploads on the
   free tier, so rather than pretend a file arrived, the field is disabled
   while the fallback is in use. */
export const FALLBACK_SUPPORTS_ATTACHMENTS = false;

/* Shown as the fallback whenever the form can't be used. */
export const DISCORD_INVITE = 'https://discord.gg/xExgKRD6sB';

/* Keep these in step with the same limits in worker/src/index.js.
   The browser copy is a courtesy; the worker copy is the one that counts. */
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_NAME_CHARS = 80;
export const MAX_EMAIL_CHARS = 120;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
