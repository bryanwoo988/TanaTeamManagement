import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CopyDatesSheet from './CopyDatesSheet';
import { setLang } from '../i18n';

describe('CopyDatesSheet', () => {
  it('copies to the selected dates', async () => {
    setLang('en');
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(<CopyDatesSheet sourceDate="2026-11-10" onCopy={onCopy} onClose={() => {}} />);
    for (const d of ['2026-11-13', '2026-11-12', '2026-11-20']) await userEvent.click(screen.getByRole('button', { name: d }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith(['2026-11-12', '2026-11-13', '2026-11-20']);
  });

  it('refuses more than 60 dates', async () => {
    setLang('en');
    const onCopy = vi.fn();
    render(<CopyDatesSheet sourceDate="2026-11-10" onCopy={onCopy} onClose={() => {}} />);
    const clickAll = (from: number, to: number, ym: string) => { for (let d = from; d <= to; d++) { const date = `${ym}-${String(d).padStart(2, '0')}`; if (date !== '2026-11-10') fireEvent.click(screen.getByRole('button', { name: date })); } };
    clickAll(1, 30, '2026-11');
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    clickAll(1, 31, '2026-12');
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    clickAll(1, 1, '2027-01');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 60');
    expect(onCopy).not.toHaveBeenCalled();
  });
});
