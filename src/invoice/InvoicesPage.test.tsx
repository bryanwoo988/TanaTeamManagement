import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

let feed: (rows: unknown[]) => void = () => {};
let fail: () => void = () => {};
const listInvoices = vi.fn((_t: string, _f: unknown, _m: unknown, cb: (r: unknown[]) => void, onError?: () => void) => { feed = cb; fail = () => onError?.(); return () => {}; });
vi.mock('./data', () => ({ listInvoices: (...a: unknown[]) => (listInvoices as (...x: unknown[]) => unknown)(...a) }));
let role = 'member';
let canUpload: boolean | undefined;
vi.mock('../team/TeamContext', () => ({ useTeams: () => ({ member: () => ({ role, status: 'active', ...(canUpload !== undefined ? { canUpload } : {}) }) }) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'me' }, profile: { name: 'Me' } }) }));
vi.mock('../team/TeamSwitcher', () => ({ default: () => <div>switcher</div> }));
vi.mock('./useTeamInfo', () => ({ useTeamInfo: () => ({ categories: ['Fuel'], members: [{ uid: 'me', name: 'Me' }] }) }));
vi.mock('./InvoiceEditor', () => ({ default: (p: { canProcess: boolean }) => <div>editor canProcess={String(p.canProcess)}</div> }));

import InvoicesPage from './InvoicesPage';
import { setLang } from '../i18n';

const row = (id: string, over = {}) => ({ id, kind: 'claim', amountSen: 1250, date: '2026-11-10', vendor: 'Ah Seng', category: 'Fuel', notes: '', photoPath: 'p', uploadedBy: 'me', uploaderName: 'Me', relatedUids: [], status: 'pending', ...over });
const setup = () => render(<MemoryRouter initialEntries={['/team/t1/invoices']}><Routes><Route path="/team/:teamId/invoices" element={<InvoicesPage />} /></Routes></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); setLang('en'); role = 'member'; canUpload = undefined; });

describe('InvoicesPage', () => {
  it('member with uploads allowed (default) can open the editor; no note', async () => {
    setup();
    const btn = screen.getByRole('button', { name: 'New' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(btn);
    expect(screen.getByText(/editor/)).toBeInTheDocument();
    expect(screen.queryByText('Your admin has turned off receipt uploads for you.')).toBeNull();
  });

  it('member with uploads turned off sees New greyed out and disabled, with a note; list still loads', async () => {
    canUpload = false;
    setup();
    const btn = screen.getByRole('button', { name: 'New' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Your admin has turned off receipt uploads for you.')).toBeInTheDocument();
    await userEvent.click(btn);
    expect(screen.queryByText(/editor/)).toBeNull();
    expect(listInvoices).toHaveBeenCalled();
  });

  it('finance is unaffected by canUpload false', async () => {
    role = 'finance'; canUpload = false;
    setup();
    const btn = screen.getByRole('button', { name: 'New' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('Your admin has turned off receipt uploads for you.')).toBeNull();
  });

  it('top bar has no bell: notifications live in the bottom bar', () => {
    setup();
    expect(screen.queryByText('bell')).toBeNull();
  });

  it('member subscribes as non-finance and sees only what the query returns', () => {
    setup();
    expect(listInvoices.mock.calls[0].slice(0, 3)).toEqual(['t1', {}, { uid: 'me', all: false }]);
    act(() => feed([row('a'), row('b', { kind: 'company', status: undefined, uploadedBy: 'boss', relatedUids: ['me'], vendor: 'Seeds Co', amountSen: 99900 })]));
    expect(screen.getByText('Ah Seng')).toBeInTheDocument();
    expect(screen.getByText('Seeds Co')).toBeInTheDocument();
    expect(screen.getByText('RM 12.50')).toBeInTheDocument();
    expect(screen.getByText('Pending', { selector: '.pill' })).toBeInTheDocument();
  });

  it('finance subscribes to everything and no categories link for non-admin', () => {
    role = 'finance';
    setup();
    expect(listInvoices.mock.calls[0][2]).toEqual({ uid: 'me', all: true });
    expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/team/t1/export');
    expect(screen.queryByRole('link', { name: 'Invoice categories' })).not.toBeInTheDocument();
  });

  it('admin gets the categories link', () => {
    role = 'admin';
    setup();
    expect(screen.getByRole('link', { name: 'Invoice categories' })).toHaveAttribute('href', '/team/t1/invoices/categories');
  });

  it('subscribes once; chips for type, status, mine and a folded date range narrow the shown rows', async () => {
    setup();
    act(() => feed([row('a', { vendor: 'V-A' }), row('b', { kind: 'company', status: undefined, vendor: 'V-B', date: '2026-11-20', uploadedBy: 'boss' }), row('c', { status: 'rejected', vendor: 'V-C', date: '2026-10-01' })]));
    const type = screen.getByRole('group', { name: 'Type' });
    const st = screen.getByRole('group', { name: 'Status' });
    await userEvent.click(within(type).getByRole('button', { name: 'Company invoice' }));
    expect(screen.queryByText('V-A')).not.toBeInTheDocument();
    expect(screen.getByText('V-B')).toBeInTheDocument();
    await userEvent.click(within(type).getByRole('button', { name: 'All' }));
    await userEvent.click(within(type).getByRole('button', { name: 'Mine' }));
    expect(screen.queryByText('V-B')).not.toBeInTheDocument();
    expect(screen.getByText('V-A')).toBeInTheDocument();
    await userEvent.click(within(type).getByRole('button', { name: 'Mine' }));
    await userEvent.click(within(st).getByRole('button', { name: 'Rejected' }));
    expect(screen.getByText('V-C')).toBeInTheDocument();
    expect(screen.queryByText('V-A')).not.toBeInTheDocument();
    await userEvent.click(within(st).getByRole('button', { name: 'Any status' }));
    expect(screen.queryByLabelText('From')).toBeNull();
    await userEvent.click(within(st).getByRole('button', { name: 'Date' }));
    await userEvent.type(screen.getByLabelText('From'), '2026-11-01');
    expect(screen.queryByText('V-C')).not.toBeInTheDocument();
    expect(screen.getByText('V-A')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear dates' }));
    expect(screen.getByText('V-C')).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledTimes(1);
  });

  it('shows the count and total of what is shown, grouped by month newest first; finance also sees pending', () => {
    role = 'finance';
    setup();
    act(() => feed([row('a', { amountSen: 1000, date: '2026-10-05', vendor: 'Old' }), row('b', { amountSen: 2550, status: 'reimbursed', vendor: 'New' })]));
    const summary = screen.getByTestId('inv-summary');
    expect(summary).toHaveTextContent('2 items · Total');
    expect(summary).toHaveTextContent('RM 35.50');
    expect(summary).toHaveTextContent('Pending reimbursement: RM 10.00');
    const heads = document.querySelectorAll('.inv-month-head');
    expect(heads).toHaveLength(2);
    expect(heads[0]).toHaveTextContent('November 2026');
    expect(heads[0]).toHaveTextContent('RM 25.50');
    expect(heads[1]).toHaveTextContent('October 2026');
  });

  it('members do not see the pending total or the export button', () => {
    setup();
    act(() => feed([row('a')]));
    expect(screen.getByTestId('inv-summary')).not.toHaveTextContent('Pending reimbursement');
    expect(screen.queryByRole('link', { name: 'Export' })).toBeNull();
  });

  it('a listener error shows an error, not an empty list', () => {
    setup();
    act(() => fail());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });

  it('rows link to the detail page; New opens the editor', async () => {
    setup();
    act(() => feed([row('a')]));
    expect(screen.getByRole('link', { name: /Ah Seng/ })).toHaveAttribute('href', '/team/t1/invoices/a');
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText('editor canProcess=false')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    setup();
    act(() => feed([]));
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });
});
