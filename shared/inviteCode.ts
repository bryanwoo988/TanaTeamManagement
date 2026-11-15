// No 0/1/I/L/O to avoid look-alikes.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE = /^[2-9A-HJKMNP-Z]{4}$/;

export function newInviteCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(rand() * ALPHABET.length))];
  return `TANA-${s}`;
}

/** Accepts "tana-7k3p" or "7k3p" (any case, surrounding space); returns canonical code or null. */
export function normalizeInviteCode(input: string): string | null {
  let s = input.trim().toUpperCase();
  if (s.startsWith('TANA-')) s = s.slice(5);
  return CODE_RE.test(s) ? `TANA-${s}` : null;
}
