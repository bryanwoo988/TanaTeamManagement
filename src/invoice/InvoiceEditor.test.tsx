import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const saveInvoice = vi.fn().mockResolvedValue('i1');
const listEventsAround = vi.fn().mockResolvedValue([]);
vi.mock('./data', () => ({ saveInvoice: (...a: unknown[]) => saveInvoice(...a), listEventsAround: (...a: unknown[]) => listEventsAround(...a), photoUrl: vi.fn().mockResolvedValue('u') }));
const compressImage = vi.fn();
vi.mock('./compress', () => ({ compressImage: (...a: unknown[]) => compressImage(...a) }));

import InvoiceEditor from './InvoiceEditor';
import Toaster from '../ui/Toaster';
import { setLang } from '../i18n';
import { dismissAll } from '../ui/toast';

const people = [{ uid: 'me', name: 'Me' }, { uid: 'bob', name: 'Bob' }];
const cats = ['Fuel', 'Parts'];
const base = { teamId: 't1', invoice: null, members: people, categories: cats, uploaderName: 'Me', onClose: () => {} };
const jpeg = new Blob(['j'], { type: 'image/jpeg' });
const pick = (label: string) => userEvent.upload(screen.getByLabelText(label), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));

beforeEach(() => { vi.clearAllMocks(); setLang('en'); dismissAll(); compressImage.mockResolvedValue(jpeg); saveInvoice.mockResolvedValue('i1'); listEventsAround.mockResolvedValue([]); });

describe('InvoiceEditor', () => {
  it('member: new defaults to a claim and offers no company option or related-people picker', () => {
    render(<InvoiceEditor {...base} canProcess={false} />);
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
    expect(screen.queryByText('Company invoice')).not.toBeInTheDocument();
    expect(screen.queryByText('Related people')).not.toBeInTheDocument();
  });

  it('finance sees both types and the related-people picker for a company invoice', async () => {
    render(<InvoiceEditor {...base} canProcess />);
    const type = screen.getByLabelText('Type');
    expect(type).toHaveValue('claim');
    expect(screen.getByRole('option', { name: 'Company invoice' })).toBeInTheDocument();
    expect(screen.queryByText('Related people')).not.toBeInTheDocument();
    await userEvent.selectOptions(type, 'company');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bob' }));
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '10');
    await pick('Choose from album');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveInvoice).toHaveBeenCalledWith('t1', null, expect.objectContaining({ kind: 'company', relatedUids: ['bob'] }), jpeg, expect.any(Function), expect.any(Object));
  });

  it('blocks a non-numeric amount', async () => {
    render(<InvoiceEditor {...base} canProcess={false} />);
    await pick('Take photo');
    await userEvent.type(screen.getByLabelText('Amount (RM)'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid amount');
    expect(saveInvoice).not.toHaveBeenCalled();
  });

  it('requires a photo on a new invoice', async () => {
    render(<InvoiceEditor {...base} canProcess={false} />);
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '12.50');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('add a photo');
    expect(saveInvoice).not.toHaveBeenCalled();
  });

  it('camera and album inputs: camera has capture, album does not', () => {
    render(<InvoiceEditor {...base} canProcess={false} />);
    expect(screen.getByLabelText('Take photo')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Choose from album')).not.toHaveAttribute('capture');
  });

  it('saves a claim in sen with the compressed photo and the typed fields', async () => {
    const onClose = vi.fn();
    render(<InvoiceEditor {...base} canProcess={false} onClose={onClose} />);
    await pick('Take photo');
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '1,250.5');
    await userEvent.type(screen.getByLabelText('Vendor'), ' Ah Seng ');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Parts');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveInvoice).toHaveBeenCalledWith('t1', null,
      { kind: 'claim', amountSen: 125050, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), vendor: 'Ah Seng', category: 'Parts', notes: '', relatedUids: [], uploaderName: 'Me' },
      jpeg, expect.any(Function), expect.any(Object));
    expect(onClose).toHaveBeenCalled();
  });

  it('an unreadable photo shows a message and is not attached', async () => {
    compressImage.mockRejectedValue(new Error('photo.unreadable'));
    render(<InvoiceEditor {...base} canProcess={false} />);
    await pick('Take photo');
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be read');
  });

  it('a failed save keeps everything the user typed and stays open', async () => {
    saveInvoice.mockRejectedValue(new Error('net'));
    const onClose = vi.fn();
    render(<><InvoiceEditor {...base} canProcess={false} onClose={onClose} /><Toaster /></>);
    await pick('Take photo');
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '9');
    await userEvent.type(screen.getByLabelText('Vendor'), 'Shop');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Amount (RM)')).toHaveValue('9');
    expect(screen.getByLabelText('Vendor')).toHaveValue('Shop');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveInvoice).toHaveBeenCalledTimes(2); // photo still attached, no re-pick needed
  });

  it('a retry after a failed save passes the same attempt state (no second upload)', async () => {
    saveInvoice.mockRejectedValueOnce(new Error('net'));
    render(<><InvoiceEditor {...base} canProcess={false} /><Toaster /></>);
    await pick('Take photo');
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveInvoice.mock.calls[1][5]).toBe(saveInvoice.mock.calls[0][5]);
  });

  it('requires a date', async () => {
    render(<InvoiceEditor {...base} canProcess={false} />);
    await pick('Take photo');
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '9');
    await userEvent.clear(screen.getByLabelText('Date'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('date');
    expect(saveInvoice).not.toHaveBeenCalled();
  });

  it('caps related people at 20', async () => {
    const many = Array.from({ length: 22 }, (_, i) => ({ uid: `u${i}`, name: `P${String(i).padStart(2, '0')}` }));
    render(<InvoiceEditor {...base} members={many} canProcess />);
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'company');
    for (const p of many) await userEvent.click(screen.getByRole('checkbox', { name: p.name }));
    expect(screen.getByRole('alert')).toHaveTextContent('20');
    expect(screen.getByRole('checkbox', { name: 'P21' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'P19' })).toBeChecked();
  });

  it('a too-large photo shows its own message', async () => {
    compressImage.mockRejectedValue(new Error('photo.tooLarge'));
    render(<InvoiceEditor {...base} canProcess={false} />);
    await pick('Take photo');
    expect(await screen.findByRole('alert')).toHaveTextContent('too large');
  });

  it('shows upload progress', async () => {
    saveInvoice.mockImplementation(async (_t, _i, _d, _p, onProgress: (f: number) => void) => { onProgress(0.4); return new Promise(() => {}); });
    render(<InvoiceEditor {...base} canProcess={false} />);
    await pick('Take photo');
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '40');
  });

  it('related work picker lists events around the date and saves eventId', async () => {
    listEventsAround.mockResolvedValue([{ id: 'e1', title: 'Spray', date: '2026-11-12' }]);
    render(<InvoiceEditor {...base} canProcess={false} />);
    await userEvent.selectOptions(await screen.findByLabelText('Related work (optional)'), 'e1');
    await pick('Take photo');
    await userEvent.type(screen.getByLabelText('Amount (RM)'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveInvoice.mock.calls[0][2]).toMatchObject({ eventId: 'e1' });
  });

  it('editing an existing invoice does not require a new photo and locks the type', async () => {
    const inv = { id: 'i1', kind: 'claim', amountSen: 1250, date: '2026-11-10', vendor: 'V', category: 'Fuel', notes: '', photoPath: 'p', uploadedBy: 'me', uploaderName: 'Me', relatedUids: [], status: 'pending' } as never;
    render(<InvoiceEditor {...base} invoice={inv} canProcess />);
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount (RM)')).toHaveValue('12.50');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveInvoice).toHaveBeenCalledWith('t1', 'i1', expect.objectContaining({ amountSen: 1250 }), undefined, expect.any(Function), expect.any(Object));
  });
});
