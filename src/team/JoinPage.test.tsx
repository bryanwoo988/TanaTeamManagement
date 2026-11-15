import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const joinTeam = vi.fn();
vi.mock('../api', () => ({ joinTeam: (...a: unknown[]) => joinTeam(...a) }));
vi.mock('../firebase', () => ({ db: {}, auth: {}, storage: {}, functions: {} }));
const setCurrent = vi.fn();
vi.mock('./TeamContext', () => ({ useTeams: () => ({ setCurrent }) }));

import JoinPage from './JoinPage';
import { setLang } from '../i18n';

function setup(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); setLang('en'); sessionStorage.clear(); });

describe('JoinPage', () => {
  it('pending: shows the waiting page and clears the stored code', async () => {
    sessionStorage.setItem('pendingJoin', 'TANA-8MR9');
    joinTeam.mockResolvedValue({ teamId: 't1', status: 'pending' });
    setup('/join/tana-8mr9');
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
    expect(joinTeam).toHaveBeenCalledTimes(1);
    expect(joinTeam).toHaveBeenCalledWith('TANA-8MR9');
    expect(screen.getByRole('link', { name: 'Go to calendar' })).toHaveAttribute('href', '/');
    expect(sessionStorage.getItem('pendingJoin')).toBeNull();
  });

  it('active: switches team and goes home', async () => {
    joinTeam.mockResolvedValue({ teamId: 't9', status: 'active' });
    setup('/join/TANA-8MR9');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(setCurrent).toHaveBeenCalledWith('t9');
  });

  it('bad code from the server shows the invalid-link page', async () => {
    joinTeam.mockRejectedValue(Object.assign(new Error('team.badCode [400]'), { code: 'functions/invalid-argument' }));
    setup('/join/TANA-8MR9');
    expect(await screen.findByText('This invite link is no longer valid. Ask your admin for a new one.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toBeInTheDocument();
  });

  it('malformed code never calls the server', async () => {
    sessionStorage.setItem('pendingJoin', 'x');
    setup('/join/NOPE');
    expect(await screen.findByText(/no longer valid/)).toBeInTheDocument();
    expect(joinTeam).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('pendingJoin')).toBeNull();
  });

  it('other errors offer a retry', async () => {
    joinTeam.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ teamId: 't1', status: 'pending' });
    setup('/join/TANA-8MR9');
    const retry = await screen.findByRole('button', { name: 'Retry' });
    retry.click();
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
    await waitFor(() => expect(joinTeam).toHaveBeenCalledTimes(2));
  });
});
