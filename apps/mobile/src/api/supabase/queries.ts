import {
  liveSessionState,
  surahName,
  type Announcement,
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
  const { data, error } = await supabase
    .from('classes')
    .select('*, teachers(profile_id, profiles!teachers_profile_id_fkey(full_name))')
    .is('deleted_at', null)
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
    studentCount: 0,
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

export async function listAttendance(): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, students(profiles!students_profile_id_fkey(full_name))')
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

  const [attendance, grades, hifz] = await Promise.all([
    supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .order('session_date', { ascending: false })
      .limit(30),
    supabase.from('grades').select('*').eq('student_id', studentId),
    supabase.from('hifz_progress').select('*').eq('student_id', studentId),
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
    outstandingBalance: 0,
    recentRecitations: [],
    certificates: [],
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
  const [madrasaName, students, classes, lessons, attendance, announcements] = await Promise.all([
    currentMadrasaName(),
    listStudents(),
    listClasses(),
    listLessons({}),
    listAttendance(),
    listAnnouncements(),
  ]);

  const { count: pendingLinks } = await supabase
    .from('parent_student_links')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return {
    madrasaName,
    pendingReviewCount: 0,
    pendingLinkRequests: pendingLinks ?? 0,
    todaysClasses: classes.map((klass) => ({ klass, attendanceMarked: false })),
    studentCount: students.items.length,
    attendanceRateThisWeek: attendanceRate(attendance),
    feesCollected: 0,
    feesOutstanding: 0,
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

  const [hifz, attendance, lessons] = await Promise.all([
    listHifzProgress(),
    listAttendance(),
    listLessons({ classId: student.classId }),
  ]);

  const now = Date.now();
  const upcoming = [...lessons]
    .filter((l) => l.scheduledFor && new Date(l.scheduledFor).getTime() > now)
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));

  return {
    studentName: student.fullName,
    admissionNo: student.admissionNo,
    className: student.className,
    streakDays: 0,
    revisionDue: hifz.filter((h) => h.status === 'revising').slice(0, 5),
    nextLesson: upcoming[0] ?? null,
    liveLesson: findLive(lessons),
    openAssignments: [],
    hifzSummary: summariseHifz(hifz),
    attendanceRate: attendanceRate(attendance),
    lastRecitation: null,
  };
}
