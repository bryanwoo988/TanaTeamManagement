import { render, screen } from '@testing-library/react';
import Logo from './Logo';

describe('Logo', () => {
  it('draws the mark with theme colour variables, not fixed colours', () => {
    render(<Logo />);
    const svg = screen.getByTestId('app-logo');
    expect(svg).toHaveAttribute('aria-label', 'Tana Team');
    const fills = Array.from(svg.querySelectorAll('[fill]')).map((n) => n.getAttribute('fill'));
    for (const f of fills) expect(f === 'none' || f!.startsWith('var(--')).toBe(true);
    expect(fills).toContain('var(--accent)');
  });
});
