import type { HifzStatus } from './constants';
import { MEMORISED_STATUSES } from './hifz';
import { getSurah } from './quran';

/**
 * Today's hifz plan, the way madrasas organise memorisation:
 *
 *   Sabaq   the new lesson: the next few ayahs of the surah being learned, or
 *           the start of the next surah.
 *   Sabqi   recent revision: everything memorised or revised in the last two
 *           weeks, recited daily until it is firm.
 *   Manzil  old revision: the rest of what is memorised, spread over a weekly
 *           cycle so all of it comes round before it fades; anything overdue
 *           or long unrevised first.
 *
 * Pure and deterministic for a given day, so the student, the parent and the
 * teacher all see the same plan.
 */

export interface PlanRow {
  surahNo: number;
  ayahNo: number;
  status: HifzStatus;
  lastRevisedAt: string | null;
  nextReviewAt: string | null;
}

export interface Portion {
  surahNo: number;
  surahName: string;
  fromAyah: number;
  toAyah: number;
}

export interface HifzPlan {
  sabaq: Portion | null;
  sabqi: Portion[];
  manzil: Portion[];
  /** Days in which the whole manzil comes round once. */
  manzilCycleDays: number;
}

export interface PlanOptions {
  /** New ayahs per day. A short surah is taken whole. */
  newAyahsPerDay?: number;
  /** Memorised this many days ago or less counts as recent (sabqi). */
  recentDays?: number;
  /** The manzil cycle, in days. */
  cycleDays?: number;
}

const DAY = 86_400_000;

function whole(surahNo: number): Portion | null {
  const s = getSurah(surahNo);
  return s ? { surahNo, surahName: s.name, fromAyah: 1, toAyah: s.ayahCount } : null;
}

function nameOf(surahNo: number): string {
  const s = getSurah(surahNo);
  return s ? s.name : `Surah ${surahNo}`;
}

export function dailyHifzPlan(rows: readonly PlanRow[], today: Date, options: PlanOptions = {}): HifzPlan {
  const perDay = options.newAyahsPerDay ?? 5;
  const recentDays = options.recentDays ?? 14;
  const cycleDays = options.cycleDays ?? 7;

  const memorised = rows.filter((r) => MEMORISED_STATUSES.includes(r.status));
  const learning = rows.find((r) => r.status === 'learning');

  // ---------------------------------------------------------------- sabaq
  let sabaq: Portion | null = null;
  if (learning) {
    const s = getSurah(learning.surahNo);
    if (s) {
      const from = Math.min(Math.max(learning.ayahNo + 1, 1), s.ayahCount);
      sabaq = { surahNo: s.number, surahName: nameOf(s.number), fromAyah: from, toAyah: Math.min(from + perDay - 1, s.ayahCount) };
    }
  } else {
    // The usual madrasa order: An-Nas first, then back through the mushaf.
    const started = new Set(rows.filter((r) => r.status !== 'not_started').map((r) => r.surahNo));
    for (let n = 114; n >= 1; n -= 1) {
      if (started.has(n)) continue;
      const s = getSurah(n);
      if (!s) continue;
      sabaq = { surahNo: n, surahName: nameOf(n), fromAyah: 1, toAyah: s.ayahCount <= perDay + 2 ? s.ayahCount : perDay };
      break;
    }
  }

  // ---------------------------------------------------------------- sabqi
  const ageDays = (r: PlanRow) =>
    r.lastRevisedAt ? Math.floor((today.getTime() - new Date(r.lastRevisedAt).getTime()) / DAY) : Infinity;
  const recent = memorised.filter((r) => ageDays(r) <= recentDays);
  const sabqi = recent
    .sort((a, b) => ageDays(a) - ageDays(b))
    .map((r) => whole(r.surahNo))
    .filter((p): p is Portion => p !== null);
  if (learning && learning.ayahNo >= 1) {
    // What is already learned of the current surah is the freshest of all.
    sabqi.unshift({ surahNo: learning.surahNo, surahName: nameOf(learning.surahNo), fromAyah: 1, toAyah: learning.ayahNo });
  }

  // --------------------------------------------------------------- manzil
  const todayIso = today.toISOString().slice(0, 10);
  const older = memorised
    .filter((r) => ageDays(r) > recentDays)
    .sort((a, b) => {
      const overdue = (r: PlanRow) => (r.nextReviewAt !== null && r.nextReviewAt.slice(0, 10) <= todayIso ? 0 : 1);
      return overdue(a) - overdue(b) || ageDays(b) - ageDays(a) || a.surahNo - b.surahNo;
    });
  const totalAyahs = older.reduce((sum, r) => sum + (getSurah(r.surahNo)?.ayahCount ?? 0), 0);
  const allowance = Math.ceil(totalAyahs / cycleDays);
  const manzil: Portion[] = [];
  let taken = 0;
  for (const r of older) {
    if (taken >= allowance && manzil.length > 0) break;
    const p = whole(r.surahNo);
    if (!p) continue;
    manzil.push(p);
    taken += p.toAyah;
  }

  return { sabaq, sabqi, manzil, manzilCycleDays: cycleDays };
}
