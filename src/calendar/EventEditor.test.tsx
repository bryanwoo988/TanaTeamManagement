import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const saveEvent = vi.fn().mockResolvedValue(undefined);
const deleteEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('./data', () => ({ saveEvent: (...a: unknown[]) => saveEvent(...a), deleteEvent: (...a: unknown[]) => deleteEvent(...a) }));
const confirmSheet = vi.fn().mockResolvedValue(true);
vi.mock('../ui/confirm', () => ({ confirmSheet: (...a: unknown[]) => confirmSheet(...a) }));

import EventEditor from './EventEditor';
import { setLang } from '../i18n';
import type { CalEvent } from './data';

const members = { t1: [{ uid: 'me', name: 'Me' }, { uid: 'bob', name: 'Bob' }], personal: [{ uid: 'me', name: 'Me' }] };
const layers = (admin: boolean) => [{ id: 'personal', name: 'Personal', admin: false }, { id: 't1', name: 'Farm', admin }];
const existing: CalEvent = { id: 'e1', layer: 't1', title: 'Spray', date: '2026-11-10', allDay: false, start: '09:00', end: '10:00', assignees: ['me'], place: 'Plot', notes: '', createdBy: 'me', updatedAt: null as never };
const props = { date: '2026-11-10', uid: 'me', members, onClose: () => {}, onCopy: () => {} };

beforeEach(() => { vi.clearAllMocks(); setLang('en'); confirmSheet.mockResolvedValue(true); });

describe('EventEditor', () => {
  it('requires a title', async () => {
    render(<EventEditor {...props} event={null} layers={layers(false)} initialLayer="personal" readOnly={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required');
    expect(saveEvent).not.toHaveBeenCalled();
  });

  it('rejects an end time before the start', async () => {
    render(<EventEditor {...props} event={null} layers={layers(false)} initialLayer="personal" readOnly={false} />);
    await userEvent.type(screen.getByLabelText('Title'), 'X');
    await userEvent.type(screen.getByLabelText('Start'), '10:00');
    await userEvent.type(screen.getByLabelText('End'), '09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('End time must not be before');
    expect(saveEvent).not.toHaveBeenCalled();
  });

  it('member: assignee picker is locked to self; saves with [uid]', async () => {
    render(<EventEditor {...props} event={null} layers={layers(false)} initialLayer="t1" readOnly={false} />);
    const me = screen.getByRole('checkbox', { name: 'Me' });
    expect(me).toBeChecked();
    expect(me).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Bob' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Title'), 'Water');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveEvent).toHaveBeenCalledWith({ teamId: 't1' }, null, expect.objectContaining({ title: 'Water', assignees: ['me'], date: '2026-11-10' }));
  });

  it('admin can pick several assignees', async () => {
    render(<EventEditor {...props} event={null} layers={layers(true)} initialLayer="t1" readOnly={false} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bob' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Prune');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveEvent).toHaveBeenCalledWith({ teamId: 't1' }, null, expect.objectContaining({ assignees: ['me', 'bob'] }));
  });

  it('a read-only event shows no editing controls', () => {
    render(<EventEditor {...props} event={existing} layers={layers(false)} initialLayer="t1" readOnly />);
    expect(screen.getByLabelText('Title')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText('You can only view this event.')).toBeInTheDocument();
  });

  it('delete asks for confirmation first', async () => {
    render(<EventEditor {...props} event={existing} layers={layers(false)} initialLayer="t1" readOnly={false} />);
    confirmSheet.mockResolvedValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirmSheet).toHaveBeenCalledTimes(1);
    expect(deleteEvent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteEvent).toHaveBeenCalledWith({ teamId: 't1' }, 'e1');
  });
});
