const TZ = 'Asia/Kuala_Lumpur';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** YYYY-MM-DD in Kuala Lumpur time. */
export function klDate(d: Date): string {
  return dateFmt.format(d);
}

/** HH:MM (24h) in Kuala Lumpur time. */
export function klTime(d: Date): string {
  return timeFmt.format(d);
}

/** Add n days (may be negative) to a YYYY-MM-DD string. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Minutes since midnight for an HH:MM string. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
