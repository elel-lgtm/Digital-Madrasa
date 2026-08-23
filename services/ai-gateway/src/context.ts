import type { Caller } from './auth.ts';

/**
 * Turns a question into the small set of facts the model is allowed to see.
 *
 * Two rules shape everything here:
 *
 *   1. Every query runs through `caller.db`, which carries the user's own JWT.
 *      A parent asking about an unrelated child gets zero rows from Postgres.
 *      Authorisation is the database's job, not the prompt's.
 *
 *   2. Children's names never reach the model. Students are pseudonymised to
 *      "Student A", "Student B" and mapped back after the reply is generated.
 *      The summaries are just as useful, and no child's name ever enters an
 *      LLM context window. This is cheap to do now and impossible to retrofit
 *      once conversations are being logged.
 */

export interface StudentFacts {
  /** Pseudonym used in the prompt, e.g. "Student A". */
  alias: string;
  /** Real name — kept server-side for the response mapping only. */
  realName: string;
  studentId: string;
  className: string | null;
  attendance: { present: number; late: number; absent: number; total: number; rate: number };
  grades: { subject: string; score: number; max: number }[];
  hifz: { memorised: number; revising: number; learning: number; strongestJuz: number | null };
}

export interface AiContext {
  role: Caller['role'];
  madrasaName: string | null;
  students: StudentFacts[];
  /** alias -> real name, applied to the model's output before it is returned. */
  aliasMap: Record<string, string>;
}

const ALIASES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function buildStudentFacts(
  caller: Caller,
  rows: { id: string; full_name: string; class_name: string | null }[],
): Promise<StudentFacts[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // One query per table rather than per student: a class of thirty would
  // otherwise mean ninety round trips.
  const [attendance, grades, hifz] = await Promise.all([
    caller.db.from('attendance').select('student_id, status').in('student_id', ids),
    caller.db.from('grades').select('student_id, subject, score, max_score').in('student_id', ids),
    caller.db.from('hifz_progress').select('student_id, status, juz_no').in('student_id', ids),
  ]);

  return rows.map((row, index) => {
    const att = (attendance.data ?? []).filter((a) => a.student_id === row.id);
    const present = att.filter((a) => a.status === 'present').length;
    const late = att.filter((a) => a.status === 'late').length;
    const absent = att.filter((a) => a.status === 'absent').length;
    const total = att.length;

    const studentHifz = (hifz.data ?? []).filter((h) => h.student_id === row.id);

    return {
      alias: `Student ${ALIASES[index] ?? index + 1}`,
      realName: row.full_name,
      studentId: row.id,
      className: row.class_name,
      attendance: {
        present,
        late,
        absent,
        total,
        rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      },
      grades: (grades.data ?? [])
        .filter((g) => g.student_id === row.id)
        .map((g) => ({ subject: g.subject, score: Number(g.score), max: Number(g.max_score) })),
      hifz: {
        memorised: studentHifz.filter((h) => h.status === 'mastered').length,
        revising: studentHifz.filter((h) => h.status === 'revising').length,
        learning: studentHifz.filter((h) => h.status === 'learning').length,
        strongestJuz: studentHifz[0]?.juz_no ?? null,
      },
    };
  });
}

/**
 * Selects which students are in scope.
 *
 * Note there is no role branching that *grants* access — a parent's query and
 * a teacher's query are the same SQL. RLS returns a different set for each,
 * which is precisely why this cannot be got wrong here.
 */
export async function buildContext(
  caller: Caller,
  options: { selectedStudentId?: string } = {},
): Promise<AiContext> {
  const { data: studentRows } = await caller.db
    .from('students')
    .select('id, profiles!students_profile_id_fkey(full_name), classes(name)')
    .order('created_at');

  let rows = (studentRows ?? []).map((s) => ({
    id: s.id as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    full_name: ((s as any).profiles?.full_name as string) ?? 'Unknown',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    class_name: ((s as any).classes?.name as string) ?? null,
  }));

  // A caller may narrow to one child, but only within what RLS already
  // returned — an id for someone else's child simply matches nothing.
  if (options.selectedStudentId) {
    rows = rows.filter((r) => r.id === options.selectedStudentId);
  }

  const { data: madrasa } = await caller.db.from('madrasas').select('name').limit(1).maybeSingle();

  const students = await buildStudentFacts(caller, rows);
  const aliasMap = Object.fromEntries(students.map((s) => [s.alias, s.realName]));

  return {
    role: caller.role,
    madrasaName: (madrasa?.name as string) ?? null,
    students,
    aliasMap,
  };
}

/** Renders the facts as compact text for the prompt. */
export function renderContext(context: AiContext): string {
  if (context.students.length === 0) {
    return 'No student records are available for this user.';
  }

  return context.students
    .map((s) => {
      const grades =
        s.grades.length > 0
          ? s.grades.map((g) => `${g.subject} ${g.score}/${g.max}`).join(', ')
          : 'no grades recorded';
      return [
        `${s.alias}${s.className ? ` (${s.className})` : ''}:`,
        `  Attendance: ${s.attendance.rate}% (${s.attendance.present} present, ${s.attendance.late} late, ${s.attendance.absent} absent of ${s.attendance.total})`,
        `  Grades: ${grades}`,
        `  Hifz: ${s.hifz.memorised} surahs mastered, ${s.hifz.revising} in revision, ${s.hifz.learning} being learned`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Puts the real names back after generation.
 *
 * The model does not always echo an alias in full — it shortens "Student B" to
 * "B" once it thinks the referent is established, which left a bare letter in
 * the output where a name belonged. So bare letters that map to an alias are
 * restored too, after the full forms.
 */
export function restoreNames(text: string, aliasMap: Record<string, string>): string {
  let out = text;

  for (const [alias, realName] of Object.entries(aliasMap)) {
    out = out.replaceAll(alias, realName);
  }

  // Anything still referring to a student by bare letter.
  //
  // "A" and "I" are skipped: they are English words, and replacing them
  // rewrote real prose ("A grade of 70" became "<name> grade of 70"). A bare
  // "A" surviving is only a readability wrinkle — it identifies nobody, so the
  // privacy goal holds either way. Corrupting the sentence is the worse bug.
  const AMBIGUOUS = new Set(['A', 'I']);

  const letters = Object.keys(aliasMap)
    .map((alias) => alias.split(' ')[1] ?? '')
    .filter((letter) => letter.length > 0 && !AMBIGUOUS.has(letter));

  for (const letter of letters) {
    const realName = aliasMap[`Student ${letter}`];
    if (!realName) continue;
    out = out.replace(new RegExp(`\\b${letter}\\b(?!['’])`, 'g'), realName);
  }

  return out;
}

/** True if any alias survived into the output — used to fail loudly in tests. */
export function hasLeakedAlias(text: string): boolean {
  return /\bStudent [A-Z]\b/.test(text);
}
