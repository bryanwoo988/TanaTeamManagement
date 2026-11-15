import { useT } from '../i18n';
import { normalizeMyPhone } from '../../shared/phone';

/** Local digits as typed or pasted (+60…, 0…, spaces) → "12-345 6789" / "11-2345 6789", capped. */
export function formatLocalPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('60')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, d.startsWith('11') ? 10 : 9);
  if (d.length <= 2) return d;
  const a = d.slice(0, 2);
  const rest = d.slice(2);
  const cut = d.startsWith('11') ? 4 : 3;
  return rest.length <= cut ? `${a}-${rest}` : `${a}-${rest.slice(0, cut)} ${rest.slice(cut)}`;
}

/** Accept the number with or without its leading 0 (the +60 is shown in front of the field). */
export function serverPhone(input: string): string | null {
  if (normalizeMyPhone(input).ok) return input.trim();
  const withZero = '0' + input.replace(/\D/g, '');
  return normalizeMyPhone(withZero).ok ? withZero : null;
}

/** Malaysian mobile field: fixed "+60" prefix, live formatting without the leading 0. */
export default function PhoneInput({ id, value, onChange }: { id: string; value: string; onChange: (formatted: string) => void }) {
  const { t } = useT();
  return (
    <div className="phone-field">
      <span className="phone-cc" aria-label={t('login.country')}><span aria-hidden>🇲🇾</span> +60</span>
      <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" placeholder={t('login.phonePlaceholder')}
        value={value} onChange={(e) => onChange(formatLocalPhone(e.target.value))} />
    </div>
  );
}
