import { describe, expect, it } from 'vitest';
import { activityDays, streakFrom, summariseAchievements, toDay, type AchievementInput } from './achievements';

const today = '2026-10-15';
const day = (n: number) => new Date(Date.UTC(2026, 9, 15 - n)).toISOString().slice(0, 10);
const empty: AchievementInput = { hifz: [], recitationDates: [], attendance: [] };
const days = (...ago: number[]) => new Set(ago.map(day));
const memorised = (surahNo: number) => ({ surahNo, ayahNo: 1, status: 'memorised' as const, nextReviewAt: null });

describe('streaks', () => {
  it('counts days in a row ending today', () => {
    expect(streakFrom(days(0, 1, 2, 4), today)).toMatchObject({ current: 3, best: 3, activeToday: true });
  });

  it('is not broken before today’s class: a run ending yesterday still counts', () => {
    expect(streakFrom(days(1, 2), today)).toMatchObject({ current: 2, activeToday: false });
  });

  it('is broken by a missed day, but the best run is remembered', () => {
    expect(streakFrom(days(2, 3, 4, 5, 6), today)).toMatchObject({ current: 0, best: 5 });
  });

  it('counts weeks in a row, which a madrasa that meets weekly can keep', () => {
    // Active once a week for three weeks, then a silent week, then two more.
    const s = streakFrom(days(0, 7, 14, 28, 35), today);
    expect(s.weeks).toBe(3);
    expect(s.bestWeeks).toBe(3);
    expect(streakFrom(days(8, 15), today).weeks).toBe(0);
  });

  it('ignores days in the future', () => {
    expect(streakFrom(new Set(['2026-10-16', '2026-10-17']), today)).toMatchObject({ current: 0, best: 0 });
  });

  it('counts attending, reciting and revising, but not an absence', () => {
    const d = activityDays({
      hifz: [{ ...memorised(114), lastRevisedAt: `${day(2)}T09:00:00` }],
      recitationDates: [`${day(1)}T16:30:00`],
      attendance: [
        { sessionDate: day(0), status: 'present' },
        { sessionDate: day(3), status: 'absent' },
        { sessionDate: day(4), status: 'late' },
      ],
    });
    expect([...d].sort()).toEqual([day(4), day(2), day(1), day(0)].sort());
  });

  it('reads a timestamp as the local calendar day', () => {
    const local = new Date(2026, 9, 15, 23, 30);
    expect(toDay(local.toISOString())).toBe('2026-10-15');
    expect(toDay('2026-10-15')).toBe('2026-10-15');
  });
});

describe('badges', () => {
  it('a new pupil has none, and the first surah is the next one', () => {
    const a = summariseAchievements(empty, today);
    expect(a.earnedCount).toBe(0);
    expect(a.badges.every((b) => !b.earned && b.current === 0)).toBe(true);
    expect(a.next?.id).toBe('first_surah');
  });

  it('shows progress towards a badge not yet earned', () => {
    const a = summariseAchievements({ ...empty, hifz: [112, 113, 114].map(memorised) }, today);
    const ten = a.badges.find((b) => b.id === 'surahs_10');
    expect(ten).toMatchObject({ earned: false, current: 3, target: 10 });
    expect(a.badges.find((b) => b.id === 'first_surah')?.earned).toBe(true);
  });

  it('gives Juz ʿAmma and the first juz only when all 37 surahs are memorised', () => {
    const amma = Array.from({ length: 37 }, (_, i) => memorised(78 + i));
    const done = summariseAchievements({ ...empty, hifz: amma }, today);
    expect(done.badges.find((b) => b.id === 'juz_amma')?.earned).toBe(true);
    expect(done.badges.find((b) => b.id === 'first_juz')?.earned).toBe(true);
    const almost = summariseAchievements({ ...empty, hifz: amma.slice(1) }, today);
    expect(almost.badges.find((b) => b.id === 'juz_amma')).toMatchObject({ earned: false, current: 36 });
    expect(almost.badges.find((b) => b.id === 'first_juz')?.earned).toBe(false);
  });

  it('does not count a surah still being learned', () => {
    const a = summariseAchievements({ ...empty, hifz: [{ surahNo: 114, ayahNo: 3, status: 'learning', nextReviewAt: null }] }, today);
    expect(a.badges.find((b) => b.id === 'first_surah')?.earned).toBe(false);
  });

  it('keeps a streak badge once earned, even after the streak breaks', () => {
    const week = Array.from({ length: 7 }, (_, i) => `${day(20 + i)}T10:00:00`);
    const a = summariseAchievements({ ...empty, recitationDates: week }, today);
    expect(a.streak.current).toBe(0);
    expect(a.badges.find((b) => b.id === 'streak_7')?.earned).toBe(true);
    expect(a.badges.find((b) => b.id === 'first_recitation')?.earned).toBe(true);
  });

  it('needs every class of the last 30 days, and at least four', () => {
    const att = (statuses: ('present' | 'absent' | 'excused')[]) =>
      statuses.map((status, i) => ({ sessionDate: day(i * 3), status }));
    const full = summariseAchievements({ ...empty, attendance: att(['present', 'present', 'excused', 'present', 'present']) }, today);
    expect(full.badges.find((b) => b.id === 'full_month')?.earned).toBe(true);
    const missed = summariseAchievements({ ...empty, attendance: att(['present', 'absent', 'present', 'present']) }, today);
    expect(missed.badges.find((b) => b.id === 'full_month')).toMatchObject({ earned: false, current: 3, target: 4 });
    const few = summariseAchievements({ ...empty, attendance: att(['present', 'present']) }, today);
    expect(few.badges.find((b) => b.id === 'full_month')?.earned).toBe(false);
  });
});
