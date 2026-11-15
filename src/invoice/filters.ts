import type { InvoiceFilters, InvoiceRow } from './data';

export function applyInvoiceFilters(rows: InvoiceRow[], f: InvoiceFilters): InvoiceRow[] {
  return rows.filter((r) => (!f.kind || r.kind === f.kind) && (!f.status || r.status === f.status)
    && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to));
}
