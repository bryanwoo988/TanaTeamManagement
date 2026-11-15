import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { emit, listeners } from '../team/fsMock';

const updateDoc = vi.fn().mockResolvedValue(undefined);
const batchUpdate = vi.fn();
const batchCommit = vi.fn().mockResolvedValue(undefined);
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => {
  const m = (await import('../team/fsMock')).firestoreMock;
  return { ...m, query: (c: { path: string }) => ({ path: c.path }), orderBy: () => ({}), limit: () => ({}),
    updateDoc: (...a: unknown[]) => updateDoc(...a),
    writeBatch: () => ({ update: batchUpdate, commit: batchCommit }) };
});
let profile: Record<string, unknown> = { name: 'Me', notify: {}, digestTime: '20:00' };
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u1' }, profile }) }));
let teams: unknown[] = [];
vi.mock('../team/TeamContext', () => ({ useTeams: () => ({ teams, current: 'personal', setCurrent: () => {}, member: () => undefined }) }));
const listEvents = vi.fn();
vi.mock('../calendar/data', () => ({ listEvents: (...a: unknown[]) => listEvents(...a) }));
const push = { state: 'off', enable: vi.fn().mockResolvedValue(undefined), disable: vi.fn().mockResolvedValue(undefined), repair: vi.fn().mockResolvedValue(undefined) };
vi.mock('./push', async (orig) => ({ ...(await orig<typeof import('./push')>()), pushState: () => push.state, resolvePushState: async () => push.state, enablePush: (...a: unknown[]) => push.enable(...a), disablePush: (...a: unknown[]) => push.disable(...a), repairPush: (...a: unknown[]) => push.repair(...a) }));
const sendTestPush = vi.fn();
vi.mock('../api', () => ({ sendTestPush: () => sendTestPush(), getPushConfig: vi.fn() }));

import NotificationsPage from './NotificationsPage';
import PushBanner from './PushBanner';
import NotifySettings from './NotifySettings';
import { setLang } from '../i18n';

const N = (id: string, read: boolean, url = '/team/a') => [id, { kind: 'assigned', title: `T${id}`, body: `B${id}`, url, read, createdAt: { toDate: () => new Date('2026-11-15T01:00:00Z') } }] as const;
const PATH = 'users/u1/notifications';

function Where() { return <div data-testid="loc">{useLocation().pathname + useLocation().search}</div>; }

beforeEach(() => { listeners.clear(); localStorage.clear(); setLang('en'); vi.clearAllMocks(); profile = { name: 'Me', notify: {}, digestTime: '20:00' }; teams = []; push.state = 'off'; listEvents.mockImplementation(() => () => {}); });

describe('NotificationsPage', () => {
  function setup() {
    render(<MemoryRouter initialEntries={['/notifications']}><Routes><Route path="/notifications" element={<NotificationsPage />} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>);
    act(() => emit(PATH, Object.fromEntries([N('a', false, '/?team=t1&date=2026-11-20'), N('b', true), N('c', false)])));
  }
  it('tapping a notification marks it read and navigates to its url', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Ta/ }));
    expect(updateDoc).toHaveBeenCalledWith({ path: `${PATH}/a` }, { read: true });
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/?team=t1&date=2026-11-20'));
  });
  it('does not rewrite an already-read notification', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Tb/ }));
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('mark all read updates every unread one', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    expect(batchUpdate).toHaveBeenCalledWith({ path: `${PATH}/a` }, { read: true });
    expect(batchUpdate).toHaveBeenCalledWith({ path: `${PATH}/c` }, { read: true });
    expect(batchCommit).toHaveBeenCalled();
  });
  it('shows an empty state', () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    act(() => emit(PATH, {}));
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
  });
});

describe('PushBanner', () => {
  it('is hidden when push is already on', async () => {
    push.state = 'on'; teams = [{ teamId: 'a', name: 'Farm', role: 'member', status: 'active' }];
    render(<PushBanner />);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull();
  });
  it('dismissal lasts only for the session: it returns after a remount', async () => {
    teams = [{ teamId: 'a', name: 'Farm', role: 'member', status: 'active' }];
    const { unmount } = render(<PushBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull();
    unmount();
    render(<PushBanner />);
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
  });
  it('is shown to a team member who has not enabled push, and enabling calls enablePush', async () => {
    teams = [{ teamId: 'a', name: 'Farm', role: 'member', status: 'active' }];
    render(<PushBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(push.enable).toHaveBeenCalledWith('u1');
  });
  it('is shown to someone assigned an upcoming event', () => {
    listEvents.mockImplementation((_s, _f, _t, cb) => { cb([{ id: 'e', assignees: ['u1'], date: '2026-11-20' }]); return () => {}; });
    render(<PushBanner />);
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
  });
  it('silently repairs this device\'s push registration on app start', async () => {
    render(<PushBanner />);
    await act(async () => {});
    expect(push.repair).toHaveBeenCalledWith('u1');
  });
  it('is hidden for someone with no team and nothing assigned', () => {
    render(<PushBanner />);
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull();
  });
  it('shows iPhone instructions when it needs the home screen', () => {
    push.state = 'needs-home-screen'; teams = [{ teamId: 'a', name: 'Farm', role: 'member', status: 'active' }];
    render(<PushBanner />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull();
  });
});

describe('NotifySettings', () => {
  it('assigned and changed are checked and locked; others toggle notify.<kind>', async () => {
    render(<NotifySettings />);
    for (const k of [/Assigned to me/, /Job changed/]) {
      const box = screen.getByRole('checkbox', { name: k });
      expect(box).toBeChecked(); expect(box).toBeDisabled();
    }
    const digest = screen.getByRole('checkbox', { name: /Daily summary/ });
    expect(digest).toBeChecked();
    await userEvent.click(digest);
    expect(updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { 'notify.digest': false });
  });
  it('saves the digest time', () => {
    render(<NotifySettings />);
    fireEvent.change(screen.getByLabelText('Daily summary time'), { target: { value: '19:30' } });
    expect(updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { digestTime: '19:30' });
  });
  it('toggles push on this device', async () => {
    render(<NotifySettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(push.enable).toHaveBeenCalledWith('u1');
  });

  it('sends a test notification and reports how many devices got it', async () => {
    push.state = 'on';
    sendTestPush.mockResolvedValue({ results: [{ host: 'fcm.googleapis.com', ok: true }, { host: 'web.push.apple.com', ok: true }] });
    render(<NotifySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send test notification' }));
    expect(sendTestPush).toHaveBeenCalled();
    expect(await screen.findByText(/Test sent to 2 device/)).toBeInTheDocument();
  });
  it('test with no device registered says to turn notifications on first', async () => {
    sendTestPush.mockResolvedValue({ results: [] });
    render(<NotifySettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Send test notification' }));
    expect(await screen.findByText(/No device registered/)).toBeInTheDocument();
  });
  it('test failure shows the push service status code', async () => {
    push.state = 'on';
    sendTestPush.mockResolvedValue({ results: [{ host: 'fcm.googleapis.com', ok: false, statusCode: 403, message: 'x' }] });
    render(<NotifySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send test notification' }));
    expect(await screen.findByText(/403/)).toBeInTheDocument();
  });
});
