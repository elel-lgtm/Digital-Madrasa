import { ADMISSION_NO_REGEX, DEFAULT_CURRENCY } from './constants';

/** Money is stored as a number of major units (KES) with 2dp precision. */
export function formatMoney(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  locale = 'en-KE',
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

export function parseAdmissionNo(
  value: string,
): { year: number; sequence: number } | null {
  const normalised = value.trim().toUpperCase();
  if (!ADMISSION_NO_REGEX.test(normalised)) return null;
  const parts = normalised.split('-');
  const year = Number(parts[1]);
  const sequence = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(sequence)) return null;
  return { year, sequence };
}

/**
 * Formats as the user types: `dm20260042` becomes `DM-2026-0042`. Purely a
 * convenience — the value is still validated by schema before it is sent.
 */
export function maskAdmissionNo(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = cleaned.startsWith('DM') ? cleaned.slice(2) : cleaned.replace(/^D?M?/, '');
  const year = digits.slice(0, 4);
  const seq = digits.slice(4, 8);
  if (!year) return raw ? 'DM-' : '';
  if (!seq) return `DM-${year}`;
  return `DM-${year}-${seq}`;
}

export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Kenya's international dialling code, shown as a fixed affix on phone inputs. */
export const KENYA_DIAL_CODE = '+254';

/** Digits a Kenyan subscriber number carries after the country code. */
export const KENYA_SUBSCRIBER_DIGITS = 9;

/** Normalises Kenyan numbers typed as 07…, 2547…, +2547… into E.164. */
export function normaliseKenyanPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return input.startsWith('+') ? input : `+${digits}`;
}

/**
 * Reduces any way a Kenyan number might be typed or pasted down to the nine
 * subscriber digits, for display in a field that renders +254 as a fixed
 * affix. Handles "0712…", "254712…", "+254 712 345 678" and bare "712…".
 */
export function toLocalKenyanDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('254')) digits = digits.slice(3);
  // A leading zero is the national trunk prefix, which E.164 drops. Stripping
  // it repeatedly is safe: no Kenyan subscriber number begins with 0.
  while (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, KENYA_SUBSCRIBER_DIGITS);
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, phone.length - 5)}•••${phone.slice(-2)}`;
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function isoDate(date: Date = new Date()): string {
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return clamp(Math.round((part / total) * 100), 0, 100);
}
