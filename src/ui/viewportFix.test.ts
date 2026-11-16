import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardOverlayScroll } from './viewportFix';

function move(target: Element) {
  const e = { touches: [{}], target, cancelable: true, preventDefault: vi.fn() };
  guardOverlayScroll(e as unknown as TouchEvent);
  return e.preventDefault;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('guardOverlayScroll', () => {
  it('leaves the page alone when no overlay is open', () => {
    document.body.innerHTML = '<main><p id="x">hi</p></main>';
    expect(move(document.getElementById('x')!)).not.toHaveBeenCalled();
  });

  it('blocks page scrolling behind a sheet (touch on the backdrop or a short sheet)', () => {
    document.body.innerHTML = '<div class="sheet-backdrop" id="b"><div class="sheet"><p id="x">hi</p></div></div>';
    expect(move(document.getElementById('b')!)).toHaveBeenCalled();
    expect(move(document.getElementById('x')!)).toHaveBeenCalled();
  });

  it('lets a tall sheet scroll', () => {
    document.body.innerHTML = '<div class="sheet-backdrop"><div class="sheet" id="s"><p id="x">hi</p></div></div>';
    const s = document.getElementById('s')!;
    Object.defineProperty(s, 'scrollHeight', { value: 900 });
    Object.defineProperty(s, 'clientHeight', { value: 500 });
    expect(move(document.getElementById('x')!)).not.toHaveBeenCalled();
  });
});
