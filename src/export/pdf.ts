import { calendarRows, exportLabels, invoiceRows, needsCanvas } from '../../shared/export';
import { formatRM } from '../../shared/money';
import type { EventDoc, InvoiceDoc, Lang, MemberDoc } from '../../shared/types';

/**
 * PDF layout. jsPDF's built-in fonts cannot draw Chinese, and a CJK font file would add megabytes, so:
 * - Latin-only documents use real Helvetica text (small, selectable).
 * - Documents with any character beyond Latin-1 (Chinese etc.) draw each page's text onto a canvas with the
 *   device's own fonts and embed the page as an image. Receipt photos are still placed as separate images.
 * Colours are always dark-on-white, whatever the app theme.
 */
const PAGE_W = 210, PAGE_H = 297, MARGIN = 14, CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 4.4, PAD = 1.6;
const PX_PER_MM = 8;
const PT_MM = 25.4 / 72;
const CANVAS_FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei","Hiragino Sans GB",system-ui,sans-serif';

export interface LoadedImage { dataUrl: string; width: number; height: number }
export interface PdfOptions {
  /** Fetch and decode a photo; reject when it cannot be had. */
  loadImage?: (url: string) => Promise<LoadedImage>;
  /** Test seam: where page canvases come from. */
  canvasFactory?: () => HTMLCanvasElement;
}

interface Col { label: string; width: number; right?: boolean }
type Gray = 'ink' | 'muted';
const GRAY: Record<Gray, number> = { ink: 20, muted: 110 };

class Painter {
  private doc: import('jspdf').jsPDF;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pending: { dataUrl: string; x: number; y: number; w: number; h: number }[] = [];
  constructor(jsPDF: typeof import('jspdf').jsPDF, private canvasFactory: (() => HTMLCanvasElement) | null) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    this.beginCanvas();
  }

  private beginCanvas() {
    if (!this.canvasFactory) return;
    this.canvas = this.canvasFactory();
    this.canvas.width = PAGE_W * PX_PER_MM;
    this.canvas.height = PAGE_H * PX_PER_MM;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Put the finished canvas (and the photos waiting on this page) into the document. */
  private flush() {
    if (this.canvas) this.doc.addImage(this.canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, PAGE_W, PAGE_H);
    for (const im of this.pending) this.doc.addImage(im.dataUrl, /^data:image\/png/.test(im.dataUrl) ? 'PNG' : 'JPEG', im.x, im.y, im.w, im.h);
    this.pending = [];
  }

  private font(size: number, bold: boolean): string {
    return `${bold ? 'bold ' : ''}${size * PT_MM * PX_PER_MM}px ${CANVAS_FONT}`;
  }

  measure(text: string, size: number, bold = false): number {
    if (this.ctx) {
      this.ctx.font = this.font(size, bold);
      return this.ctx.measureText(text).width / PX_PER_MM;
    }
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    return this.doc.getTextWidth(text);
  }

  text(text: string, x: number, y: number, o: { size?: number; bold?: boolean; tone?: Gray; right?: boolean } = {}) {
    const size = o.size ?? 9, bold = !!o.bold, g = GRAY[o.tone ?? 'ink'];
    if (this.ctx) {
      this.ctx.font = this.font(size, bold);
      this.ctx.fillStyle = `rgb(${g},${g},${g})`;
      this.ctx.textAlign = o.right ? 'right' : 'left';
      this.ctx.textBaseline = 'alphabetic';
      this.ctx.fillText(text, x * PX_PER_MM, y * PX_PER_MM);
      return;
    }
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(g);
    this.doc.text(text, x, y, o.right ? { align: 'right' } : undefined);
  }

  rule(y: number) {
    if (this.ctx) {
      this.ctx.strokeStyle = 'rgb(190,190,190)';
      this.ctx.lineWidth = 0.2 * PX_PER_MM;
      this.ctx.beginPath();
      this.ctx.moveTo(MARGIN * PX_PER_MM, y * PX_PER_MM);
      this.ctx.lineTo((PAGE_W - MARGIN) * PX_PER_MM, y * PX_PER_MM);
      this.ctx.stroke();
      return;
    }
    this.doc.setDrawColor(190);
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  }

  image(dataUrl: string, x: number, y: number, w: number, h: number) {
    this.pending.push({ dataUrl, x, y, w, h });
  }

  newPage() {
    this.flush();
    this.doc.addPage();
    this.beginCanvas();
  }

  finish(): Blob {
    this.flush();
    return this.doc.output('blob');
  }
}

/** Break text into lines no wider than `width`, at spaces when possible, otherwise between any two characters. */
function wrap(p: Painter, text: string, width: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of (text || '').split('\n')) {
    let line = '';
    for (const ch of para) {
      if (p.measure(line + ch, size, bold) <= width || !line) { line += ch; continue; }
      const sp = line.lastIndexOf(' ');
      if (sp > 0 && ch !== ' ') { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
      else { out.push(line); line = ch === ' ' ? '' : ch; }
    }
    out.push(line);
  }
  return out;
}

class Flow {
  y = MARGIN;
  constructor(private p: Painter, private title: string, private cols: Col[]) {
    p.text(title, MARGIN, this.y + 5, { size: 14, bold: true });
    this.y += 10;
  }
  subtitle(s: string) {
    this.p.text(s, MARGIN, this.y, { size: 9, tone: 'muted' });
    this.y += 6;
  }
  private colX(i: number) { return MARGIN + this.cols.slice(0, i).reduce((s, c) => s + c.width, 0); }
  header() {
    this.cols.forEach((c, i) => this.p.text(c.label, c.right ? this.colX(i) + c.width - PAD : this.colX(i) + PAD, this.y + LINE_H, { bold: true, right: c.right }));
    this.y += LINE_H + PAD;
    this.p.rule(this.y);
  }
  row(cells: string[], bold = false) {
    const lines = cells.map((c, i) => wrap(this.p, c, this.cols[i].width - PAD * 2, 9, bold));
    const h = Math.max(...lines.map((l) => l.length)) * LINE_H + PAD * 2;
    if (this.y + h > PAGE_H - MARGIN) {
      this.p.newPage();
      this.y = MARGIN;
      this.header();
    }
    lines.forEach((ls, i) => ls.forEach((l, k) => this.p.text(l, this.cols[i].right ? this.colX(i) + this.cols[i].width - PAD : this.colX(i) + PAD, this.y + PAD + LINE_H * (k + 1) - 1, { bold, right: this.cols[i].right })));
    this.y += h;
    this.p.rule(this.y);
  }
}

async function start(texts: string[], opts: PdfOptions): Promise<Painter> {
  const { jsPDF } = await import('jspdf');
  const canvasFactory = needsCanvas(texts) ? (opts.canvasFactory ?? (() => document.createElement('canvas'))) : null;
  return new Painter(jsPDF, canvasFactory);
}

export async function buildCalendarPdf(events: (EventDoc & { id?: string })[], members: Pick<MemberDoc, 'uid' | 'name'>[], lang: Lang, from: string, to: string, opts: PdfOptions = {}): Promise<Blob> {
  const L = exportLabels(lang).cal;
  const rows = calendarRows(events, members, lang);
  const p = await start(rows.flatMap((r) => Object.values(r)).concat(Object.values(L)), opts);
  const cols: Col[] = [
    { label: L.date, width: 22 }, { label: L.time, width: 26 }, { label: L.event, width: 48 },
    { label: L.assignees, width: 30 }, { label: L.place, width: 28 }, { label: L.notes, width: CONTENT_W - 154 },
  ];
  const f = new Flow(p, L.title, cols);
  f.subtitle(`${from} - ${to}`);
  f.header();
  for (const r of rows) f.row([r.date, r.time, r.title, r.assignees, r.place, r.notes]);
  return p.finish();
}

/** Amount without the RM prefix (the column header says RM): 1,234.50 */
const money = (sen: number) => formatRM(sen).replace(/^-?RM /, (m) => (m.startsWith('-') ? '-' : ''));

async function defaultLoadImage(url: string): Promise<LoadedImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(blob); });
  const dims = await new Promise<{ w: number; h: number }>((ok, bad) => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => bad(new Error('decode')); im.src = dataUrl; });
  return { dataUrl, width: dims.w, height: dims.h };
}

/** Summary table with the total, then one receipt per page. A photo that cannot be loaded gets a "photo unavailable" page. */
export async function buildInvoicePdf(invoices: (InvoiceDoc & { id: string })[], photoUrls: Record<string, string | undefined>, lang: Lang, opts: PdfOptions = {}): Promise<Blob> {
  const L = exportLabels(lang).inv;
  const { rows, totalSen } = invoiceRows(invoices, lang);
  const texts = rows.flatMap((r) => [r.vendor, r.category, r.uploader, r.notes, r.kind, r.status]).concat(Object.values(L));
  const p = await start(texts, opts);
  const cols: Col[] = [
    { label: L.date, width: 22 }, { label: L.kind, width: 28 }, { label: L.vendor, width: 42 },
    { label: L.category, width: 32 }, { label: L.status, width: 26 }, { label: L.amount, width: CONTENT_W - 150, right: true },
  ];
  const f = new Flow(p, L.title, cols);
  f.header();
  for (const r of rows) f.row([r.date, r.kind, r.vendor, r.category, r.status, money(r.amountSen)]);
  f.row(['', '', '', '', L.total, money(totalSen)], true);

  const load = opts.loadImage ?? defaultLoadImage;
  for (const r of rows) {
    p.newPage();
    let y = MARGIN + 5;
    p.text(`${L.receipt}: ${r.vendor}`, MARGIN, y, { size: 13, bold: true });
    y += 6;
    for (const line of [`${r.date}  |  ${r.category}  |  ${r.amountText}`, `${L.uploader}: ${r.uploader}`, ...(r.notes ? [r.notes] : [])]) {
      for (const l of wrap(p, line, CONTENT_W, 9)) { p.text(l, MARGIN, y, { tone: 'muted' }); y += LINE_H; }
    }
    y += 3;
    let drawn = false;
    const url = photoUrls[r.id];
    if (url) {
      try {
        const im = await load(url);
        const maxW = CONTENT_W, maxH = PAGE_H - MARGIN - y;
        const k = Math.min(maxW / im.width, maxH / im.height);
        p.image(im.dataUrl, MARGIN, y, im.width * k, im.height * k);
        drawn = true;
      } catch {
        // fall through to the unavailable note
      }
    }
    if (!drawn) p.text(L.photoUnavailable, MARGIN, y + 8, { size: 11, tone: 'muted' });
  }
  return p.finish();
}
