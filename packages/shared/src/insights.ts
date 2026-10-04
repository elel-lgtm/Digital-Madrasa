/**
 * The teacher's weekly co-pilot: turns per-pupil signals (migration 0032)
 * into a short, ranked list of things worth acting on, and a few worth
 * praising. Plain rules rather than a model, so every insight can be traced
 * back to the numbers that caused it and translated into any language.
 */

export interface PupilSignals {
  studentId: string;
  fullName: string;
  className: string | null;
  presentRecent: number;
  sessionsRecent: number;
  presentPrev: number;
  sessionsPrev: number;
  learningSurah: number | null;
  learningAyah: number | null;
  learningMovedAt: string | null;
  overdueReviews: number;
  memorisedWeek: number;
  lastRecitationAt: string | null;
  scoreRecent: number | null;
  scorePrev: number | null;
}

export type InsightKind =
  | 'attendance_drop'
  | 'attendance_low'
  | 'stuck'
  | 'score_drop'
  | 'overdue'
  | 'quiet'
  | 'memorised'
  | 'improving';

export interface Insight {
  kind: InsightKind;
  tone: 'concern' | 'praise';
  studentId: string;
  name: string;
  /** Higher first. */
  priority: number;
  /** The numbers the sentence is built from. */
  values: Record<string, number>;
}

const DAY = 86_400_000;
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

export function teacherInsights(pupils: readonly PupilSignals[], today: Date): { concerns: Insight[]; praise: Insight[] } {
  const out: Insight[] = [];
  const daysSince = (iso: string | null) => (iso ? Math.floor((today.getTime() - new Date(iso).getTime()) / DAY) : null);

  for (const p of pupils) {
    const base = { studentId: p.studentId, name: p.fullName };
    const recent = pct(p.presentRecent, p.sessionsRecent);
    const prev = pct(p.presentPrev, p.sessionsPrev);

    if (p.sessionsRecent >= 3 && p.sessionsPrev >= 3 && recent <= prev - 30) {
      out.push({ ...base, kind: 'attendance_drop', tone: 'concern', priority: 90 + (prev - recent) / 10, values: { recent, prev } });
    } else if (p.sessionsRecent >= 3 && recent < 60) {
      out.push({ ...base, kind: 'attendance_low', tone: 'concern', priority: 85 - recent / 10, values: { recent } });
    }

    const still = daysSince(p.learningMovedAt);
    if (p.learningSurah !== null && still !== null && still >= 21) {
      out.push({
        ...base, kind: 'stuck', tone: 'concern', priority: 80 + Math.min(still, 90) / 10,
        values: { surah: p.learningSurah, ayah: p.learningAyah ?? 1, weeks: Math.floor(still / 7) },
      });
    }

    if (p.scoreRecent !== null && p.scorePrev !== null && p.scoreRecent <= p.scorePrev - 10) {
      out.push({
        ...base, kind: 'score_drop', tone: 'concern', priority: 70 + (p.scorePrev - p.scoreRecent) / 10,
        values: { recent: Math.round(p.scoreRecent), prev: Math.round(p.scorePrev) },
      });
    } else if (p.scoreRecent !== null && p.scorePrev !== null && p.scoreRecent >= p.scorePrev + 10) {
      out.push({
        ...base, kind: 'improving', tone: 'praise', priority: 30 + (p.scoreRecent - p.scorePrev) / 10,
        values: { recent: Math.round(p.scoreRecent), prev: Math.round(p.scorePrev) },
      });
    }

    if (p.overdueReviews >= 2) {
      out.push({ ...base, kind: 'overdue', tone: 'concern', priority: 60 + Math.min(p.overdueReviews, 20) / 2, values: { count: p.overdueReviews } });
    }

    const silent = daysSince(p.lastRecitationAt);
    if (silent !== null && silent >= 21) {
      out.push({ ...base, kind: 'quiet', tone: 'concern', priority: 40 + Math.min(silent, 90) / 10, values: { weeks: Math.floor(silent / 7) } });
    }

    if (p.memorisedWeek >= 1) {
      out.push({ ...base, kind: 'memorised', tone: 'praise', priority: 35 + p.memorisedWeek, values: { count: p.memorisedWeek } });
    }
  }

  const byPriority = (a: Insight, b: Insight) => b.priority - a.priority || a.name.localeCompare(b.name);
  return {
    concerns: out.filter((i) => i.tone === 'concern').sort(byPriority),
    praise: out.filter((i) => i.tone === 'praise').sort(byPriority),
  };
}
