import { useCallback, useRef } from 'react';

const CLOSE_DISTANCE = 110; // px pulled down
const CLOSE_SPEED = 0.6; // px per ms on release

/**
 * Pull a bottom sheet down to close it, like a native iOS/Android sheet. The drag starts only when the
 * sheet is scrolled to its top (or the finger is on the handle), so normal scrolling inside it still works.
 * Returns a callback ref for the `.sheet` element (works for sheets that mount later). `enabled=false` (e.g. while saving) ignores the gesture.
 */
export function useSwipeToClose<T extends HTMLElement>(onClose: () => void, enabled = true) {
  const detach = useRef<(() => void) | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const on = useRef(enabled);
  on.current = enabled;

  return useCallback((el: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;
    let startY = 0, startT = 0, dy = 0, dragging = false, armed = false;

    const reset = () => {
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = '';
      dragging = false; armed = false; dy = 0;
    };
    const start = (e: TouchEvent) => {
      if (!on.current || e.touches.length !== 1) return;
      const onHandle = (e.target as HTMLElement | null)?.closest?.('.sheet-handle, .sheet-title') != null;
      armed = onHandle || el.scrollTop <= 0;
      startY = e.touches[0].clientY; startT = e.timeStamp; dy = 0; dragging = false;
    };
    const move = (e: TouchEvent) => {
      if (!armed) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (dy <= 6) { if (dy < 0) armed = false; return; }
        dragging = true;
        el.style.transition = 'none';
      }
      e.preventDefault(); // stop the page/sheet from scrolling while the sheet follows the finger
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const end = (e: TouchEvent) => {
      if (!dragging) { armed = false; return; }
      const speed = dy / Math.max(1, e.timeStamp - startT);
      if (dy > CLOSE_DISTANCE || (dy > 50 && speed > CLOSE_SPEED)) {
        el.style.transition = 'transform 0.18s ease-in';
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => close.current(), 160);
        dragging = false; armed = false;
      } else reset();
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', reset);
    detach.current = () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', reset);
    };
  }, []);
}
