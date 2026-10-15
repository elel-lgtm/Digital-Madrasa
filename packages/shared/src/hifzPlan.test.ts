import { describe, expect, it } from 'vitest';
import { dailyHifzPlan, type PlanRow } from './hifzPlan';

const today = new Date('2026-10-04T08:00:00Z');
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString();
const row = (surahNo: number, status: PlanRow['status'], revised: number | null, extra: Partial<PlanRow> = {}): PlanRow => ({
  surahNo, ayahNo: 1, status, lastRevisedAt: revised === null ? null : daysAgo(revised), nextReviewAt: null, ...extra,
});

describe('daily hifz plan (sabaq, sabqi, manzil)', () => {
  it('starts a new pupil at An-Nas, a short surah taken whole', () => {
    const plan = dailyHifzPlan([], today);
    expect(plan.sabaq).toEqual({ surahNo: 114, surahName: expect.any(String), fromAyah: 1, toAyah: 6 });
    expect(plan.sabqi).toEqual([]);
    expect(plan.manzil).toEqual([]);
  });

  it('continues the surah being learned from the next ayah', () => {
    const plan = dailyHifzPlan([row(78, 'learning', 1, { ayahNo: 10 })], today);
    expect(plan.sabaq).toMatchObject({ surahNo: 78, fromAyah: 11, toAyah: 15 });
    // What is already learned of it is revised first.
    expect(plan.sabqi[0]).toMatchObject({ surahNo: 78, fromAyah: 1, toAyah: 10 });
  });

  it('never runs past the end of a surah', () => {
    const plan = dailyHifzPlan([row(112, 'learning', 0, { ayahNo: 3 })], today, { newAyahsPerDay: 5 });
    expect(plan.sabaq).toMatchObject({ surahNo: 112, fromAyah: 4, toAyah: 4 });
  });

  it('moves on to the next surah after the ones already memorised', () => {
    const plan = dailyHifzPlan([row(114, 'memorised', 2), row(113, 'mastered', 3), row(112, 'memorised', 5)], today);
    expect(plan.sabaq?.surahNo).toBe(111);
  });

  it('puts recent memorisation in sabqi, newest first, and older in manzil', () => {
    const rows = [row(114, 'mastered', 60), row(113, 'mastered', 40), row(112, 'memorised', 3), row(111, 'memorised', 1)];
    const plan = dailyHifzPlan(rows, today);
    expect(plan.sabqi.map((p) => p.surahNo)).toEqual([111, 112]);
    expect(plan.manzil.map((p) => p.surahNo)).toEqual(expect.arrayContaining([114]));
    expect(plan.manzil.every((p) => [113, 114].includes(p.surahNo))).toBe(true);
  });

  it('brings overdue and long-unrevised surahs into manzil first', () => {
    const rows = [
      row(114, 'mastered', 30), row(113, 'mastered', 90),
      row(78, 'mastered', 20, { nextReviewAt: daysAgo(1) }),
    ];
    const plan = dailyHifzPlan(rows, today, { cycleDays: 30 });
    expect(plan.manzil[0]?.surahNo).toBe(78); // overdue
  });

  it('spreads a large manzil over the cycle rather than all in one day', () => {
    const rows = Array.from({ length: 37 }, (_, i) => row(114 - i, 'mastered', 60 + i));
    const plan = dailyHifzPlan(rows, today, { cycleDays: 7 });
    expect(plan.manzil.length).toBeGreaterThan(0);
    expect(plan.manzil.length).toBeLessThan(37);
  });
});
