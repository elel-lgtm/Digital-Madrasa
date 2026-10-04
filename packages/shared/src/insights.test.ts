import { describe, expect, it } from 'vitest';
import { teacherInsights, type PupilSignals } from './insights';

const today = new Date('2026-10-04T08:00:00Z');
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString();
const pupil = (over: Partial<PupilSignals> = {}): PupilSignals => ({
  studentId: 's1', fullName: 'Amina', className: 'Hifz A',
  presentRecent: 6, sessionsRecent: 6, presentPrev: 6, sessionsPrev: 6,
  learningSurah: 67, learningAyah: 12, learningMovedAt: daysAgo(2),
  overdueReviews: 0, memorisedWeek: 0, lastRecitationAt: daysAgo(3),
  scoreRecent: 85, scorePrev: 84, ...over,
});

describe('teacher co-pilot insights', () => {
  it('says nothing about a pupil who is doing fine', () => {
    expect(teacherInsights([pupil()], today)).toEqual({ concerns: [], praise: [] });
  });

  it('notices attendance falling from one fortnight to the next', () => {
    const { concerns } = teacherInsights([pupil({ presentRecent: 2, sessionsRecent: 6 })], today);
    expect(concerns[0]).toMatchObject({ kind: 'attendance_drop', values: { recent: 33, prev: 100 } });
  });

  it('notices a pupil stuck on the same surah for three weeks', () => {
    const { concerns } = teacherInsights([pupil({ learningMovedAt: daysAgo(24) })], today);
    expect(concerns[0]).toMatchObject({ kind: 'stuck', values: { surah: 67, ayah: 12, weeks: 3 } });
  });

  it('notices falling scores and praises rising ones', () => {
    const r = teacherInsights([
      pupil({ studentId: 'a', scoreRecent: 62, scorePrev: 80 }),
      pupil({ studentId: 'b', fullName: 'Bilal', scoreRecent: 91, scorePrev: 75 }),
    ], today);
    expect(r.concerns[0]).toMatchObject({ kind: 'score_drop', studentId: 'a' });
    expect(r.praise[0]).toMatchObject({ kind: 'improving', studentId: 'b' });
  });

  it('praises a surah memorised this week', () => {
    expect(teacherInsights([pupil({ memorisedWeek: 2 })], today).praise[0]).toMatchObject({ kind: 'memorised', values: { count: 2 } });
  });

  it('puts attendance before overdue revision', () => {
    const { concerns } = teacherInsights([
      pupil({ studentId: 'a', overdueReviews: 5 }),
      pupil({ studentId: 'b', presentRecent: 1, sessionsRecent: 5, presentPrev: 5, sessionsPrev: 5 }),
    ], today);
    expect(concerns.map((c) => c.kind)).toEqual(['attendance_drop', 'overdue']);
  });

  it('does not judge on too few sessions', () => {
    expect(teacherInsights([pupil({ presentRecent: 0, sessionsRecent: 2 })], today).concerns).toEqual([]);
  });
});
