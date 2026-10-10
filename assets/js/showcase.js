/* Showcase: a vertical list of 10 items, each with a Details view.

   Routing uses the URL hash, so the browser Back button and shared links work:
     #showcase            the list
     #showcase/3          the Details view of item 3
     #showcase/1/tutorial the Tutorial view of item 1 (only items that have one)
   Any other hash (for example #contact from "Contact me") is left alone, so the
   view you are in does not change while the page scrolls there.

   Switching views fades the old one out, swaps, and fades the new one in.
   Only opacity changes; nothing slides or moves. */

const FADE_MS = 240;

export function initShowcase() {
  const section = document.getElementById('showcase');
  const views = document.getElementById('showcaseViews');
  const list = document.getElementById('showcaseList');
  if (!section || !views || !list) return;

  const details = new Map();
  views.querySelectorAll('.showcase-detail').forEach((el) => {
    const n = Number(el.id.replace('showcase-detail-', ''));
    details.set(n, el);
  });

  const tutorials = new Map();
  views.querySelectorAll('.showcase-tutorial').forEach((el) => {
    const n = Number(el.id.replace('showcase-tutorial-', ''));
    tutorials.set(n, el);
  });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Progressive disclosure: only Project 01 shows at first. "Show Other
     Projects" reveals the rest (items 2-10, plus the "Show Less" button
     that sits with them); "Show Less" hides them again. */
  const showOtherBtn = document.getElementById('showcaseShowOtherBtn');
  const extraItems = Array.from(views.querySelectorAll('.showcase-extra-item'));

  function expandExtra() {
    extraItems.forEach((el) => { el.hidden = false; });
    if (showOtherBtn) {
      showOtherBtn.hidden = true;
      showOtherBtn.setAttribute('aria-expanded', 'true');
    }
  }

  function collapseExtra() {
    extraItems.forEach((el) => { el.hidden = true; });
    if (showOtherBtn) {
      showOtherBtn.hidden = false;
      showOtherBtn.setAttribute('aria-expanded', 'false');
    }
  }

  if (showOtherBtn && extraItems.length) {
    showOtherBtn.addEventListener('click', expandExtra);
    extraItems.forEach((el) => {
      if (el.id === 'showcaseShowLessBtn') {
        el.addEventListener('click', () => {
          collapseExtra();
          const first = document.getElementById('showcase-item-1');
          if (first) first.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        });
      }
    });
  }

  /* Pictures stay hidden until their own "Show Picture" button is clicked. */
  views.querySelectorAll('.showcase-reveal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.revealTarget;
      const target = (targetId && document.getElementById(targetId)) || btn.closest('.showcase-media-photo');
      if (target) target.classList.add('is-revealed');
    });
  });

  let currentKey = 'list';   /* 'list', an item number, or 'N/tutorial' */
  let timer = null;
  let toTop = false;         /* true when a nav link asked for the Showcase heading */

  function keyFromHash() {
    const hash = window.location.hash;
    if (hash === '#showcase') return 'list';
    const match = /^#showcase\/(\d+)$/.exec(hash);
    if (match && details.has(Number(match[1]))) return Number(match[1]);
    const tutorial = /^#showcase\/(\d+)\/tutorial$/.exec(hash);
    if (tutorial && tutorials.has(Number(tutorial[1]))) return `${tutorial[1]}/tutorial`;
    return null; /* not ours */
  }

  function elementFor(key) {
    if (key === 'list') return list;
    if (typeof key === 'string') return tutorials.get(Number(key.split('/')[0]));
    return details.get(key);
  }

  /* The item number a view belongs to, or null for the list. */
  function itemNumber(key) {
    if (key === 'list') return null;
    return typeof key === 'string' ? Number(key.split('/')[0]) : key;
  }

  function scrollBehavior() {
    return reduceMotion.matches ? 'auto' : 'smooth';
  }

  function placeView(key, previousKey, userInitiated) {
    if (key === 'list') {
      const previousItem = itemNumber(previousKey);
      const item = previousItem !== null && !toTop
        ? document.getElementById(`showcase-item-${previousItem}`)
        : null;
      if (item) {
        if (item.hidden) expandExtra();
        item.scrollIntoView({ block: 'center', behavior: 'instant' });
      } else if (userInitiated) {
        section.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
      if (userInitiated && previousItem !== null) {
        const button = document.querySelector(`#showcase-item-${previousItem} .showcase-details-btn`);
        if (button) button.focus({ preventScroll: true });
      }
    } else {
      section.scrollIntoView({ block: 'start', behavior: 'instant' });
      if (userInitiated) {
        const heading = elementFor(key).querySelector('[tabindex="-1"]');
        if (heading) heading.focus({ preventScroll: true });
      }
    }
    toTop = false;
  }

  function show(key, { immediate = false, userInitiated = true } = {}) {
    if (key === currentKey && !immediate) return;

    window.clearTimeout(timer);

    const previousKey = currentKey;
    const outgoing = elementFor(currentKey);
    const incoming = elementFor(key);
    currentKey = key;

    /* Clear any half-finished fade from a rapid double click. */
    views.querySelectorAll('.showcase-view').forEach((el) => {
      if (el !== outgoing && el !== incoming) el.hidden = true;
      el.classList.remove('is-fading');
    });

    function swap() {
      outgoing.hidden = true;
      outgoing.classList.remove('is-fading');
      incoming.hidden = false;
      placeView(key, previousKey, userInitiated);

      if (immediate || reduceMotion.matches) return;

      /* Start transparent, force a layout pass, then fade in. */
      incoming.classList.add('is-fading');
      void incoming.offsetHeight;
      incoming.classList.remove('is-fading');
    }

    if (immediate || reduceMotion.matches || outgoing === incoming) {
      swap();
      return;
    }

    outgoing.classList.add('is-fading');
    timer = window.setTimeout(swap, FADE_MS);
  }

  function onHashChange() {
    const key = keyFromHash();
    if (key === null) return;
    show(key);
  }

  /* A nav link to #showcase should land on the heading, not on a list item. */
  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[href="#showcase"]');
    if (link && link.closest('nav')) toTop = true;
  });

  window.addEventListener('hashchange', onHashChange);

  /* Opened straight on a Details link: show it with no fade. */
  const initial = keyFromHash();
  if (initial !== null && initial !== 'list') {
    show(initial, { immediate: true, userInitiated: false });
  }
}
