import { describe, expect, it } from 'vitest';
import {
  JUZ_AYAH_COUNT,
  ayahPosition,
  completedJuz,
  juzForAyah,
  summariseHifzRows,
  surahAyahAt,
  type HifzRowLike,
} from './hifz';
import { SURAHS, TOTAL_AYAHS } from './quran';

const TODAY = '2026-09-29';
const row = (surahNo: number, status: HifzRowLike['status'], ayahNo = 1): HifzRowLike => ({
  surahNo,
  ayahNo,
  status,
  nextReviewAt: null,
});
const juz30 = SURAHS.filter((s) => s.number >= 78).map((s) => row(s.number, 'mastered'));

describe('juz boundaries', () => {
  it('covers the whole mushaf exactly once', () => {
    expect(TOTAL_AYAHS).toBe(6236);
    expect(JUZ_AYAH_COUNT.reduce((a, b) => a + b, 0)).toBe(TOTAL_AYAHS);
    expect(JUZ_AYAH_COUNT).toHaveLength(30);
  });

  it('splits Al-Baqarah across juz 1 to 3', () => {
    expect(juzForAyah(2, 141)).toBe(1);
    expect(juzForAyah(2, 142)).toBe(2);
    expect(juzForAyah(2, 252)).toBe(2);
    expect(juzForAyah(2, 253)).toBe(3);
  });

  it('places the last ayah in juz 30', () => {
    expect(juzForAyah(114, 6)).toBe(30);
    expect(juzForAyah(78, 1)).toBe(30);
    expect(juzForAyah(77, 50)).toBe(29);
  });

  it('round-trips ayah positions', () => {
    expect(surahAyahAt(ayahPosition(67, 12))).toEqual([67, 12]);
    expect(ayahPosition(1, 1)).toBe(1);
    expect(ayahPosition(114, 6)).toBe(TOTAL_AYAHS);
  });
});

describe('summariseHifzRows', () => {
  it('counts a fully memorised juz 30 as one juz', () => {
    const totals = summariseHifzRows(juz30, TODAY);
    expect(totals.juzCompleted).toBe(1);
    expect(totals.memorisedAyahs).toBe(JUZ_AYAH_COUNT[29]);
    expect(totals.surahsMemorised).toBe(37);
    expect(completedJuz(juz30)).toEqual([30]);
  });

  it('does not count a juz with missing surahs', () => {
    const partial = juz30.filter((r) => r.surahNo >= 85);
    expect(summariseHifzRows(partial, TODAY).juzCompleted).toBe(0);
    expect(completedJuz(partial)).toEqual([]);
  });

  it('counts a learning surah up to the recorded ayah only', () => {
    expect(summariseHifzRows([row(2, 'learning', 5)], TODAY).memorisedAyahs).toBe(5);
    expect(summariseHifzRows([row(2, 'not_started', 50)], TODAY).memorisedAyahs).toBe(0);
  });

  it('never double-counts overlapping rows', () => {
    const totals = summariseHifzRows([row(1, 'mastered'), row(1, 'learning', 3)], TODAY);
    expect(totals.memorisedAyahs).toBe(7);
  });

  it('flags revising rows and past review dates as due', () => {
    const rows: HifzRowLike[] = [
      row(112, 'revising'),
      { ...row(113, 'mastered'), nextReviewAt: '2026-09-01T00:00:00Z' },
      { ...row(114, 'mastered'), nextReviewAt: '2026-10-30T00:00:00Z' },
    ];
    expect(summariseHifzRows(rows, TODAY).dueForRevision).toBe(2);
  });
});
