import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrDownload } from './share';

const blob = new Blob(['x'], { type: 'application/pdf' });
afterEach(() => { vi.restoreAllMocks(); delete (navigator as unknown as Record<string, unknown>).canShare; delete (navigator as unknown as Record<string, unknown>).share; });

function stubUrl() {
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:x');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}

describe('shareOrDownload', () => {
  it('shares the file when canShare accepts files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { canShare: vi.fn(() => true), share });
    expect(await shareOrDownload(blob, 'a.pdf')).toBe('shared');
    expect((share.mock.calls[0][0] as { files: File[] }).files[0].name).toBe('a.pdf');
  });
  it('falls back to a download when canShare is false', async () => {
    const click = stubUrl();
    const share = vi.fn();
    Object.assign(navigator, { canShare: vi.fn(() => false), share });
    expect(await shareOrDownload(blob, 'a.pdf')).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });
  it('downloads when the Web Share API is missing', async () => {
    const click = stubUrl();
    expect(await shareOrDownload(blob, 'a.pdf')).toBe('downloaded');
    expect(click).toHaveBeenCalled();
  });
  it('treats a dismissed share sheet as cancelled, not a download', async () => {
    const click = stubUrl();
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')) });
    expect(await shareOrDownload(blob, 'a.pdf')).toBe('cancelled');
    expect(click).not.toHaveBeenCalled();
  });
  it('downloads when sharing fails for another reason', async () => {
    const click = stubUrl();
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('boom')) });
    expect(await shareOrDownload(blob, 'a.pdf')).toBe('downloaded');
    expect(click).toHaveBeenCalled();
  });
});
