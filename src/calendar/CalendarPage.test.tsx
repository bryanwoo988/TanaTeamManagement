import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { emit, listeners } from '../team/fsMock';

const listEvents = vi.fn();
const copyEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('./data', () => ({
  listEvents: (...a: unknown[]) => listEvents(...a),
  copyEvent: (...a: unknown[]) => copyEvent(...a),
  saveEvent: vi.fn(), deleteEvent: vi.fn(),
}));
vi.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'me' } } }));
vi.mock('firebase/firestore', async () => (await import('../team/fsMock')).firestoreMock);
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'me' }, profile: { name: 'Me' } }) }));
vi.mock('../team/TeamContext', () => ({
  useTeams: () => ({
    teams: [{ teamId: 't1', name: 'Farm', role: 'member', status: 'active' }, { teamId: 't2', name: 'Shop', role: 'admin', status: 'pending' }],
    current: 't1', setCurrent: () => {},
    member: (id: string) => id === 't1' ? { role: 'member', status: 'active' } : undefined,
  }),
}));
vi.mock('../team/TeamSwitcher', () => ({ default: () => <div>switcher</div> }));

import CalendarPage from './CalendarPage';
import { setLang } from '../i18n';

const mk = (title: string, date: string, extra = {}) => ({ title, date, allDay: false, start: '09:00', end: '10:00', assignees: ['me'], place: '', notes: '', createdBy: 'me', ...extra });
const teamEv = [{ ...mk('Spray', '2026-11-10'), id: 'e1' }, { ...mk('Boss only', '2026-11-10', { assignees: ['bob'], start: '11:00', end: '12:00' }), id: 'e2' }];
const personalEv = [{ ...mk('Dentist', '2026-11-10', { start: '15:00', end: '16:00' }), id: 'p1' }];

async function setup() {
  render(<MemoryRouter><CalendarPage /></MemoryRouter>);
  await act(async () => {});
  act(() => emit('teams/t1/members', { me: { name: 'Me', status: 'active' }, bob: { name: 'Bob', status: 'active' } }));
  await userEvent.click(screen.getByRole('button', { name: '2026-11-10' }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T04:00:00Z'));
  vi.clearAllMocks(); listeners.clear(); localStorage.clear(); setLang('en');
  listEvents.mockImplementation(async (scope: unknown) => scope === 'personal' ? personalEv : teamEv);
});
afterEach(() => vi.useRealTimers());

describe('CalendarPage', () => {
  it('overlays personal and active team events; pending teams are not a layer', async () => {
    await setup();
    expect(listEvents).toHaveBeenCalledWith('personal', '2026-11-01', '2026-11-30');
    expect(listEvents).toHaveBeenCalledWith({ teamId: 't1' }, '2026-11-01', '2026-11-30');
    expect(listEvents).not.toHaveBeenCalledWith({ teamId: 't2' }, expect.anything(), expect.anything());
    expect(screen.getByRole('button', { name: '2026-11-10' }).querySelectorAll('.dot')).toHaveLength(2);
    const list = screen.getByRole('list', { name: 'Events' });
    expect(within(list).getAllByRole('listitem').map((i) => i.querySelector('.ev-title')!.textContent)).toEqual(['Spray', 'Boss only', 'Dentist']);
    expect(list).toHaveTextContent('Bob');
  });

  it('toggling a layer hides its events and remembers the choice', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Farm' }));
    expect(screen.queryByText('Spray')).toBeNull();
    expect(screen.getByText('Dentist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-11-10' }).querySelectorAll('.dot')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('calLayers')!)).toEqual(['personal']);
  });

  it('a member can only edit events they are assigned to', async () => {
    await setup();
    await userEvent.click(screen.getByText('Boss only'));
    expect(screen.getByLabelText('Title')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByText('Spray'));
    expect(screen.getByLabelText('Title')).toBeEnabled();
  });

  it('copy to three dates calls copyEvent once', async () => {
    await setup();
    await userEvent.click(screen.getByText('Spray'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy to dates' }));
    for (const d of ['2026-11-12', '2026-11-13', '2026-11-14']) await userEvent.click(screen.getByRole('button', { name: d }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyEvent).toHaveBeenCalledTimes(1);
    expect(copyEvent).toHaveBeenCalledWith({ teamId: 't1' }, expect.objectContaining({ title: 'Spray' }), ['2026-11-12', '2026-11-13', '2026-11-14']);
  });
});
