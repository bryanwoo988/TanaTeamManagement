import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

let feed: (rows: unknown[]) => void = () => {};
const listInvoices = vi.fn((_t: string, _f: unknown, _m: unknown, cb: (r: unknown[]) => void) => { feed = cb; return () => {}; });
vi.mock('./data', () => ({ listInvoices: (...a: unknown[]) => (listInvoices as (...x: unknown[]) => unknown)(...a) }));
let role = 'member';
vi.mock('../team/TeamContext', () => ({ useTeams: () => ({ member: () => ({ role, status: 'active' }) }) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'me' }, profile: { name: 'Me' } }) }));
vi.mock('../notify/Bell', () => ({ default: () => <div>bell</div> }));
vi.mock('../team/TeamSwitcher', () => ({ default: () => <div>switcher</div> }));
vi.mock('./useTeamInfo', () => ({ useTeamInfo: () => ({ categories: ['Fuel'], members: [{ uid: 'me', name: 'Me' }] }) }));
vi.mock('./InvoiceEditor', () => ({ default: (p: { canProcess: boolean }) => <div>editor canProcess={String(p.canProcess)}</div> }));

import InvoicesPage from './InvoicesPage';
import { setLang } from '../i18n';

const row = (id: string, over = {}) => ({ id, kind: 'claim', amountSen: 1250, date: '2026-11-10', vendor: 'Ah Seng', category: 'Fuel', notes: '', photoPath: 'p', uploadedBy: 'me', uploaderName: 'Me', relatedUids: [], status: 'pending', ...over });
const setup = () => render(<MemoryRouter initialEntries={['/team/t1/invoices']}><Routes><Route path="/team/:teamId/invoices" element={<InvoicesPage />} /></Routes></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); setLang('en'); role = 'member'; });

describe('InvoicesPage', () => {
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
    expect(screen.queryByRole('link', { name: 'Invoice categories' })).not.toBeInTheDocument();
  });

  it('admin gets the categories link', () => {
    role = 'admin';
    setup();
    expect(screen.getByRole('link', { name: 'Invoice categories' })).toHaveAttribute('href', '/team/t1/invoices/categories');
  });

  it('filters by type, status and date re-subscribe with those filters', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'company');
    expect(listInvoices.mock.lastCall![1]).toEqual({ kind: 'company' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'rejected');
    expect(listInvoices.mock.lastCall![1]).toEqual({ kind: 'company', status: 'rejected' });
    await userEvent.type(screen.getByLabelText('From'), '2026-11-01');
    expect(listInvoices.mock.lastCall![1]).toEqual({ kind: 'company', status: 'rejected', from: '2026-11-01' });
  });

  it('rows link to the detail page; New opens the editor', async () => {
    setup();
    act(() => feed([row('a')]));
    expect(within(screen.getByRole('list')).getByRole('link')).toHaveAttribute('href', '/team/t1/invoices/a');
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText('editor canProcess=false')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    setup();
    act(() => feed([]));
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });
});
