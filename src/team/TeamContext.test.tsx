import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { firestoreMock, emit, listeners } from './fsMock';

vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => (await import('./fsMock')).firestoreMock);
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));

import { TeamProvider, useTeams } from './TeamContext';
void firestoreMock;

function Probe() {
  const { teams, current, setCurrent, member } = useTeams();
  return (
    <div>
      <span data-testid="n">{teams.length}</span>
      <span data-testid="cur">{current}</span>
      <span data-testid="role">{member('t1')?.role ?? 'none'}</span>
      <button onClick={() => setCurrent('t1')}>pick</button>
    </div>
  );
}

beforeEach(() => { localStorage.clear(); listeners.clear(); });

describe('TeamContext', () => {
  it('lists the team index and exposes the caller\'s member record', () => {
    render(<TeamProvider><Probe /></TeamProvider>);
    act(() => emit('users/u1/teams', { t1: { teamId: 't1', name: 'Farm', role: 'admin', status: 'active' } }));
    expect(screen.getByTestId('n')).toHaveTextContent('1');
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(screen.getByTestId('cur')).toHaveTextContent('personal');
  });

  it('saves the current team in localStorage and restores it', async () => {
    const { unmount } = render(<TeamProvider><Probe /></TeamProvider>);
    act(() => emit('users/u1/teams', { t1: { teamId: 't1', name: 'Farm', role: 'admin', status: 'active' } }));
    act(() => screen.getByText('pick').click());
    expect(localStorage.getItem('team')).toBe('t1');
    unmount();
    render(<TeamProvider><Probe /></TeamProvider>);
    act(() => emit('users/u1/teams', { t1: { teamId: 't1', name: 'Farm', role: 'admin', status: 'active' } }));
    expect(screen.getByTestId('cur')).toHaveTextContent('t1');
  });

  it('falls back to personal when the saved team is gone or not active', () => {
    localStorage.setItem('team', 't9');
    render(<TeamProvider><Probe /></TeamProvider>);
    act(() => emit('users/u1/teams', { t1: { teamId: 't1', name: 'Farm', role: 'member', status: 'active' } }));
    expect(screen.getByTestId('cur')).toHaveTextContent('personal');
  });
});
