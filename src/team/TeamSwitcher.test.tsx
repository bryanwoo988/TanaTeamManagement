import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { emit, listeners } from './fsMock';

vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => (await import('./fsMock')).firestoreMock);
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));

import { TeamProvider } from './TeamContext';
import TeamSwitcher from './TeamSwitcher';
import { setLang } from '../i18n';

function setup() {
  render(<MemoryRouter><TeamProvider><TeamSwitcher /></TeamProvider></MemoryRouter>);
  act(() => emit('users/u1/teams', {
    a: { teamId: 'a', name: 'Farm', role: 'admin', status: 'active' },
    b: { teamId: 'b', name: 'Shop', role: 'member', status: 'pending' },
  }));
}

beforeEach(() => { localStorage.clear(); listeners.clear(); setLang('en'); });

describe('TeamSwitcher', () => {
  it('lists Personal and active teams; pending teams are greyed and not selectable', async () => {
    setLang('zh');
    setup();
    await userEvent.click(screen.getByRole('button', { name: '切换团队' }));
    expect(screen.getByRole('option', { name: '个人' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Farm' })).toBeInTheDocument();
    const pending = screen.getByRole('option', { name: /Shop/ });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(pending).toHaveTextContent('等待批准');
  });

  it('selecting a team makes it current', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Switch team' }));
    await userEvent.click(screen.getByRole('option', { name: 'Farm' }));
    expect(localStorage.getItem('team')).toBe('a');
  });
});
