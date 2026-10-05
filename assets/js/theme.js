/* Dark / light toggle. Dark is the default; light is data-theme="light". */

const STORAGE_KEY = 'sherlock-theme';

function isLight() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function applyTheme(light, button) {
  if (light) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  button.setAttribute('aria-pressed', String(light));
  button.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#ffffff' : '#0a0a0f');

  try {
    localStorage.setItem(STORAGE_KEY, light ? 'light' : 'dark');
  } catch (e) {
    /* the theme still applies for this visit */
  }
}

export function initTheme() {
  const button = document.getElementById('themeToggle');
  if (!button) return;

  applyTheme(isLight(), button);
  button.addEventListener('click', () => applyTheme(!isLight(), button));
}
