import { SURAHS, TOTAL_AYAHS, getSurah } from './quran';
import type { HifzStatus } from './constants';

/**
 * Where each juz begins in the Hafs mushaf, as [surah, ayah].
 *
 * Surah-level bucketing is wrong for the long surahs — Al-Baqarah alone spans
 * juz 1 to 3 — so anything that counts a juz as complete works from these
 * exact boundaries instead.
 */
export const JUZ_START: readonly (readonly [number, number])[] = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 83], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

/** Ayahs before each surah, so (surah, ayah) maps to one position 1..6236. */
const SURAH_OFFSET: number[] = (() => {
  const offsets = [0];
  let running = 0;
  for (const s of SURAHS) {
    offsets[s.number] = running;
    running += s.ayahCount;
  }
  return offsets;
})();

/** Position of an ayah in the whole mushaf, 1-based. */
export function ayahPosition(surahNo: number, ayahNo: number): number {
  return (SURAH_OFFSET[surahNo] ?? 0) + ayahNo;
}

const JUZ_START_POSITION = JUZ_START.map(([s, a]) => ayahPosition(s, a));

/** The juz containing a given ayah. */
export function juzForAyah(surahNo: number, ayahNo: number): number {
  const pos = ayahPosition(surahNo, ayahNo);
  let juz = 1;
  JUZ_START_POSITION.forEach((start, i) => {
    if (start <= pos) juz = i + 1;
  });
  return juz;
}

/** Number of ayahs in each juz (index 0 is juz 1). */
export const JUZ_AYAH_COUNT: readonly number[] = JUZ_START_POSITION.map(
  (start, i) => (JUZ_START_POSITION[i + 1] ?? TOTAL_AYAHS + 1) - start,
);

/** Statuses that mean the whole surah has been committed to memory. */
export const MEMORISED_STATUSES: readonly HifzStatus[] = ['memorised', 'revising', 'mastered'];

export interface HifzRowLike {
  surahNo: number;
  ayahNo: number;
  status: HifzStatus;
  nextReviewAt: string | null;
}

/**
 * The ayahs a progress row stands for.
 *
 * A row is one surah. Memorised, revising and mastered mean the whole surah;
 * learning means memorised up to `ayahNo`; not started means nothing.
 */
export function memorisedAyahRange(row: HifzRowLike): [number, number] | null {
  const surah = getSurah(row.surahNo);
  if (!surah) return null;
  if (MEMORISED_STATUSES.includes(row.status)) return [1, surah.ayahCount];
  if (row.status === 'learning' && row.ayahNo >= 1) {
    return [1, Math.min(row.ayahNo, surah.ayahCount)];
  }
  return null;
}

export interface HifzTotals {
  memorisedAyahs: number;
  totalAyahs: number;
  juzCompleted: number;
  surahsMemorised: number;
  dueForRevision: number;
}

/**
 * The single definition of a student's memorisation totals, shared by every
 * backend so a dashboard, a parent view and a certificate check can never
 * count differently.
 */
export function summariseHifzRows(rows: readonly HifzRowLike[], todayIso: string): HifzTotals {
  const covered = new Uint8Array(TOTAL_AYAHS + 1);
  for (const row of rows) {
    const range = memorisedAyahRange(row);
    if (!range) continue;
    for (let a = range[0]; a <= range[1]; a += 1) covered[ayahPosition(row.surahNo, a)] = 1;
  }

  let memorisedAyahs = 0;
  const perJuz = new Array<number>(30).fill(0);
  for (let pos = 1; pos <= TOTAL_AYAHS; pos += 1) {
    if (!covered[pos]) continue;
    memorisedAyahs += 1;
    let juz = 0;
    while (juz + 1 < JUZ_START_POSITION.length && (JUZ_START_POSITION[juz + 1] ?? Infinity) <= pos) juz += 1;
    perJuz[juz] = (perJuz[juz] ?? 0) + 1;
  }

  const today = todayIso.slice(0, 10);
  return {
    memorisedAyahs,
    totalAyahs: TOTAL_AYAHS,
    juzCompleted: perJuz.filter((n, i) => n === JUZ_AYAH_COUNT[i]).length,
    surahsMemorised: rows.filter((r) => MEMORISED_STATUSES.includes(r.status)).length,
    dueForRevision: rows.filter(
      (r) => r.status === 'revising' || (r.nextReviewAt !== null && r.nextReviewAt.slice(0, 10) <= today),
    ).length,
  };
}

/** Juz numbers whose every ayah is covered — what a juz certificate needs. */
export function completedJuz(rows: readonly HifzRowLike[]): number[] {
  const totals = new Array<number>(30).fill(0);
  const covered = new Set<number>();
  for (const row of rows) {
    const range = memorisedAyahRange(row);
    if (!range) continue;
    for (let a = range[0]; a <= range[1]; a += 1) covered.add(ayahPosition(row.surahNo, a));
  }
  covered.forEach((pos) => {
    const juz = juzForAyah(...surahAyahAt(pos));
    totals[juz - 1] = (totals[juz - 1] ?? 0) + 1;
  });
  return totals.flatMap((n, i) => (n === JUZ_AYAH_COUNT[i] ? [i + 1] : []));
}

/** Inverse of ayahPosition. */
export function surahAyahAt(position: number): [number, number] {
  for (let s = SURAHS.length; s >= 1; s -= 1) {
    const offset = SURAH_OFFSET[s] ?? 0;
    if (position > offset) return [s, position - offset];
  }
  return [1, 1];
}
