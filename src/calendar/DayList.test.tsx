import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayList from './DayList';
import { setLang } from '../i18n';
import type { CalEvent } from './data';

const mk = (o: Partial<CalEvent>): CalEvent => ({ id: 'x', layer: 't1', title: 'T', date: '2026-11-10', allDay: false, assignees: [], place: '', notes: '', createdBy: 'me', updatedAt: null as never, ...o });

describe('DayList', () => {
  it('lists all-day first, then by start time, with times and assignee names', async () => {
    setLang('en');
    const onOpen = vi.fn();
    render(<DayList events={[mk({ id: 'b', title: 'Late', start: '14:00', end: '15:30', assignees: ['u1', 'u2'] }), mk({ id: 'c', title: 'Early', start: '08:00', end: '09:00', assignees: ['u1'] }), mk({ id: 'a', title: 'Whole', allDay: true })]}
      names={{ u1: 'Ann', u2: 'Bob' }} colors={{ t1: '#123456' }} layerNames={{ t1: 'Farm' }} onOpen={onOpen} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((i) => i.querySelector('.ev-title')!.textContent)).toEqual(['Whole', 'Early', 'Late']);
    expect(items[0]).toHaveTextContent('All day');
    expect(items[1]).toHaveTextContent('08:00–09:00');
    expect(items[2]).toHaveTextContent('14:00–15:30');
    expect(items[2]).toHaveTextContent('Ann, Bob');
    await userEvent.click(items[1].querySelector('button')!);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('shows an empty message', () => {
    render(<DayList events={[]} names={{}} colors={{}} layerNames={{}} onOpen={() => {}} />);
    expect(screen.getByText('No events on this day.')).toBeInTheDocument();
  });
});
