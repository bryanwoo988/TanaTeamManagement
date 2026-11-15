import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { emit, listeners } from '../team/fsMock';

const leaveTeam = vi.fn();
const signOut = vi.fn().mockResolvedValue(undefined);
const confirmSheet = vi.fn().mockResolvedValue(true);
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => (await import('../team/fsMock')).firestoreMock);
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, profile: { name: 'Ali', phone: '+60123456789', notify: {}, digestTime: '20:00' } }),
  signOut: () => signOut(),
}));
vi.mock('../api', () => ({ leaveTeam: (...a: unknown[]) => leaveTeam(...a), requestPhoneChangeCode: vi.fn(), confirmPhoneChange: vi.fn() }));
vi.mock('../ui/confirm', () => ({ confirmSheet: (...a: unknown[]) => confirmSheet(...a) }));
vi.mock('../notify/push', () => ({ pushState: () => 'off', resolvePushState: () => Promise.resolve('on') }));

import { TeamProvider } from '../team/TeamContext';
import SettingsPage from './SettingsPage';
import { setLang } from '../i18n';

function setup(current: string, role: 'admin' | 'member' = 'admin') {
  localStorage.setItem('team', current);
  render(<MemoryRouter><TeamProvider><SettingsPage /></TeamProvider></MemoryRouter>);
  act(() => emit('users/u1/teams', { a: { teamId: 'a', name: 'Farm', role, status: 'active' } }));
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); listeners.clear(); setLang('en'); confirmSheet.mockResolvedValue(true); });

describe('SettingsPage', () => {
  it('shows grouped rows linking to sub-pages, language switch, version and sign out', async () => {
    setup('personal');
    expect(screen.getByRole('link', { name: /Ali/ })).toHaveAttribute('href', '/settings/account');
    expect(screen.getByRole('link', { name: /Ali/ })).toHaveTextContent('+60 12-345 6789');
    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute('href', '/settings/notifications');
    expect(await screen.findByRole('link', { name: /Notifications.*On/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Appearance/ })).toHaveAttribute('href', '/settings/appearance');
    expect(screen.getByRole('link', { name: /Share this app/ })).toHaveAttribute('href', '/settings/share');
    expect(screen.getByRole('link', { name: /About.*v1\.4\.3/ })).toHaveAttribute('href', '/settings/about');
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByText('Version 1.4.3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave team' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('lists team links for an admin and leaves the team after confirming', async () => {
    setup('a');
    expect(screen.getByRole('link', { name: /Members/ })).toHaveAttribute('href', '/team/a/members');
    expect(screen.getByRole('link', { name: /Invoice categories/ })).toHaveAttribute('href', '/team/a/invoices/categories');
    expect(screen.getByRole('link', { name: /Export/ })).toHaveAttribute('href', '/team/a/export');
    leaveTeam.mockResolvedValue({});
    await userEvent.click(screen.getByRole('button', { name: 'Leave team' }));
    expect(confirmSheet).toHaveBeenCalled();
    expect(leaveTeam).toHaveBeenCalledWith('a');
  });

  it('hides categories from non-admins', () => {
    setup('a', 'member');
    expect(screen.getByRole('link', { name: /Members/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Invoice categories/ })).toBeNull();
  });

  it('refuses with the translated last-admin message', async () => {
    setLang('zh');
    setup('a');
    leaveTeam.mockRejectedValue(Object.assign(new Error('team.lastAdmin'), { code: 'functions/failed-precondition' }));
    await userEvent.click(screen.getByRole('button', { name: '退出团队' }));
    expect(await screen.findByText('你是最后一位管理员，请先指定其他管理员。')).toBeInTheDocument();
  });

  it('does not call leave when the sheet is cancelled', async () => {
    setup('a');
    confirmSheet.mockResolvedValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Leave team' }));
    expect(leaveTeam).not.toHaveBeenCalled();
    expect(within(document.body).queryByText('Left the team')).toBeNull();
  });
});
