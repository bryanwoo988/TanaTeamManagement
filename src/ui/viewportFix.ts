/**
 * iOS home-screen web apps sometimes keep a stale (too short) layout viewport after the keyboard closes,
 * after the app returns from the background, or after page scrolling was locked. Everything `position: fixed`
 * (the bottom bar) then floats in the middle of the screen until something forces a new layout.
 *
 * Two parts:
 *  1. Overlays (sheets, photo viewer) no longer lock the page with `body { overflow: hidden }` — one known
 *     trigger. Touch moves outside a scrollable sheet are cancelled instead, so the page behind stays put.
 *  2. At the moments the glitch appears, nudge the browser to recompute the viewport.
 */
const OVERLAY = '.sheet-backdrop, .photo-viewer';

export function guardOverlayScroll(e: TouchEvent): void {
  if (e.touches.length !== 1 || !document.querySelector(OVERLAY)) return;
  if ((window.visualViewport?.scale ?? 1) > 1.01) return; // zoomed in (photo): one finger pans
  const target = e.target as Element | null;
  if (target?.closest?.('textarea')) return;
  const sheet = target?.closest?.('.sheet');
  // Inside a sheet that really scrolls, let it scroll (overscroll-behavior keeps it from chaining to the page).
  if (sheet && sheet.scrollHeight > sheet.clientHeight + 1) return;
  if (e.cancelable) e.preventDefault();
}

let pending = 0;
/** Ask the browser for a fresh layout viewport: re-apply the viewport meta, then re-apply the scroll position. */
export function nudgeViewport(): void {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      const content = meta.content;
      meta.content = `${content}, maximum-scale=10`;
      requestAnimationFrame(() => { meta.content = content; window.scrollTo(window.scrollX, window.scrollY); });
    } else window.scrollTo(window.scrollX, window.scrollY);
  });
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function installViewportFix(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('touchmove', guardOverlayScroll, { passive: false });
  if (!isIos()) return;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') nudgeViewport(); });
  window.addEventListener('pageshow', nudgeViewport);
  window.addEventListener('orientationchange', nudgeViewport);
  // Keyboard closed: the field lost focus and nothing else took it.
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) nudgeViewport(); }, 120));
  // An overlay was closed.
  let open = false;
  new MutationObserver(() => {
    const now = !!document.querySelector(OVERLAY);
    if (open && !now) nudgeViewport();
    open = now;
  }).observe(document.body, { childList: true, subtree: true });
}
