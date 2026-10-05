import {
  CONTACT_ENDPOINT,
  CONTACT_FALLBACK_ENDPOINT,
  FALLBACK_SUPPORTS_ATTACHMENTS,
  DISCORD_INVITE,
  MAX_MESSAGE_CHARS,
  MAX_ATTACHMENT_BYTES,
} from './config.js';
import { setStatus, setButtonBusy, formatBytes } from './ui.js';

const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'log', 'bin'];
const MIN_FILL_SECONDS = 3;

function extensionOf(name) {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function validate(fields) {
  if (!fields.name) return 'Add your name so I know who I am replying to.';
  if (!fields.email) return 'Add an email address, otherwise I cannot reply.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email)) return 'That email address does not look right.';
  if (!fields.message) return 'The message is empty.';
  if (fields.message.length > MAX_MESSAGE_CHARS) {
    return `Keep the message under ${MAX_MESSAGE_CHARS} characters.`;
  }
  return null;
}

function validateAttachment(file) {
  if (!file) return null;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`;
  }
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
    return `That file type is not accepted. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
  }
  return null;
}

async function describeFailure(response) {
  if (response.status === 429) {
    const retry = Number(response.headers.get('Retry-After'));
    return retry
      ? `Too many messages from your connection. Try again in about ${retry} seconds.`
      : 'Too many messages from your connection. Try again in a few minutes.';
  }
  if (response.status === 413) return 'That attachment is too large.';

  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch (e) {
    /* non-JSON error body, fall through to the generic message */
  }

  if (response.status >= 500) return 'The contact service is having a moment. Try again shortly.';
  return 'The message was rejected. Check the fields and try again.';
}

export function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const status = document.getElementById('contactStatus');
  const submitBtn = document.getElementById('submitBtn');
  const messageField = document.getElementById('senderMessage');
  const counter = document.getElementById('messageCount');
  const attachment = document.getElementById('senderAttachment');
  const attachmentHint = document.getElementById('attachmentHint');
  const loadedAt = Date.now();

  if (messageField && counter) {
    const updateCount = () => {
      counter.textContent = `${messageField.value.length} / ${MAX_MESSAGE_CHARS}`;
    };
    messageField.addEventListener('input', updateCount);
    updateCount();
  }

  if (attachment && attachmentHint) {
    const defaultHint = attachmentHint.textContent;
    attachment.addEventListener('change', () => {
      const file = attachment.files[0];
      if (!file) {
        attachmentHint.textContent = defaultHint;
        return;
      }
      const problem = validateAttachment(file);
      attachmentHint.textContent = problem || `${file.name} (${formatBytes(file.size)})`;
    });
  }

  /* The button ships disabled so a no-JS visitor cannot fire a submit that
     would only navigate away. Sending is entirely JavaScript. */
  submitBtn.disabled = false;

  /* The worker is preferred when it has been deployed. Otherwise the form
     posts to the relay in the markup, so it sends either way and there is no
     dead "not configured" state to walk into. */
  const accessKeyField = form.querySelector('input[name="access_key"]');
  const accessKey = accessKeyField ? accessKeyField.value.trim() : '';
  const usingFallback = !CONTACT_ENDPOINT && Boolean(accessKey);
  const endpoint = CONTACT_ENDPOINT || (usingFallback ? (form.action || CONTACT_FALLBACK_ENDPOINT) : '');
  const attachmentsAllowed = !usingFallback || FALLBACK_SUPPORTS_ATTACHMENTS;

  if (attachment && !attachmentsAllowed) {
    attachment.disabled = true;
    attachment.value = '';
    if (attachmentHint) {
      attachmentHint.textContent =
        `Attachments are off on this form. Send the file on Discord instead: ${DISCORD_INVITE}`;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!endpoint) {
      setStatus(status, 'error', `Sending is unavailable right now. Reach me on Discord: ${DISCORD_INVITE}`);
      return;
    }

    const fields = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      company: form.company.value,
    };

    const problem = validate(fields) || validateAttachment(attachment && attachment.files[0]);
    if (problem) {
      setStatus(status, 'error', problem);
      return;
    }

    const elapsedSeconds = (Date.now() - loadedAt) / 1000;
    if (elapsedSeconds < MIN_FILL_SECONDS) {
      setStatus(status, 'error', 'That was quick. Give it a second and send again.');
      return;
    }

    const payload = new FormData();
    payload.append('name', fields.name);
    payload.append('email', fields.email);
    payload.append('message', fields.message);
    payload.append('company', fields.company);
    payload.append('elapsed', String(Math.round(elapsedSeconds)));
    if (attachmentsAllowed && attachment && attachment.files[0]) {
      payload.append('attachment', attachment.files[0]);
    }

    if (usingFallback) {
      payload.append('access_key', accessKey);
      payload.append('subject', `Site contact from ${fields.name}`);
      payload.append('from_name', 'sherlocknots.github.io');
      /* The relay's own honeypot, alongside the site's "company" one. */
      payload.append('botcheck', '');
    }

    setButtonBusy(submitBtn, true, 'Sending...');
    setStatus(status, 'info', 'Sending...');

    try {
      const response = await fetch(endpoint, { method: 'POST', body: payload });

      /* The relay answers 200 with {"success": false} when it rejects
         something, so an ok status alone is not proof it went anywhere. */
      let accepted = response.ok;
      if (response.ok && usingFallback) {
        try {
          const body = await response.json();
          accepted = body && body.success !== false;
          if (!accepted) {
            setStatus(status, 'error', typeof body.message === 'string'
              ? body.message
              : `The message was not accepted. Reach me on Discord: ${DISCORD_INVITE}`);
          }
        } catch (parseError) {
          accepted = true;
        }
      }

      if (accepted) {
        form.reset();
        if (counter) counter.textContent = `0 / ${MAX_MESSAGE_CHARS}`;
        if (attachmentHint && attachmentsAllowed) {
          attachmentHint.textContent = 'Images, PDF, text or .bin. 5 MB max.';
        }
        setStatus(status, 'ok', 'Message sent. I will get back to you.');
      } else if (!response.ok) {
        setStatus(status, 'error', await describeFailure(response));
      }
    } catch (error) {
      setStatus(status, 'error', 'Could not reach the contact service. Check your connection and try again.');
    } finally {
      setButtonBusy(submitBtn, false);
    }
  });
}
