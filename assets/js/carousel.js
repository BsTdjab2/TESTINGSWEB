/* Photo carousel (Project 1 Details view).

   Previous (<) and Next (>) buttons, the Left and Right arrow keys, and a
   horizontal swipe on touch screens all move between the photos. Going past
   the last photo wraps to the first one, and the other way round. Photos
   cross-fade (opacity only), nothing slides. */

const SWIPE_PX = 40;

function setupCarousel(root) {
  const slides = Array.from(root.querySelectorAll('.carousel-slide'));
  const prev = root.querySelector('.carousel-prev');
  const next = root.querySelector('.carousel-next');
  const status = root.querySelector('.carousel-status');
  if (slides.length < 2 || !prev || !next) return;

  let index = Math.max(0, slides.findIndex((s) => s.classList.contains('is-active')));
  let touchStartX = null;

  function show(target) {
    index = (target + slides.length) % slides.length;

    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });

    if (status) {
      const caption = slides[index].getAttribute('data-caption');
      status.textContent = `${index + 1} / ${slides.length}${caption ? ` \u00b7 ${caption}` : ''}`;
    }
  }

  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));

  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    }
  });

  root.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });

  root.addEventListener('touchend', (event) => {
    if (touchStartX === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < SWIPE_PX) return;
    show(delta > 0 ? index - 1 : index + 1);
  }, { passive: true });

  show(index);
}

export function initCarousels() {
  document.querySelectorAll('.carousel').forEach(setupCarousel);
}
