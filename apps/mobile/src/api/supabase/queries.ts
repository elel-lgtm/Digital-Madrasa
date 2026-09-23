import {
  liveSessionState,
  surahName,
  type Announcement,
  type Assignment,
  type AttendanceRecord,
  type Grade,
  type HifzProgress,
  type Klass,
  type Lesson,
  type Student,
  type Teacher,
} from '@digital-madrasa/shared';
import {
  ApiError,
  type ChildBalance,
  type ChildOverview,
  type HifzSummary,
  type StudentDashboard,
  type TeacherDashboard,
} from '../types';
import { supabase } from './client';
import { mapStudent, mapTeacher } from './mappers';
import { getFeesSummary, listCertificates, listRecitations } from './queries-fees';

/**
 * Read queries against Supabase.
 *
 * None of these filter by tenant, parent link or role. They do not need to —
 * RLS already scopes every row to the caller, and adding client-side filters
 * would create a second, weaker copy of rules that already exist in the
 * database. Where a filter does appear it is a narrowing convenience, never
 * the security boundary.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function fail(error: { message: string } | null, fallback: string): never {
  throw new ApiError('unknown', error?.message ?? fallback);
}

async function currentMadrasaName(): Promise<string> {
  const { data } = await supabase.from('madrasas').select('name').limit(1).maybeSingle();
  return (data?.name as string) ?? '';
}

// ------------------------------------------------------------------ people

export async function listStudents(): Promise<{ items: Student[]; nextCursor: string | null }> {
  const { data, error } = await supabase
    .from('students')
    .select('*, profiles!students_profile_id_fkey(full_name, avatar_url), classes(name)')
    .is('deleted_at', null)
    .order('admission_no');

  if (error) fail(error, 'Could not load students.');
  return { items: (data ?? []).map(mapStudent), nextCursor: null };
}

export async function listClasses(): Promise<Klass[]> {
  // `students(count)` is an aggregate over the embedded relation, so enrolment
  // arrives with the classes rather than as a query per card. The nested
  // `deleted_at` filter applies to the students before they are counted —
  // without it a withdrawn pupil would still be billed as enrolled here. RLS
  // scopes the embedded rows too, so the count cannot span madrasas.
  const { data, error } = await supabase
    .from('classes')
    .select('*, teachers(profile_id, profiles!teachers_profile_id_fkey(full_name)), students(count)')
    .is('deleted_at', null)
    .is('students.deleted_at', null)
    .order('name');

  if (error) fail(error, 'Could not load classes.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    name: row.name,
    level: row.level,
    teacherId: row.teacher_id ?? null,
    teacherName: row.teachers?.profiles?.full_name ?? null,
    schedule: row.schedule ?? [],
    capacity: row.capacity,
    studentCount: row.students?.[0]?.count ?? 0,
  }));
}

export async function listTeachers(): Promise<Teacher[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('*, profiles!teachers_profile_id_fkey(full_name, email, phone, avatar_url)')
    .is('deleted_at', null);

  if (error) fail(error, 'Could not load staff.');
  return (data ?? []).map(mapTeacher);
}

// ---------------------------------------------------------------- learning

export async function listLessons(params: { classId?: string | null }): Promise<Lesson[]> {
  let query = supabase
    .from('lessons')
    .select('*, classes(name, teacher_id)')
    .is('deleted_at', null)
    .order('scheduled_for', { ascending: false });

  if (params.classId) query = query.eq('class_id', params.classId);

  const { data, error } = await query;
  if (error) fail(error, 'Could not load lessons.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    classId: row.class_id,
    className: row.classes?.name ?? '',
    teacherId: row.classes?.teacher_id ?? null,
    title: row.title,
    surahFrom: row.surah_from,
    ayahFrom: row.ayah_from,
    surahTo: row.surah_to,
    ayahTo: row.ayah_to,
    qiraahStyle: row.qiraah_style,
    resourceUrls: row.resource_urls ?? [],
    scheduledFor: row.scheduled_for ?? null,
    notes: row.notes ?? null,
    meetingUrl: row.meeting_url ?? null,
  }));
}

/**
 * The marking roster for one class on one date: exactly one row per enrolled
 * student, carrying their record for that date when it exists.
 *
 * The roster is driven from `students`, not from `attendance`. Reading
 * attendance rows directly cannot answer this question: a student who has not
 * been marked yet has no row and would vanish from the list, while a student
 * with a term of history would appear once per past session — which is what
 * happened before, duplicating React keys and letting the screen mark
 * attendance against a historical list.
 *
 * The embedded `attendance` is filtered to the session date, and
 * `(student_id, session_date)` is unique, so each student carries at most one
 * record. Anyone unmarked gets a draft defaulting to `present`, matching the
 * mock's contract so the screen behaves identically on either backend.
 */
export async function listAttendance(params: {
  classId: string;
  sessionDate: string;
}): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, class_id, profiles!students_profile_id_fkey(full_name), attendance(id, status, method, note, session_date, deleted_at)',
    )
    .eq('class_id', params.classId)
    .is('deleted_at', null)
    .eq('attendance.session_date', params.sessionDate)
    .is('attendance.deleted_at', null);

  if (error) fail(error, 'Could not load attendance.');

  return (data ?? [])
    .map((row: Row): AttendanceRecord => {
      const studentName = row.profiles?.full_name ?? '';
      const existing = (row.attendance ?? [])[0];

      if (existing) {
        return {
          id: existing.id,
          studentId: row.id,
          studentName,
          classId: row.class_id,
          sessionDate: existing.session_date,
          status: existing.status,
          method: existing.method ?? 'manual',
          note: existing.note ?? null,
        };
      }

      return {
        // Draft ids are never sent back to the server — `markAttendance` posts
        // student ids and statuses — but they keep list keys unique and stable.
        id: `draft-${row.id}-${params.sessionDate}`,
        studentId: row.id,
        studentName,
        classId: params.classId,
        sessionDate: params.sessionDate,
        status: 'present',
        method: 'manual',
        note: null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

/**
 * Recent attendance rows across the caller's whole scope, for the dashboard
 * percentages. This is the aggregate question, not the roster question, so it
 * deliberately reads the attendance table directly.
 */
async function recentAttendance(): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, students(profiles!students_profile_id_fkey(full_name))')
    .is('deleted_at', null)
    .order('session_date', { ascending: false })
    .limit(200);

  if (error) fail(error, 'Could not load attendance.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: row.students?.profiles?.full_name ?? '',
    classId: row.class_id,
    sessionDate: row.session_date,
    status: row.status,
    method: row.method ?? 'manual',
    note: row.note ?? null,
  }));
}

export async function listGrades(): Promise<Grade[]> {
  const { data, error } = await supabase
    .from('grades')
    .select('*, students(admission_no, profiles!students_profile_id_fkey(full_name))')
    .order('created_at', { ascending: false });

  if (error) fail(error, 'Could not load grades.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: row.students?.profiles?.full_name ?? '',
    classId: row.class_id,
    term: row.term,
    subject: row.subject,
    score: Number(row.score),
    maxScore: Number(row.max_score),
    remarks: row.remarks ?? null,
    issuedAt: row.created_at,
  }));
}

export async function listHifzProgress(): Promise<HifzProgress[]> {
  const { data, error } = await supabase
    .from('hifz_progress')
    .select('*')
    .order('surah_no', { ascending: false });

  if (error) fail(error, 'Could not load progress.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    studentId: row.student_id,
    surahNo: row.surah_no,
    surahName: surahName(row.surah_no),
    juzNo: row.juz_no,
    ayahNo: row.ayah_no,
    status: row.status,
    confidenceScore: row.confidence_score ? Number(row.confidence_score) : 0,
    lastRevisedAt: row.last_revised_at ?? null,
    nextReviewAt: row.next_review_at ?? null,
  }));
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .is('deleted_at', null)
    .order('publish_at', { ascending: false })
    .limit(20);

  if (error) fail(error, 'Could not load announcements.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    authorId: row.author_id,
    authorName: '',
    title: row.title,
    body: row.body,
    audience: row.audience ?? [],
    publishAt: row.publish_at,
    expiresAt: row.expires_at ?? null,
  }));
}

// -------------------------------------------------------------- parent

/**
 * The caller's children.
 *
 * No join to `parent_student_links` here — RLS on `students` already restricts
 * a parent to approved links, so this returns exactly their children and
 * nothing else. Re-filtering client-side would duplicate the rule.
 */
export async function listChildren(): Promise<Student[]> {
  const { items } = await listStudents();
  return items;
}

export async function getChildOverview(studentId: string): Promise<ChildOverview> {
  const { data: row, error } = await supabase
    .from('students')
    .select('*, profiles!students_profile_id_fkey(full_name, avatar_url), classes(name)')
    .eq('id', studentId)
    .maybeSingle();

  if (error) fail(error, 'Could not load your child.');
  // A child outside the caller's approved links returns no row rather than an
  // authorisation error — the database simply does not show it to them.
  if (!row) throw new ApiError('not_found', 'That child is not linked to your account.');

  const [attendance, grades, hifz, recitations, invoices, certificates] = await Promise.all([
    supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .order('session_date', { ascending: false })
      .limit(30),
    supabase.from('grades').select('*').eq('student_id', studentId),
    supabase.from('hifz_progress').select('*').eq('student_id', studentId),
    // The child screen has always rendered these cards; the field was left
    // hardcoded empty, so a parent saw the "no recitations yet" copy however
    // much their child had recited. Same read the student and teacher use —
    // RLS answers `can_read_student`, which for a parent means an approved
    // link, so the studentId here narrows rather than authorises.
    listRecitations({ studentId }),
    // Both of the fields below were hardcoded. A parent was shown
    // "Outstanding balance: Ksh 0" for a child who owed fees, which is the
    // worst kind of wrong number to put in front of someone — it reads as
    // settled rather than as missing.
    supabase
      .from('invoices')
      .select('amount_due, amount_paid')
      .eq('student_id', studentId)
      .is('deleted_at', null),
    listCertificates(studentId),
  ]);

  const attendanceRows: AttendanceRecord[] = (attendance.data ?? []).map((a: Row) => ({
    id: a.id,
    studentId: a.student_id,
    studentName: row.profiles?.full_name ?? '',
    classId: a.class_id,
    sessionDate: a.session_date,
    status: a.status,
    method: a.method ?? 'manual',
    note: a.note ?? null,
  }));

  const hifzRows: HifzProgress[] = (hifz.data ?? []).map((h: Row) => ({
    id: h.id,
    studentId: h.student_id,
    surahNo: h.surah_no,
    surahName: surahName(h.surah_no),
    juzNo: h.juz_no,
    ayahNo: h.ayah_no,
    status: h.status,
    confidenceScore: h.confidence_score ? Number(h.confidence_score) : 0,
    lastRevisedAt: h.last_revised_at ?? null,
    nextReviewAt: h.next_review_at ?? null,
  }));

  return {
    student: mapStudent(row),
    hifzSummary: summariseHifz(hifzRows),
    attendanceRate: attendanceRate(attendanceRows),
    recentAttendance: attendanceRows.slice(0, 10),
    grades: (grades.data ?? []).map((g: Row) => ({
      id: g.id,
      studentId: g.student_id,
      studentName: row.profiles?.full_name ?? '',
      classId: g.class_id,
      term: g.term,
      subject: g.subject,
      score: Number(g.score),
      maxScore: Number(g.max_score),
      remarks: g.remarks ?? null,
      issuedAt: g.created_at,
    })),
    outstandingBalance: (invoices.data ?? []).reduce(
      (sum: number, i: Row) => sum + (Number(i.amount_due) - Number(i.amount_paid)),
      0,
    ),
    recentRecitations: recitations,
    // No certificate can be issued anywhere in the product yet, so this stays
    // empty today either way. It reads through the same query the other
    // screens use, so the child screen will not silently disagree with them
    // once issuing exists.
    certificates,
  };
}

export async function getChildBalances(): Promise<ChildBalance[]> {
  const children = await listChildren();
  const { data } = await supabase
    .from('invoices')
    .select('student_id, amount_due, amount_paid, status')
    .neq('status', 'paid');

  return children.map((child) => {
    const theirs = (data ?? []).filter((i: Row) => i.student_id === child.id);
    return {
      studentId: child.id,
      studentName: child.fullName,
      admissionNo: child.admissionNo,
      outstanding: theirs.reduce(
        (sum, i: Row) => sum + (Number(i.amount_due) - Number(i.amount_paid)),
        0,
      ),
      overdueCount: theirs.filter((i: Row) => i.status === 'overdue').length,
    };
  });
}

// -------------------------------------------------------------- dashboards

function summariseHifz(rows: HifzProgress[]): HifzSummary {
  const mastered = rows.filter((r) => r.status === 'mastered');
  return {
    memorisedAyahs: mastered.length,
    totalAyahs: Math.max(rows.length, 1),
    juzCompleted: new Set(mastered.map((r) => r.juzNo)).size,
    surahsMemorised: mastered.length,
    currentStreak: 0,
    dueForRevision: rows.filter((r) => r.status === 'revising').length,
  };
}

/**
 * Consecutive days, ending today or yesterday, on which the student was not
 * absent.
 *
 * Yesterday counts as the end of the run so a streak does not appear broken
 * first thing in the morning before that day's class has happened. A gap of
 * more than a day ends it.
 */
function attendanceStreak(rows: AttendanceRecord[]): number {
  const present = new Set(
    rows.filter((r) => r.status !== 'absent').map((r) => r.sessionDate),
  );
  if (present.size === 0) return 0;

  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);

  let cursor = present.has(today) ? today : present.has(yesterday) ? yesterday : null;
  if (!cursor) return 0;

  let streak = 0;
  while (present.has(cursor)) {
    streak += 1;
    cursor = new Date(new Date(cursor).getTime() - DAY).toISOString().slice(0, 10);
  }
  return streak;
}

function attendanceRate(rows: AttendanceRecord[]): number {
  if (rows.length === 0) return 0;
  const attended = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
  return Math.round((attended / rows.length) * 100);
}

/** The one lesson worth a Join button: live link, session window open. */
function findLive(lessons: Lesson[]): Lesson | null {
  const open = lessons.filter((l) => {
    if (!l.meetingUrl) return false;
    const state = liveSessionState(l.scheduledFor);
    return state === 'live' || state === 'starting_soon';
  });
  return (
    [...open].sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))[0] ?? null
  );
}

export async function getTeacherDashboard(): Promise<TeacherDashboard> {
  const [madrasaName, students, classes, lessons, attendance, announcements, pendingReviews, fees] =
    await Promise.all([
      currentMadrasaName(),
      listStudents(),
      listClasses(),
      listLessons({}),
      recentAttendance(),
      listAnnouncements(),
      // The dashboard's work-queue card is gated on this being above zero, so
      // hardcoding it meant a teacher was never told a recitation was waiting
      // — the grading queue existed but nothing ever pointed at it.
      listRecitations({ pendingReviewOnly: true }),
      // The same summary the Fees screen renders. The dashboard previously
      // hardcoded zeroes, so the two screens disagreed about the same money:
      // Ksh 0 here against Ksh 6,500 collected there.
      //
      // `collected` is the sum of `invoices.amount_paid` — what has been
      // recorded as settled against each invoice, which is the ledger the rest
      // of the app already treats as authoritative. It is not a count of
      // invoices issued, so an unpaid invoice never inflates it.
      getFeesSummary(),
    ]);

  const { count: pendingLinks } = await supabase
    .from('parent_student_links')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return {
    madrasaName,
    pendingReviewCount: pendingReviews.length,
    pendingLinkRequests: pendingLinks ?? 0,
    todaysClasses: classes.map((klass) => ({ klass, attendanceMarked: false })),
    studentCount: students.items.length,
    attendanceRateThisWeek: attendanceRate(attendance),
    feesCollected: fees.collected,
    feesOutstanding: fees.outstanding,
    onboarding: [
      { key: 'add_class', done: classes.length > 0 },
      { key: 'add_student', done: students.items.length > 0 },
      { key: 'invite_teacher', done: false },
      { key: 'set_fees', done: false },
    ],
    recentAnnouncements: announcements.slice(0, 3),
    liveLesson: findLive(lessons),
  };
}

export async function getStudentDashboard(): Promise<StudentDashboard> {
  const { data: studentRow } = await supabase
    .from('students')
    .select('*, profiles!students_profile_id_fkey(full_name), classes(name)')
    .limit(1)
    .maybeSingle();

  if (!studentRow) throw new ApiError('not_found', 'No student record for this account.');
  const student = mapStudent(studentRow);

  const [hifz, attendance, lessons, assignments, submissions] = await Promise.all([
    listHifzProgress(),
    recentAttendance(),
    listLessons({ classId: student.classId }),
    // The dashboard renders an assignments list that was fed a hardcoded
    // empty array, so a student was told they were all caught up regardless.
    //
    // Queried here rather than through `listAssignments`: queries-comms
    // already imports from this module, and importing back formed a require
    // cycle that Metro warns can leave the binding uninitialized when it is
    // called.
    supabase
      .from('assignments')
      .select('*, classes(name)')
      .eq('class_id', student.classId ?? '')
      .is('deleted_at', null)
      .order('due_at', { ascending: false }),
    // "Open" means not handed in, not merely not yet due. The list renders an
    // explicit overdue state in a danger tone, so filtering by due date would
    // hide precisely the work it exists to chase.
    supabase.from('submissions').select('assignment_id').eq('student_id', student.id),
  ]);

  const now = Date.now();
  const upcoming = [...lessons]
    .filter((l) => l.scheduledFor && new Date(l.scheduledFor).getTime() > now)
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));

  return {
    studentName: student.fullName,
    admissionNo: student.admissionNo,
    className: student.className,
    streakDays: attendanceStreak(attendance),
    revisionDue: hifz.filter((h) => h.status === 'revising').slice(0, 5),
    nextLesson: upcoming[0] ?? null,
    liveLesson: findLive(lessons),
    openAssignments: (() => {
      const submitted = new Set(
        ((submissions.data ?? []) as Row[]).map((row) => row.assignment_id),
      );
      return ((assignments.data ?? []) as Row[])
        .filter((row) => !submitted.has(row.id))
        .map((row) => ({
          id: row.id,
          madrasaId: row.madrasa_id,
          classId: row.class_id,
          className: row.classes?.name ?? '',
          lessonId: row.lesson_id ?? null,
          title: row.title,
          instructions: row.instructions,
          assignmentType: row.assignment_type,
          dueAt: row.due_at,
          // Class-wide tallies. They belong to the teacher's view of an
          // assignment and no student screen renders them, so they are not
          // counted here rather than reported as zero; a student cannot read
          // another pupil's submissions to count them in any case.
          submissionCount: 0,
          studentCount: 0,
        })) as Assignment[];
    })(),
    hifzSummary: summariseHifz(hifz),
    attendanceRate: attendanceRate(attendance),
    lastRecitation: null,
  };
}
