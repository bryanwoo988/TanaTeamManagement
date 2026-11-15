import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const createTeam = vi.fn();
const joinTeam = vi.fn();
vi.mock('../api', () => ({ createTeam: (...a: unknown[]) => createTeam(...a), joinTeam: (...a: unknown[]) => joinTeam(...a) }));
vi.mock('./TeamContext', () => ({ useTeams: () => ({ setCurrent: vi.fn() }) }));

import CreateJoinPage from './CreateJoinPage';
import { setLang } from '../i18n';

beforeEach(() => { vi.clearAllMocks(); setLang('en'); });
const setup = () => render(<MemoryRouter><CreateJoinPage /></MemoryRouter>);

describe('CreateJoinPage', () => {
  it('creating a team shows its invite code', async () => {
    createTeam.mockResolvedValue({ teamId: 't1', code: 'ABC123' });
    setup();
    await userEvent.type(screen.getByLabelText('Team name'), ' Farm ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(createTeam).toHaveBeenCalledWith('Farm');
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
  });

  it('a bad invite code shows the team.badCode text', async () => {
    joinTeam.mockRejectedValue(Object.assign(new Error('team.badCode'), { code: 'functions/not-found' }));
    setup();
    await userEvent.type(screen.getByLabelText('Invite code'), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That invite code is not valid.');
  });

  it('a pending join says it is waiting for approval', async () => {
    joinTeam.mockResolvedValue({ teamId: 't1', status: 'pending' });
    setup();
    await userEvent.type(screen.getByLabelText('Invite code'), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText(/Waiting for an admin/)).toBeInTheDocument();
  });
});
