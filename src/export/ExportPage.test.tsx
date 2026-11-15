import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

let role = 'member';
vi.mock('../team/TeamContext', () => ({ useTeams: () => ({ teams: [{ teamId: 't1', name: 'Ladang', role, status: 'active' }], member: () => ({ role, status: 'active' }) }) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'me' }, profile: { name: 'Me' } }) }));
const fetchEvents = vi.fn().mockResolvedValue([{ id: 'e', title: 'Spray', date: '2026-11-10', allDay: true, assignees: [], place: '', notes: '' }]);
const fetchMembers = vi.fn().mockResolvedValue([]);
vi.mock('../calendar/data', () => ({ fetchEvents: (...a: unknown[]) => fetchEvents(...a), fetchMembers: (...a: unknown[]) => fetchMembers(...a) }));
const fetchInvoices = vi.fn().mockResolvedValue([{ id: 'i', amountSen: 100 }]);
vi.mock('../invoice/data', () => ({ fetchInvoices: (...a: unknown[]) => fetchInvoices(...a), photoUrl: vi.fn() }));
const buildCalendarXlsx = vi.fn().mockResolvedValue(new Blob(['x']));
vi.mock('./xlsx', () => ({ buildCalendarXlsx: (...a: unknown[]) => buildCalendarXlsx(...a), buildInvoiceXlsx: vi.fn().mockResolvedValue(new Blob(['x'])) }));
vi.mock('./pdf', () => ({ buildCalendarPdf: vi.fn().mockResolvedValue(new Blob(['x'])), buildInvoicePdf: vi.fn().mockResolvedValue(new Blob(['x'])) }));
const shareOrDownload = vi.fn().mockResolvedValue('downloaded');
vi.mock('./share', () => ({ shareOrDownload: (...a: unknown[]) => shareOrDownload(...a) }));

import ExportPage from './ExportPage';
import { setLang } from '../i18n';

const setup = (path = '/team/t1/export') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/team/:teamId/export" element={<ExportPage />} /><Route path="/export" element={<ExportPage />} /></Routes></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); setLang('en'); role = 'member'; });

describe('ExportPage', () => {
  it('hides invoice export for members', () => {
    setup();
    expect(screen.queryByRole('radio', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Excel' })).toBeChecked();
  });
  it('shows invoice export for finance', () => {
    role = 'finance';
    setup();
    expect(screen.getByRole('radio', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Calendar' })).toBeChecked();
  });
  it('personal scope offers calendar only', () => {
    role = 'admin';
    setup('/export');
    expect(screen.queryByRole('radio', { name: 'Invoices' })).not.toBeInTheDocument();
  });
  it('exports a calendar xlsx with the tana-<team>-<from>_<to> filename', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(shareOrDownload).toHaveBeenCalled());
    expect(fetchEvents.mock.calls[0][0]).toEqual({ teamId: 't1' });
    expect(shareOrDownload.mock.calls[0][1]).toMatch(/^tana-Ladang-\d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
  it('finance exports invoices with the viewer scope all', async () => {
    role = 'finance';
    setup();
    await userEvent.click(screen.getByRole('radio', { name: 'Invoices' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(fetchInvoices).toHaveBeenCalled());
    expect(fetchInvoices.mock.calls[0][0]).toBe('t1');
    expect(fetchInvoices.mock.calls[0][2]).toEqual({ uid: 'me', all: true });
  });
});
