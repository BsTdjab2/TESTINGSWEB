/* Hero terminal typing effect: types a sentence, holds, erases it, then moves
   on to the next one, forever.

   The three sentences live in the HTML (.hero-typing-sizer). They are invisible
   but take up room, so the hero never changes height. The not-yet-typed part of
   the current sentence is also rendered invisibly (.rest), so lines wrap exactly
   as they will when the sentence is complete and no letter ever jumps. */

const TYPE_MS = 45;     /* delay between typed characters */
const ERASE_MS = 22;    /* delay between erased characters, faster than typing */
const HOLD_MS = 2000;   /* pause once a sentence is fully typed */
const GAP_MS = 550;     /* pause once a sentence is fully erased */
const START_MS = 400;   /* pause before the very first character */

export function initTyping() {
  const root = document.getElementById('heroTyping');
  if (!root) return;

  const typed = root.querySelector('.typed');
  const rest = root.querySelector('.rest');
  const sr = root.querySelector('.hero-typing-sr');
  const sentences = Array.from(root.querySelectorAll('.hero-typing-sizer'))
    .map((el) => el.textContent.trim())
    .filter(Boolean);

  if (!typed || !rest || !sentences.length) return;

  /* Screen readers get all three sentences once, not every keystroke. */
  if (sr) sr.textContent = sentences.join(' ');

  root.classList.add('is-active');

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function render(text, count) {
    typed.textContent = text.slice(0, count);
    rest.textContent = text.slice(count);
  }

  async function run() {
    let index = 0;
    await sleep(START_MS);

    for (;;) {
      const text = sentences[index];

      /* Show the caret at the start of the line, blinking, before typing. */
      render(text, 0);
      root.classList.remove('is-typing');
      if (index !== 0) await sleep(GAP_MS);

      root.classList.add('is-typing');
      for (let i = 1; i <= text.length; i += 1) {
        render(text, i);
        await sleep(TYPE_MS);
      }

      root.classList.remove('is-typing');
      await sleep(HOLD_MS);

      root.classList.add('is-typing');
      for (let i = text.length - 1; i >= 0; i -= 1) {
        render(text, i);
        await sleep(ERASE_MS);
      }

      index = (index + 1) % sentences.length;
    }
  }

  run();
}
