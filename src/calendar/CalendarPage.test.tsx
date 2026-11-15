import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { emit, listeners } from '../team/fsMock';

const feeds = new Map<string, (l: unknown[]) => void>();
const key = (s: unknown) => (s === 'personal' ? 'personal' : (s as { teamId: string }).teamId);
const listEvents = vi.fn((scope: unknown, _f: string, _t: string, cb: (l: unknown[]) => void) => {
  feeds.set(key(scope), cb);
  cb(scope === 'personal' ? personalEv : teamEv);
  return () => feeds.delete(key(scope));
});
const copyEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('./data', () => ({
  listEvents: (...a: unknown[]) => (listEvents as (...x: unknown[]) => unknown)(...a),
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
  feeds.clear();
});
afterEach(() => vi.useRealTimers());

describe('CalendarPage', () => {
  it('top bar keeps the team switcher and export, leaving invoices and notifications to the bottom bar', async () => {
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    await act(async () => {});
    const bar = screen.getByRole('banner');
    expect(within(bar).getByText('switcher')).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/team/t1/export');
    expect(within(bar).queryByRole('link', { name: 'Invoices' })).toBeNull();
    expect(within(bar).queryByText('bell')).toBeNull();
  });

  it('opens the day and layer named by a notification link', async () => {
    localStorage.setItem('calLayers', JSON.stringify(['t1']));
    render(<MemoryRouter initialEntries={['/?team=t1&date=2026-12-05']}><CalendarPage /></MemoryRouter>);
    await act(async () => {});
    expect(listEvents).toHaveBeenCalledWith('personal', '2026-12-01', '2026-12-31', expect.any(Function), expect.any(Function));
    expect(screen.getByRole('button', { name: '2026-12-05' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Farm' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('overlays personal and active team events; pending teams are not a layer', async () => {
    await setup();
    expect(listEvents).toHaveBeenCalledWith('personal', '2026-11-01', '2026-11-30', expect.any(Function), expect.any(Function));
    expect(listEvents).toHaveBeenCalledWith({ teamId: 't1' }, '2026-11-01', '2026-11-30', expect.any(Function), expect.any(Function));
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
    expect(JSON.parse(localStorage.getItem('calLayers')!)).toEqual(['t1']);
  });

  it('a newly joined layer is visible when only others were switched off', async () => {
    localStorage.setItem('calLayers', JSON.stringify(['personal']));
    await setup();
    expect(screen.getByText('Spray')).toBeInTheDocument();
    expect(screen.queryByText('Dentist')).toBeNull();
  });

  it('live updates from a teammate appear without reloading', async () => {
    await setup();
    act(() => feeds.get('t1')!([...teamEv, { ...mk('New job', '2026-11-10', { start: '16:00', end: '17:00' }), id: 'e3' }]));
    expect(screen.getByText('New job')).toBeInTheDocument();
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
