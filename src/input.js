// input.js — swipe gesture detection (touch) + arrow keys (desktop testing).
export function attachSwipeInput(el, onSwipe) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const threshold = 24; // px, avoids firing on tiny accidental drags

  el.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    },
    { passive: true }
  );

  el.addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        onSwipe(dx > 0 ? 'right' : 'left');
      } else {
        onSwipe(dy > 0 ? 'down' : 'up');
      }
    },
    { passive: true }
  );

  window.addEventListener('keydown', (e) => {
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.key]) {
      e.preventDefault();
      onSwipe(map[e.key]);
    }
  });
}
