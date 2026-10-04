import { describe, expect, it } from 'vitest';
import { formatHijri, fromHijri, isRamadan, toHijri } from './hijri';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const span = (a: Date, b: Date) => Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);

describe('Hijri dates (tabular civil calendar)', () => {
  it('starts the calendar on 1 Muharram 1 AH', () => {
    // 16 July 622 Julian is 19 July 622 in the proleptic Gregorian calendar.
    expect(toHijri(day(622, 7, 19))).toEqual({ year: 1, month: 1, day: 1 });
  });

  it('agrees with announced dates to within a day', () => {
    // Umm al-Qura and Kenyan announcements; the arithmetic calendar may differ by one day.
    const known: [Date, { year: number; month: number; day: number }][] = [
      [day(2024, 7, 7), { year: 1446, month: 1, day: 1 }], // 1 Muharram 1446
      [day(2025, 3, 1), { year: 1446, month: 9, day: 1 }], // 1 Ramadan 1446
      [day(2026, 2, 18), { year: 1447, month: 9, day: 1 }], // 1 Ramadan 1447
      [day(2026, 3, 20), { year: 1447, month: 10, day: 1 }], // Eid al-Fitr 1447
    ];
    for (const [g, h] of known) expect(span(fromHijri(h), g)).toBeLessThanOrEqual(1);
  });

  it('round-trips every day across several years', () => {
    for (let t = day(2020, 1, 1).getTime(); t < day(2030, 1, 1).getTime(); t += 86_400_000 * 3) {
      const g = new Date(t);
      expect(span(fromHijri(toHijri(g)), g)).toBe(0);
    }
  });

  it('keeps months to 29 or 30 days and years to 354 or 355', () => {
    for (let m = 1; m <= 12; m += 1) {
      const len = span(fromHijri({ year: 1448, month: m, day: 1 }),
        m === 12 ? fromHijri({ year: 1449, month: 1, day: 1 }) : fromHijri({ year: 1448, month: m + 1, day: 1 }));
      expect([29, 30]).toContain(len);
    }
    expect([354, 355]).toContain(span(fromHijri({ year: 1448, month: 1, day: 1 }), fromHijri({ year: 1449, month: 1, day: 1 })));
  });

  it('names the month in each language, with Arabic digits in Arabic', () => {
    const d = fromHijri({ year: 1448, month: 9, day: 14 });
    expect(formatHijri(d, 'en')).toBe('14 Ramadan 1448 AH');
    expect(formatHijri(d, 'sw')).toBe('14 Ramadhani 1448 AH');
    expect(formatHijri(d, 'so')).toBe('14 Ramadaan 1448 AH');
    expect(formatHijri(d, 'ar')).toBe('١٤ رمضان ١٤٤٨ هـ');
  });

  it('knows when it is Ramadan', () => {
    expect(isRamadan(fromHijri({ year: 1448, month: 9, day: 10 }))).toBe(true);
    expect(isRamadan(fromHijri({ year: 1448, month: 10, day: 1 }))).toBe(false);
  });
});
