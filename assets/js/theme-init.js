/* Runs before first paint so a saved choice never flashes the wrong theme.
   Dark is the default; only an explicit "light" choice changes it.
   Also marks the page as script-enabled so the hero can show its first
   sentence statically when JavaScript is off. */
(function () {
  document.documentElement.classList.add('js');
  try {
    if (localStorage.getItem('sherlock-theme') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {
    /* blocked site data: the dark default is correct anyway */
  }
})();
