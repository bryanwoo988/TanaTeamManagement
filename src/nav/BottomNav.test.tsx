import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { emit, listeners } from '../team/fsMock';

vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => (await import('../team/fsMock')).firestoreMock);
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
const notes = vi.fn();
vi.mock('../notify/notifications', () => ({ useNotifications: () => notes() }));

import { TeamProvider } from '../team/TeamContext';
import BottomNav from './BottomNav';
import { setLang } from '../i18n';

function setup(current: string, path = '/') {
  localStorage.setItem('team', current);
  render(<MemoryRouter initialEntries={[path]}><TeamProvider><BottomNav /></TeamProvider></MemoryRouter>);
  act(() => emit('users/u1/teams', { a: { teamId: 'a', name: 'Farm', role: 'admin', status: 'active' } }));
}

beforeEach(() => { localStorage.clear(); listeners.clear(); setLang('en'); notes.mockReturnValue([]); });

describe('BottomNav', () => {
  it('shows Calendar, Invoices, Notifications and Settings for a team, following the team', () => {
    setup('a');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/team/a/invoices');
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute('href', '/notifications');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('hides Invoices in Personal scope', () => {
    setup('personal');
    expect(screen.queryByRole('link', { name: 'Invoices' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Calendar' })).toBeInTheDocument();
  });

  it('shows an unread badge on Notifications', () => {
    notes.mockReturnValue([{ id: '1', read: false }, { id: '2', read: true }, { id: '3', read: false }]);
    setup('personal');
    expect(screen.getByRole('link', { name: 'Notifications (2 unread)' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('marks the current page', () => {
    setup('a', '/settings');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Calendar' })).not.toHaveAttribute('aria-current');
  });
});
