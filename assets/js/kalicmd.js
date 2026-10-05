/* Kali CMD tool: clicking a copy line puts its command on the clipboard and
   shows a brief "Copied!" confirmation next to it. Works for every
   .kali-copy-btn on the page. */

export function initKaliCmd() {
  const buttons = document.querySelectorAll('.kali-copy-btn');
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    const status = btn.parentElement.querySelector('.kali-copy-status');
    let resetTimer = null;

    function show(message) {
      if (!status) return;
      status.textContent = message;
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        status.textContent = '';
      }, 2000);
    }

    btn.addEventListener('click', async () => {
      const text = btn.dataset.copyText || btn.textContent.trim();

      try {
        await navigator.clipboard.writeText(text);
        show('Copied!');
      } catch (e) {
        show('Copy failed. Select and copy manually.');
      }
    });
  });
}
