/** Parse an RM amount ("1,250.5") to sen. Returns null for non-positive or invalid input. */
export function parseRM(input: string): number | null {
  const s = input.replace(/[\s,]/g, '').replace(/^RM/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const sen = Math.round(parseFloat(s) * 100);
  return sen > 0 ? sen : null;
}

export function formatRM(sen: number): string {
  const neg = sen < 0;
  const abs = Math.abs(sen);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100).toString().padStart(2, '0');
  return `${neg ? '-' : ''}RM ${whole}.${cents}`;
}
