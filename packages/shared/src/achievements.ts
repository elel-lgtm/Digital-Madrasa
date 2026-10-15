import type { AttendanceStatus } from './constants';
import { completedJuz, MEMORISED_STATUSES, type HifzRowLike } from './hifz';

/**
 * Hifz streaks and badges: encouragement for children, worked out from the
 * records the madrasa already keeps (memorisation, recitations, attendance).
 *
 * Nothing here is stored or awarded by hand, so a badge can never be given
 * for work that is not on the record, and the pupil, the parent and the
 * teacher always see the same thing.
 */

export interface AchievementInput {
  hifz: readonly (HifzRowLike & { lastRevisedAt?: string | null })[];
  /** When each recitation was recorded (timestamps or dates). */
  recitationDates: readonly string[];
  attendance: readonly { sessionDate: string; status: AttendanceStatus }[];
}

export interface Streak {
  /** Days in a row with activity, ending today or yesterday. */
  current: number;
  /** The longest run of days ever. */
  best: number;
  /** Weeks in a row (7-day blocks ending today) with at least one active day. */
  weeks: number;
  /** The longest run of such weeks ever. */
  bestWeeks: number;
  activeToday: boolean;
}

export const BADGE_IDS = [
  'first_surah',
  'surahs_10',
  'juz_amma',
  'first_juz',
  'juz_5',
  'hafidh',
  'first_recitation',
  'recitations_20',
  'streak_7',
  'weeks_4',
  'full_month',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeProgress {
  id: BadgeId;
  earned: boolean;
  /** Progress towards the badge, capped at `target`. */
  current: number;
  target: number;
}

export interface Achievements {
  streak: Streak;
  badges: BadgeProgress[];
  earnedCount: number;
  /** The unearned badge closest to being earned, if any. */
  next: BadgeProgress | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day 'YYYY-MM-DD': date strings as they are, timestamps in local time. */
export function toDay(value: string | Date): string {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value;
  const d = typeof value === 'string' ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Day arithmetic on 'YYYY-MM-DD' in UTC, so daylight saving can never skip a day. */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The days on which the pupil did something: attended, recited or revised. */
export function activityDays(input: AchievementInput): Set<string> {
  const days = new Set<string>();
  for (const a of input.attendance) {
    if (a.status === 'present' || a.status === 'late') days.add(toDay(a.sessionDate));
  }
  for (const r of input.recitationDates) days.add(toDay(r));
  for (const h of input.hifz) if (h.lastRevisedAt) days.add(toDay(h.lastRevisedAt));
  return days;
}

export function streakFrom(days: ReadonlySet<string>, today: string): Streak {
  const activeToday = days.has(today);
  // Yesterday still counts, so the streak is not shown broken before today's class.
  let cursor: string | null = activeToday ? today : days.has(addDays(today, -1)) ? addDays(today, -1) : null;
  let current = 0;
  while (cursor && days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].filter((d) => d <= today).sort();
  let best = 0;
  let run = 0;
  sorted.forEach((day, i) => {
    run = i > 0 && daysBetween(sorted[i - 1] as string, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });

  // Week k covers today-7k-6 .. today-7k.
  const blocks = new Set(sorted.map((d) => Math.floor(daysBetween(d, today) / 7)));
  let weeks = 0;
  while (blocks.has(weeks)) weeks += 1;
  let bestWeeks = 0;
  let wrun = 0;
  const maxBlock = sorted.length ? Math.floor(daysBetween(sorted[0] as string, today) / 7) : -1;
  for (let k = maxBlock; k >= 0; k -= 1) {
    wrun = blocks.has(k) ? wrun + 1 : 0;
    bestWeeks = Math.max(bestWeeks, wrun);
  }

  return { current, best, weeks, bestWeeks, activeToday };
}

const badge = (id: BadgeId, current: number, target: number, earned = current >= target): BadgeProgress => ({
  id,
  earned,
  current: Math.min(current, target),
  target,
});

export function summariseAchievements(input: AchievementInput, today: string): Achievements {
  const streak = streakFrom(activityDays(input), today);

  const memorised = input.hifz.filter((h) => MEMORISED_STATUSES.includes(h.status));
  const surahs = new Set(memorised.map((h) => h.surahNo)).size;
  // Juz 'Amma is exactly surahs 78 to 114.
  const ammaSurahs = new Set(memorised.filter((h) => h.surahNo >= 78).map((h) => h.surahNo)).size;
  const juz = completedJuz(input.hifz).length;
  const recitations = input.recitationDates.length;

  // Every class in the last 30 days, and at least four of them.
  const since = addDays(today, -29);
  const month = input.attendance.filter((a) => a.sessionDate >= since && a.sessionDate <= today && a.status !== 'excused');
  const attended = month.filter((a) => a.status === 'present' || a.status === 'late').length;
  const sessions = Math.max(4, month.length);

  const badges = [
    badge('first_surah', surahs, 1),
    badge('surahs_10', surahs, 10),
    badge('juz_amma', ammaSurahs, 37),
    badge('first_juz', juz, 1),
    badge('juz_5', juz, 5),
    badge('hafidh', juz, 30),
    badge('first_recitation', recitations, 1),
    badge('recitations_20', recitations, 20),
    badge('streak_7', streak.best, 7),
    badge('weeks_4', streak.bestWeeks, 4),
    badge('full_month', attended, sessions, month.length >= 4 && attended === month.length),
  ];

  const open = badges.filter((b) => !b.earned);
  const next = open.reduce<BadgeProgress | null>(
    (best, b) => (!best || b.current / b.target > best.current / best.target ? b : best),
    null,
  );

  return { streak, badges, earnedCount: badges.length - open.length, next };
}
