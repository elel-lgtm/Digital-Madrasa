import type { StudentFacts } from './context.ts';

/**
 * Deterministic analysis.
 *
 * Whether a child has a learning problem or an attendance problem is a
 * comparison of two numbers. A 1.7B model got this wrong — it identified
 * Yusuf's lowest subject correctly and then called it "an attendance problem"
 * in the same sentence. So the classification happens here, in code that is
 * right every time, and the model is left to do the thing it is actually good
 * at: turning findings into readable prose.
 *
 * This also makes answers faster. Fewer input tokens, shorter output, and no
 * reasoning pass.
 */

/** Below this, attendance is a problem in its own right. */
const ATTENDANCE_CONCERN = 80;
/** An absolute floor: any subject under this needs help regardless of average. */
const SUBJECT_FLOOR = 60;
/** A subject this far below the student's own average is a specific weakness. */
const RELATIVE_GAP = 15;

export type ConcernType = 'none' | 'learning' | 'attendance' | 'both';

export interface StudentAnalysis {
  alias: string;
  concern: ConcernType;
  averageScore: number | null;
  weakestSubject: { subject: string; score: number } | null;
  strongestSubject: { subject: string; score: number } | null;
  attendanceRate: number;
  absences: number;
  sessions: number;
  hifzMastered: number;
  /** One line stating what was found, for the model to expand on. */
  finding: string;
}

function percent(score: number, max: number): number {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

export function analyseStudent(facts: StudentFacts): StudentAnalysis {
  const scored = facts.grades.map((g) => ({ subject: g.subject, score: percent(g.score, g.max) }));
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const weakest = sorted[0] ?? null;
  const strongest = sorted[sorted.length - 1] ?? null;
  const average =
    scored.length > 0
      ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length)
      : null;

  const attendanceRate = facts.attendance.rate;
  const attendanceProblem = facts.attendance.total > 0 && attendanceRate < ATTENDANCE_CONCERN;

  // Two ways a subject counts as weak: below the floor outright, or well below
  // this particular student's own standard. The second matters — a 68 from a
  // child averaging 90 is a real change, and a flat threshold would miss it.
  const learningProblem =
    weakest !== null &&
    average !== null &&
    (weakest.score < SUBJECT_FLOOR || average - weakest.score >= RELATIVE_GAP);

  const concern: ConcernType =
    learningProblem && attendanceProblem
      ? 'both'
      : learningProblem
        ? 'learning'
        : attendanceProblem
          ? 'attendance'
          : 'none';

  const finding = (() => {
    switch (concern) {
      case 'both':
        return `LEARNING AND ATTENDANCE. Weakest subject is ${weakest?.subject} at ${weakest?.score}% (own average ${average}%), and attendance is ${attendanceRate}% (${facts.attendance.absent} absences in ${facts.attendance.total} sessions). Both need addressing; the subject gap will not close by attendance alone.`;
      case 'learning':
        return `LEARNING ONLY. Attendance is fine at ${attendanceRate}%, so this is not about turning up. Weakest subject is ${weakest?.subject} at ${weakest?.score}% against an own average of ${average}%. Needs subject help.`;
      case 'attendance':
        return `ATTENDANCE ONLY. Marks are acceptable (average ${average}%, weakest ${weakest?.subject} at ${weakest?.score}%), but attendance is ${attendanceRate}% with ${facts.attendance.absent} absences in ${facts.attendance.total} sessions. The work is not the problem; being there is.`;
      case 'none':
        return `NO CONCERN. Attendance ${attendanceRate}%, average ${average ?? 'n/a'}%. Progressing normally.`;
    }
  })();

  return {
    alias: facts.alias,
    concern,
    averageScore: average,
    weakestSubject: weakest,
    strongestSubject: strongest,
    attendanceRate,
    absences: facts.attendance.absent,
    sessions: facts.attendance.total,
    hifzMastered: facts.hifz.memorised,
    finding,
  };
}

export function analyseAll(students: StudentFacts[]): StudentAnalysis[] {
  return students.map(analyseStudent);
}

/**
 * Renders findings for the prompt.
 *
 * Students of concern are listed first: a small model attends most to what
 * comes early, and the ones needing help are the point of the question.
 */
export function renderAnalysis(analyses: StudentAnalysis[]): string {
  const order: Record<ConcernType, number> = { both: 0, learning: 1, attendance: 2, none: 3 };
  const sorted = [...analyses].sort((a, b) => order[a.concern] - order[b.concern]);

  const lines = sorted.map((a) => {
    const subjects =
      a.weakestSubject && a.strongestSubject
        ? ` Strongest ${a.strongestSubject.subject} ${a.strongestSubject.score}%, weakest ${a.weakestSubject.subject} ${a.weakestSubject.score}%.`
        : '';
    return `${a.alias}: ${a.finding}${subjects} Hifz: ${a.hifzMastered} surahs mastered.`;
  });

  const concerned = sorted.filter((a) => a.concern !== 'none');
  const header =
    concerned.length === 0
      ? 'Assessment: no student currently shows a concern.'
      : `Assessment: ${concerned.length} of ${analyses.length} students show a concern.`;

  return [header, '', ...lines].join('\n');
}
