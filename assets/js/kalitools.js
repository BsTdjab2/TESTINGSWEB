/* Kali Tools directory: a live search over the .tool-card grid.

   Typing filters the cards instantly. When the query narrows the list down
   to one tool, or matches a tool's name exactly, the page scrolls straight
   to it and briefly highlights it. Pressing Enter jumps to the first
   visible match right away. */

const JUMP_DELAY_MS = 150;
const HIGHLIGHT_MS = 1500;

export function initKaliTools() {
  const input = document.getElementById('toolSearch');
  const cards = Array.from(document.querySelectorAll('.tool-card'));
  if (!input || !cards.length) return;

  const categories = Array.from(document.querySelectorAll('.tool-category'));
  const empty = document.getElementById('toolSearchEmpty');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let jumpTimer = null;

  function highlight(card) {
    card.classList.add('is-highlighted');
    window.setTimeout(() => card.classList.remove('is-highlighted'), HIGHLIGHT_MS);
  }

  function jumpTo(card) {
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    highlight(card);
  }

  function filter() {
    const query = input.value.trim().toLowerCase();
    let visibleCount = 0;
    let exactMatch = null;
    let firstVisible = null;

    cards.forEach((card) => {
      const name = (card.dataset.name || '').toLowerCase();
      const match = !query || name.includes(query);
      card.hidden = !match;
      if (match) {
        visibleCount += 1;
        if (!firstVisible) firstVisible = card;
        if (name === query) exactMatch = card;
      }
    });

    categories.forEach((category) => {
      const hasVisible = category.querySelector('.tool-card:not([hidden])');
      category.hidden = !hasVisible;
    });

    if (empty) empty.hidden = !query || visibleCount !== 0;

    window.clearTimeout(jumpTimer);
    if (query && (exactMatch || visibleCount === 1)) {
      jumpTimer = window.setTimeout(() => jumpTo(exactMatch || firstVisible), JUMP_DELAY_MS);
    }
  }

  input.addEventListener('input', filter);

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    window.clearTimeout(jumpTimer);
    const firstVisible = cards.find((card) => !card.hidden);
    jumpTo(firstVisible);
  });
}
