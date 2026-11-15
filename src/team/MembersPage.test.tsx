import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { emit, listeners, updateDoc, deleteDoc } from './fsMock';

const addMemberByPhone = vi.fn().mockResolvedValue({ status: 'invited' });
const cancelPhoneInvite = vi.fn().mockResolvedValue({});
const getInviteCode = vi.fn().mockResolvedValue({ code: 'CODE99' });
const resetInviteCode = vi.fn().mockResolvedValue({ code: 'NEW111' });
vi.mock('../api', () => ({
  addMemberByPhone: (...a: unknown[]) => addMemberByPhone(...a),
  cancelPhoneInvite: (...a: unknown[]) => cancelPhoneInvite(...a),
  getInviteCode: (...a: unknown[]) => getInviteCode(...a),
  resetInviteCode: (...a: unknown[]) => resetInviteCode(...a),
}));
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => (await import('./fsMock')).firestoreMock);
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
let myRole = 'admin';
vi.mock('./TeamContext', () => ({
  useTeams: () => ({ member: () => ({ uid: 'me', role: myRole, status: 'active' }) }),
}));
const confirmSheet = vi.fn().mockResolvedValue(true);
vi.mock('../ui/confirm', () => ({ confirmSheet: (...a: unknown[]) => confirmSheet(...a) }));

import MembersPage from './MembersPage';
import { setLang } from '../i18n';

const members = {
  me: { uid: 'me', name: 'Me', role: 'admin', status: 'active' },
  bob: { uid: 'bob', name: 'Bob', role: 'member', status: 'active' },
  cat: { uid: 'cat', name: 'Cat', role: 'member', status: 'pending' },
};
const invites = { 't1_+60123456789': { teamId: 't1', phone: '+60123456789', name: 'Dan', role: 'member' } };

function setup() {
  render(
    <MemoryRouter initialEntries={['/team/t1/members']}>
      <Routes><Route path="/team/:teamId/members" element={<MembersPage />} /></Routes>
    </MemoryRouter>,
  );
  act(() => {
    emit('teams/t1/members', members);
    if (myRole === 'admin') emit('phoneInvites?teamId=t1', invites);
  });
}

beforeEach(() => { vi.clearAllMocks(); listeners.clear(); myRole = 'admin'; setLang('en'); confirmSheet.mockResolvedValue(true); });
const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

describe('MembersPage', () => {
  it('admin: approve sets status active', async () => {
    setup();
    await userEvent.click(within(row('Cat')).getByRole('button', { name: 'Approve' }));
    expect(updateDoc).toHaveBeenCalledWith({ path: 'teams/t1/members/cat' }, { status: 'active' });
  });

  it('admin: reject deletes the member doc after confirm', async () => {
    setup();
    await userEvent.click(within(row('Cat')).getByRole('button', { name: 'Reject' }));
    expect(confirmSheet).toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'teams/t1/members/cat' });
  });

  it('admin: no delete when confirm is declined', async () => {
    confirmSheet.mockResolvedValue(false);
    setup();
    await userEvent.click(within(row('Bob')).getByRole('button', { name: 'Remove' }));
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('admin: changes role with the select', async () => {
    setup();
    await userEvent.selectOptions(within(row('Bob')).getByRole('combobox'), 'finance');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'teams/t1/members/bob' }, { role: 'finance' });
  });

  it('own row has no role select or remove', () => {
    setup();
    const me = row('Me');
    expect(within(me).queryByRole('combobox')).toBeNull();
    expect(within(me).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('admin: phone invites can be cancelled', async () => {
    setup();
    await userEvent.click(within(row('Dan')).getByRole('button', { name: 'Cancel invite' }));
    expect(cancelPhoneInvite).toHaveBeenCalledWith('t1', '+60123456789');
  });

  it('admin: shows the invite code and resets it', async () => {
    setup();
    expect(await screen.findByText('CODE99')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset code' }));
    expect(resetInviteCode).toHaveBeenCalledWith('t1');
    expect(await screen.findByText('NEW111')).toBeInTheDocument();
  });

  it('add by phone rejects an invalid phone before calling', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Mobile number'), '12345');
    await userEvent.type(screen.getByLabelText('Name'), 'Eve');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid Malaysian mobile');
    expect(addMemberByPhone).not.toHaveBeenCalled();
  });

  it('add by phone with an empty name says so before calling', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Mobile number'), '012-345 6789');
    await userEvent.type(screen.getByLabelText('Name'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid name');
    expect(addMemberByPhone).not.toHaveBeenCalled();
  });

  it('add by phone sends the E.164 number', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Mobile number'), '012-345 6789');
    await userEvent.type(screen.getByLabelText('Name'), 'Eve');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addMemberByPhone).toHaveBeenCalledWith('t1', '+60123456789', 'Eve', 'member');
  });

  it('non-admin sees a read-only list of active members', () => {
    myRole = 'member';
    setup();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Cat')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(getInviteCode).not.toHaveBeenCalled();
  });
});
