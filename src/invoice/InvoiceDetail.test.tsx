import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

let feed: (r: unknown, pending?: boolean) => void = () => {};
const photoUrl = vi.fn().mockResolvedValue('https://img/p.jpg');
const setClaimStatus = vi.fn().mockResolvedValue(undefined);
const resubmitClaim = vi.fn().mockResolvedValue(undefined);
const deleteInvoice = vi.fn().mockResolvedValue(undefined);
vi.mock('./data', () => ({
  watchInvoice: (_t: string, _i: string, cb: (r: unknown, p?: boolean) => void) => { feed = cb; return () => {}; },
  photoUrl: (...a: unknown[]) => photoUrl(...a),
  setClaimStatus: (...a: unknown[]) => setClaimStatus(...a),
  resubmitClaim: (...a: unknown[]) => resubmitClaim(...a),
  deleteInvoice: (...a: unknown[]) => deleteInvoice(...a),
}));
let role = 'member';
vi.mock('../team/TeamContext', () => ({ useTeams: () => ({ member: () => ({ role, status: 'active' }) }) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'me' }, profile: { name: 'Me' } }) }));
vi.mock('./useTeamInfo', () => ({ useTeamInfo: () => ({ categories: [], members: [{ uid: 'me', name: 'Me' }, { uid: 'bob', name: 'Bob' }] }) }));
vi.mock('./InvoiceEditor', () => ({ default: () => <div>editor open</div> }));
vi.mock('../ui/confirm', () => ({ confirmSheet: vi.fn().mockResolvedValue(true) }));

import InvoiceDetail from './InvoiceDetail';
import { setLang } from '../i18n';

const inv = (over = {}) => ({ id: 'i1', kind: 'claim', amountSen: 1250, date: '2026-11-10', vendor: 'Ah Seng', category: 'Fuel', notes: '', photoPath: 'teams/t1/invoices/i1/p.jpg', uploadedBy: 'bob', uploaderName: 'Bob', relatedUids: [], status: 'pending', ...over });
const setup = (row: unknown) => {
  render(<MemoryRouter initialEntries={['/team/t1/invoices/i1']}><Routes><Route path="/team/:teamId/invoices/:invoiceId" element={<InvoiceDetail />} /></Routes></MemoryRouter>);
  act(() => feed(row));
};

beforeEach(() => { vi.clearAllMocks(); setLang('en'); role = 'member'; });

describe('InvoiceDetail', () => {
  it('shows the invoice and loads the photo once the doc exists', async () => {
    setup(inv());
    expect(screen.getByText('RM 12.50')).toBeInTheDocument();
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'https://img/p.jpg');
  });

  it('waits for a pending write before fetching the photo, then fetches', async () => {
    setup(inv());
    photoUrl.mockClear();
    act(() => feed(inv({ photoPath: 'teams/t1/invoices/i1/new.jpg' }), true));
    expect(photoUrl).not.toHaveBeenCalled();
    act(() => feed(inv({ photoPath: 'teams/t1/invoices/i1/new.jpg' }), false));
    expect(photoUrl).toHaveBeenCalledWith('teams/t1/invoices/i1/new.jpg');
  });

  it('a missing or unreadable invoice shows not-found', () => {
    setup(null);
    expect(screen.getByText('Invoice not found.')).toBeInTheDocument();
  });

  it('finance: reject requires a reason', async () => {
    role = 'finance';
    setup(inv());
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('give a reason');
    expect(setClaimStatus).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Reason for rejecting'), 'Blurry');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(setClaimStatus).toHaveBeenCalledWith('t1', 'i1', 'rejected', { reason: 'Blurry' });
  });

  it('finance: mark reimbursed with a paid date', async () => {
    role = 'finance';
    setup(inv());
    await userEvent.click(screen.getByRole('button', { name: 'Mark reimbursed' }));
    expect(setClaimStatus).toHaveBeenCalledWith('t1', 'i1', 'reimbursed', { paidDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('owner of a rejected claim sees the reason and can edit and resubmit', async () => {
    setup(inv({ uploadedBy: 'me', status: 'rejected', rejectReason: 'Blurry photo' }));
    expect(screen.getByText('Rejected: Blurry photo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark reimbursed' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resubmit' }));
    expect(resubmitClaim).toHaveBeenCalledWith('t1', 'i1');
    await userEvent.click(screen.getByRole('button', { name: 'Edit invoice' }));
    expect(screen.getByText('editor open')).toBeInTheDocument();
  });

  it('a plain member viewing someone else’s claim has no actions', () => {
    setup(inv({ uploadedBy: 'bob' }));
    expect(screen.queryByRole('button', { name: /Edit|Delete|Reject|Resubmit|reimbursed/ })).not.toBeInTheDocument();
  });

  it('owner cannot edit a reimbursed claim', () => {
    setup(inv({ uploadedBy: 'me', status: 'reimbursed', paidDate: '2026-11-12' }));
    expect(screen.queryByRole('button', { name: 'Edit invoice' })).not.toBeInTheDocument();
    expect(screen.getByText('Paid on 2026-11-12')).toBeInTheDocument();
  });

  it('company invoice: finance can edit, shows tagged people', () => {
    role = 'finance';
    setup(inv({ kind: 'company', status: undefined, uploadedBy: 'boss', uploaderName: 'Boss', relatedUids: ['bob'] }));
    expect(screen.getByText('Bob', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit invoice' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
