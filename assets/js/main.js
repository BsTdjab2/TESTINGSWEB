import { initTheme } from './theme.js';
import { initScrollProgress } from './scroll-progress.js';
import { initContactForm } from './contact.js';
import { initFlasher } from './flasher.js';
import { initKaliCmd } from './kalicmd.js';
import { initTyping } from './typing.js';
import { initShowcase } from './showcase.js';
import { initCarousels } from './carousel.js';
import { initKaliTools } from './kalitools.js';

/* Every init no-ops when its section is absent, so the same entry point
   serves the home page and the smaller legal pages.
   Nothing here tilts, floats or follows the pointer. */
initTheme();
initScrollProgress();
initContactForm();
initFlasher();
initKaliCmd();
initTyping();
initShowcase();
initCarousels();
initKaliTools();

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
