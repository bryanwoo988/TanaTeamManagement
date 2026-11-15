import { fireEvent, render, screen } from '@testing-library/react';
import { useSwipeToClose } from './useSwipeToClose';

function Sheet({ onClose, enabled = true }: { onClose: () => void; enabled?: boolean }) {
  const ref = useSwipeToClose<HTMLDivElement>(onClose, enabled);
  return <div ref={ref} data-testid="sheet"><div className="sheet-handle" data-testid="handle" /></div>;
}
const touch = (y: number) => ({ touches: [{ clientY: y }] });

describe('useSwipeToClose', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('closes when pulled down far enough', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    const el = screen.getByTestId('sheet');
    fireEvent.touchStart(el, touch(100));
    fireEvent.touchMove(el, touch(160));
    fireEvent.touchMove(el, touch(300));
    expect(el.style.transform).toBe('translateY(200px)');
    fireEvent.touchEnd(el, { touches: [] });
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalled();
  });

  it('snaps back on a short slow pull', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    const el = screen.getByTestId('sheet');
    fireEvent.touchStart(el, { ...touch(100), timeStamp: 0 });
    fireEvent.touchMove(el, touch(130));
    fireEvent.touchEnd(el, { touches: [], timeStamp: 5000 });
    vi.advanceTimersByTime(200);
    expect(onClose).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
  });

  it('ignores the gesture when disabled', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} enabled={false} />);
    const el = screen.getByTestId('sheet');
    fireEvent.touchStart(el, touch(100));
    fireEvent.touchMove(el, touch(400));
    fireEvent.touchEnd(el, { touches: [] });
    vi.advanceTimersByTime(200);
    expect(onClose).not.toHaveBeenCalled();
  });
});
