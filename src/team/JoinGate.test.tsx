import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';

const joinTeam = vi.fn().mockResolvedValue({ teamId: 't1', status: 'pending' });
vi.mock('../api', () => ({ joinTeam: (...a: unknown[]) => joinTeam(...a) }));
vi.mock('../firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }));
let auth: Record<string, unknown> = {};
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../auth/LoginPage', () => ({ default: () => <p>LOGIN</p> }));
vi.mock('../auth/ProfileSetup', () => ({ default: () => <p>PROFILE</p> }));
vi.mock('./TeamContext', () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTeams: () => ({ setCurrent: vi.fn() }),
}));
vi.mock('../nav/BottomNav', () => ({ default: () => null }));
vi.mock('../notify/PushBanner', () => ({ default: () => null }));
vi.mock('../calendar/CalendarPage', () => ({ default: () => <p>CALENDAR</p> }));

import { routes } from '../routes';
import { setLang } from '../i18n';

beforeEach(() => { vi.clearAllMocks(); setLang('en'); sessionStorage.clear(); });

describe('invite link gate', () => {
  it('signed out: remembers the code and shows login; after sign-in it joins once and clears it', async () => {
    auth = { user: null, profile: null, loading: false, error: null, retry: vi.fn() };
    const router = createMemoryRouter(routes, { initialEntries: ['/join/tana-8mr9'] });
    const { rerender } = render(<RouterProvider router={router} />);
    expect(await screen.findByText('LOGIN')).toBeInTheDocument();
    expect(sessionStorage.getItem('pendingJoin')).toBe('TANA-8MR9');
    expect(joinTeam).not.toHaveBeenCalled();

    auth = { user: { uid: 'u' }, profile: { name: 'A' }, loading: false, error: null, retry: vi.fn() };
    rerender(<RouterProvider router={router} />);
    router.navigate('/join/tana-8mr9');
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
    expect(joinTeam).toHaveBeenCalledTimes(1);
    expect(joinTeam).toHaveBeenCalledWith('TANA-8MR9');
    expect(sessionStorage.getItem('pendingJoin')).toBeNull();
  });

  it('signed in elsewhere with a remembered code: lands on the join page', async () => {
    sessionStorage.setItem('pendingJoin', 'TANA-8MR9');
    auth = { user: { uid: 'u' }, profile: { name: 'A' }, loading: false, error: null, retry: vi.fn() };
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
    expect(joinTeam).toHaveBeenCalledWith('TANA-8MR9');
  });
});
