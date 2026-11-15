import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonthView from './MonthView';
import { setLang } from '../i18n';
import type { CalEvent } from './data';

const ev = (id: string, date: string, layer: string): CalEvent => ({ id, layer, title: id, date, allDay: true, assignees: [], place: '', notes: '', createdBy: 'me', updatedAt: null as never });

describe('MonthView', () => {
  it('Nov 2026 is Monday-aligned: Sunday the 1st sits in the 7th column', () => {
    setLang('en');
    render(<MonthView month="2026-11" selected="2026-11-15" events={[]} colors={{}} onSelect={() => {}} onMonth={() => {}} />);
    const cells = screen.getByTestId('cal-grid').children;
    expect(cells.length % 7).toBe(0);
    expect(within(cells[6] as HTMLElement).getByRole('button', { name: '2026-11-01' })).toBeInTheDocument();
    expect(within(cells[7] as HTMLElement).getByRole('button', { name: '2026-11-02' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent('Mon');
  });

  it('shows one dot per layer colour on a day', () => {
    render(<MonthView month="2026-11" selected="2026-11-15" colors={{ personal: '#111111', t1: '#222222' }}
      events={[ev('a', '2026-11-10', 'personal'), ev('b', '2026-11-10', 'personal'), ev('c', '2026-11-10', 't1'), ev('d', '2026-11-11', 't1')]}
      onSelect={() => {}} onMonth={() => {}} />);
    const dots = screen.getByRole('button', { name: '2026-11-10' }).querySelectorAll('.dot');
    expect([...dots].map((d) => (d as HTMLElement).style.backgroundColor)).toEqual(['rgb(17, 17, 17)', 'rgb(34, 34, 34)']);
    expect(screen.getByRole('button', { name: '2026-11-11' }).querySelectorAll('.dot')).toHaveLength(1);
  });

  it('selects a day and changes month', async () => {
    const onSelect = vi.fn(); const onMonth = vi.fn();
    render(<MonthView month="2026-11" selected="2026-11-15" events={[]} colors={{}} onSelect={onSelect} onMonth={onMonth} />);
    await userEvent.click(screen.getByRole('button', { name: '2026-11-20' }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-20');
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonth).toHaveBeenCalledWith(1);
  });
});
