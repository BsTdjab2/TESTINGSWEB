const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  error: 'i-triangle-exclamation',
  ok: 'i-circle-check',
  info: 'i-circle-info',
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${name}`);
  svg.appendChild(use);
  return svg;
}

/* Text always goes in through textContent, never innerHTML: some of it is
   server-supplied and none of it is trusted markup. */
export function setStatus(element, kind, text) {
  if (!element) return;

  element.textContent = '';
  element.classList.remove('is-error', 'is-ok');

  if (!text) return;

  if (kind === 'error') element.classList.add('is-error');
  if (kind === 'ok') element.classList.add('is-ok');

  element.appendChild(icon(ICONS[kind] || ICONS.info));
  const span = document.createElement('span');
  span.textContent = text;
  element.appendChild(span);
}

export function setButtonBusy(button, busy, busyLabel) {
  const label = button.querySelector('span');
  const svg = button.querySelector('svg');

  if (busy) {
    button.disabled = true;
    button.dataset.idleLabel = label ? label.textContent : '';
    if (label && busyLabel) label.textContent = busyLabel;
    if (svg) svg.classList.add('spin');
    return;
  }

  button.disabled = false;
  if (label && button.dataset.idleLabel !== undefined) label.textContent = button.dataset.idleLabel;
  if (svg) svg.classList.remove('spin');
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
