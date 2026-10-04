/**
 * Hijri (Islamic) dates.
 *
 * The tabular, or civil, Islamic calendar: 30-year cycles with leap years 2,
 * 5, 7, 10, 13, 16, 18, 21, 24, 26 and 29, months alternating 30 and 29 days.
 * It is the arithmetic calendar computers use where moon sighting cannot be
 * known in advance, so it can differ by a day from the date a local committee
 * announces. The app labels it accordingly; it never decides when Ramadan
 * starts for anyone.
 *
 * Pure arithmetic on Julian day numbers: no Intl calendar support needed, so
 * it gives the same answer on every phone, in the browser and on the server.
 */

export interface HijriDate {
  year: number;
  /** 1 = Muharram … 9 = Ramadan … 12 = Dhu al-Hijjah. */
  month: number;
  day: number;
}

/** Julian day number of 1 Muharram 1 AH (16 July 622, Julian calendar). */
const EPOCH = 1948439.5;

function gregorianToJd(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4)
    - Math.floor(y / 100) + Math.floor(y / 400) - 32045 - 0.5;
}

function jdToGregorian(jd: number): { year: number; month: number; day: number } {
  const z = Math.floor(jd + 0.5);
  const a = z + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

function hijriToJd(year: number, month: number, day: number): number {
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354
    + Math.floor((3 + 11 * year) / 30) + EPOCH - 1;
}

/** The Hijri date of a calendar day. Times are ignored; the local date counts. */
export function toHijri(date: Date): HijriDate {
  const jd = gregorianToJd(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const days = Math.floor(jd) + 0.5;
  const year = Math.floor((30 * (days - EPOCH) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((days - (29 + hijriToJd(year, 1, 1))) / 29.5) + 1);
  const day = days - hijriToJd(year, month, 1) + 1;
  return { year, month, day };
}

/** The Gregorian day on which a Hijri date falls. */
export function fromHijri({ year, month, day }: HijriDate): Date {
  const g = jdToGregorian(hijriToJd(year, month, day));
  return new Date(g.year, g.month - 1, g.day);
}

const MONTHS: Record<'en' | 'sw' | 'so' | 'ar', string[]> = {
  en: ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah',
    'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'],
  sw: ['Muharram', 'Safar', 'Rabiul Awwal', 'Rabiul Akhir', 'Jumadal Ula', 'Jumadal Akhira',
    'Rajab', 'Shaaban', 'Ramadhani', 'Shawwal', 'Dhul Qaada', 'Dhul Hijja'],
  so: ['Muxarram', 'Safar', 'Rabiicul Awal', 'Rabiicul Aakhir', 'Jumaadal Uulaa', 'Jumaadal Aakhir',
    'Rajab', 'Shacbaan', 'Ramadaan', 'Shawaal', 'Dulqacda', 'Dulxijja'],
  ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
    'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
};

/** "14 Rabi al-Thani 1448 AH", or "١٤ ربيع الآخر ١٤٤٨ هـ" in Arabic. */
export function formatHijri(date: Date | string, locale: string = 'en'): string {
  const h = toHijri(typeof date === 'string' ? new Date(date) : date);
  const lang = (['en', 'sw', 'so', 'ar'] as const).find((l) => locale.startsWith(l)) ?? 'en';
  const month = MONTHS[lang][h.month - 1];
  if (lang === 'ar') {
    const digits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'.charAt(Number(d)));
    return `${digits(h.day)} ${month} ${digits(h.year)} هـ`;
  }
  return `${h.day} ${month} ${h.year} AH`;
}

/** True during the month of Ramadan (by the civil calendar). */
export function isRamadan(date: Date = new Date()): boolean {
  return toHijri(date).month === 9;
}
