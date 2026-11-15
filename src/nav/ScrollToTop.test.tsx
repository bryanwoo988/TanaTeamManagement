import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { useEffect } from 'react';
import ScrollToTop from './ScrollToTop';

function Go({ to }: { to: string }) {
  const nav = useNavigate();
  useEffect(() => { nav(to); }, [nav, to]);
  return null;
}

describe('ScrollToTop', () => {
  it('scrolls to the top when the page changes', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<MemoryRouter initialEntries={['/settings']}><ScrollToTop /><Routes><Route path="/settings" element={<Go to="/settings/about" />} /><Route path="/settings/about" element={<p>about</p>} /></Routes></MemoryRouter>);
    expect(spy).toHaveBeenCalledWith(0, 0);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    spy.mockRestore();
  });
});
