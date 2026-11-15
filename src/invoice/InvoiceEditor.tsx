import { useEffect, useState, type ChangeEvent } from 'react';
import { useT } from '../i18n';
import { klDate } from '../../shared/dates';
import { parseRM } from '../../shared/money';
import type { InvoiceKind } from '../../shared/types';
import AsyncButton from '../ui/AsyncButton';
import { toast, toastError } from '../ui/toast';
import { compressImage } from './compress';
import { listEventsAround, photoUrl, saveInvoice, type InvoiceRow } from './data';

const MAX_SEN = 100_000_000;

/** Create or edit one invoice/claim in a bottom sheet. Form data is kept when saving fails. */
export default function InvoiceEditor({ teamId, invoice, canProcess, members, categories, uploaderName, onClose }: {
  teamId: string;
  invoice: InvoiceRow | null;
  /** Finance/admin: may create company invoices and tick related people. */
  canProcess: boolean;
  members: { uid: string; name: string }[];
  categories: string[];
  uploaderName: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<InvoiceKind>(invoice?.kind ?? 'claim');
  const [amount, setAmount] = useState(invoice ? (invoice.amountSen / 100).toFixed(2) : '');
  const [date, setDate] = useState(invoice?.date ?? klDate(new Date()));
  const [vendor, setVendor] = useState(invoice?.vendor ?? '');
  const [category, setCategory] = useState(invoice?.category ?? categories[0] ?? '');
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [related, setRelated] = useState<string[]>(invoice?.relatedUids ?? []);
  const [eventId, setEventId] = useState(invoice?.eventId ?? '');
  const [events, setEvents] = useState<{ id: string; title: string; date: string }[]>([]);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listEventsAround(teamId, date).then((l) => live && setEvents(l.sort((a, b) => a.date.localeCompare(b.date)))).catch(() => live && setEvents([]));
    return () => { live = false; };
  }, [teamId, date]);

  // Show the saved photo while editing until a new one is picked.
  useEffect(() => {
    if (!invoice || photo) return;
    let live = true;
    photoUrl(invoice.photoPath).then((u) => live && setPreview(u)).catch(() => {});
    return () => { live = false; };
  }, [invoice, photo]);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    setReading(true);
    try {
      const out = await compressImage(file);
      setPhoto(out);
      setPreview(typeof URL.createObjectURL === 'function' ? URL.createObjectURL(out) : null);
    } catch {
      setErr(t('photo.unreadable'));
    } finally {
      setReading(false);
    }
  }

  function fail(msg: string): never {
    setErr(msg);
    throw new Error(msg);
  }

  async function save() {
    setErr(null);
    const sen = parseRM(amount);
    if (sen === null) fail(t('inv.amountInvalid'));
    if (sen > MAX_SEN) fail(t('inv.amountTooBig'));
    if (!invoice && !photo) fail(t('inv.photoRequired'));
    try {
      setProgress(0);
      await saveInvoice(teamId, invoice?.id ?? null, {
        kind, amountSen: sen, date, vendor: vendor.trim(), category, notes: notes.trim(),
        relatedUids: kind === 'company' ? related : [], ...(eventId ? { eventId } : {}), uploaderName,
      }, photo ?? undefined, (f) => setProgress(f));
    } catch (e) {
      setProgress(null);
      if ((e as Error).message === 'offline') toast({ kind: 'err', title: t('ui.errorTitle'), body: t('inv.needNetwork') });
      else toastError();
      throw e;
    }
    setProgress(null);
    toast({ kind: 'ok', title: t('inv.saved') });
    onClose();
  }

  const cats = category && !categories.includes(category) ? [category, ...categories] : categories;
  const pct = Math.round((progress ?? 0) * 100);
  const title = invoice ? t('inv.edit') : t('inv.new');

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <h2 className="sheet-title">{title}</h2>
        <div className="stack">
          {canProcess && !invoice && (
            <label>{t('inv.kind')}
              <select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind)}>
                <option value="claim">{t('inv.kind.claim')}</option>
                <option value="company">{t('inv.kind.company')}</option>
              </select>
            </label>
          )}
          <label>{t('inv.amount')}<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>{t('inv.date')}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>{t('inv.vendor')}<input value={vendor} maxLength={120} onChange={(e) => setVendor(e.target.value)} /></label>
          <label>{t('inv.category')}
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>{t('inv.notes')}<textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} /></label>
          {(events.length > 0 || eventId) && (
            <label>{t('inv.relatedWork')}
              <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">{t('inv.none')}</option>
                {eventId && !events.some((x) => x.id === eventId) && <option value={eventId}>…</option>}
                {events.map((x) => <option key={x.id} value={x.id}>{x.date} {x.title}</option>)}
              </select>
            </label>
          )}
          {canProcess && kind === 'company' && (
            <fieldset>
              <legend>{t('inv.relatedPeople')}</legend>
              {members.map((p) => (
                <label key={p.uid} className="check">
                  <input type="checkbox" checked={related.includes(p.uid)} onChange={() => setRelated((r) => (r.includes(p.uid) ? r.filter((x) => x !== p.uid) : [...r, p.uid]))} />{p.name}
                </label>
              ))}
            </fieldset>
          )}
          <div className="photo-pick">
            <span>{t('inv.photo')}</span>
            {preview && <img className="photo-preview" src={preview} alt="" />}
            <div className="row">
              <label className="btn">{t('inv.photoCamera')}<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={pick} /></label>
              <label className="btn">{t('inv.photoAlbum')}<input className="sr-only" type="file" accept="image/*" onChange={pick} /></label>
            </div>
            {reading && <p className="muted">{t('inv.photoReading')}</p>}
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          {progress !== null && (
            <div>
              <progress max={100} value={pct} aria-label={t('inv.uploading', { pct })} />
              <p className="muted small">{t('inv.uploading', { pct })}</p>
            </div>
          )}
          <AsyncButton disabled={reading} onClick={save}>{t('save')}</AsyncButton>
          <button type="button" className="btn block" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
