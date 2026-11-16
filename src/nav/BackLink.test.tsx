import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import BackLink from './BackLink';
import { setLang } from '../i18n';

describe('BackLink', () => {
  it('without in-app history it links to the fallback', () => {
    setLang('en');
    render(<MemoryRouter initialEntries={['/export']}><Routes><Route path="/export" element={<BackLink fallback="/team/t1/invoices" />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/team/t1/invoices');
  });

  it('goes to the fallback when clicked with no history, e.g. the invoices page', async () => {
    setLang('en');
    render(<MemoryRouter initialEntries={['/export']}><Routes>
      <Route path="/export" element={<BackLink fallback="/inv" />} />
      <Route path="/inv" element={<p>invoices page</p>} />
    </Routes></MemoryRouter>);
    await userEvent.click(screen.getByRole('link', { name: 'Back' }));
    expect(screen.getByText('invoices page')).toBeInTheDocument();
  });
});
