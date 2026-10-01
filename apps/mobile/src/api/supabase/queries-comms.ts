import type {
  Assignment,
  Message,
  Notification,
  NotificationPreferences,
  ParentLink,
  Submission,
  Thread,
} from '@digital-madrasa/shared';
import { ApiError, type SearchResults } from '../types';
import { supabase } from './client';
import { listClasses, listLessons, listStudents } from './queries';
import { listInvoices } from './queries-fees';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function fail(error: { message: string } | null, fallback: string): never {
  throw new ApiError('unknown', error?.message ?? fallback);
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new ApiError('forbidden', 'You are not signed in.');
  return data.user.id;
}

// --------------------------------------------------------------- learning

export async function listAssignments(params: {
  classId?: string | null;
}): Promise<Assignment[]> {
  // The teacher's assignment list renders "submissions / class size" and a
  // progress bar off these two counts. Both were hardcoded, so every
  // assignment read "0 / 0" however many pupils had handed work in.
  //
  // Both arrive as aggregates on the embedded relations rather than as a
  // query per row, and RLS scopes the embedded rows exactly as it scopes the
  // parents, so neither count can span madrasas.
  let query = supabase
    .from('assignments')
    .select('*, classes(name, students(count)), submissions(count)')
    .is('deleted_at', null)
    .is('classes.students.deleted_at', null)
    .order('due_at', { ascending: false });

  if (params.classId) query = query.eq('class_id', params.classId);

  const { data, error } = await query;
  if (error) fail(error, 'Could not load assignments.');

  // For a student, say whether each one has been handed in. RLS returns only
  // the caller's own submission rows, so this cannot reveal classmates' work.
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth.user
    ? await supabase.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
    : { data: null };
  const mine = new Map<string, string>();
  if (me?.role === 'student') {
    const { data: subs } = await supabase
      .from('submissions')
      .select('assignment_id, status')
      .is('deleted_at', null);
    (subs ?? []).forEach((s: Row) => mine.set(s.assignment_id, s.status));
  }

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    classId: row.class_id,
    className: row.classes?.name ?? '',
    lessonId: row.lesson_id ?? null,
    title: row.title,
    instructions: row.instructions,
    assignmentType: row.assignment_type,
    dueAt: row.due_at,
    submissionCount: row.submissions?.[0]?.count ?? 0,
    studentCount: row.classes?.students?.[0]?.count ?? 0,
    ...(me?.role === 'student'
      ? { mySubmissionStatus: (mine.get(row.id) ?? 'not_submitted') as Assignment['mySubmissionStatus'] }
      : {}),
  }));
}

export async function listSubmissions(assignmentId: string): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select(
      '*, assignments(title), students(profiles!students_profile_id_fkey(full_name))',
    )
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });

  if (error) fail(error, 'Could not load submissions.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    assignmentTitle: row.assignments?.title ?? '',
    studentId: row.student_id,
    studentName: row.students?.profiles?.full_name ?? '',
    madrasaId: row.madrasa_id,
    audioUrl: row.audio_url ?? null,
    textBody: row.text_body ?? null,
    submittedAt: row.submitted_at,
    status: row.status,
    score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
  }));
}

// ----------------------------------------------------------- parent links

export async function listLinkRequests(status?: ParentLink['status']): Promise<ParentLink[]> {
  let query = supabase
    .from('parent_student_links')
    .select(
      '*, parents(profiles!parents_profile_id_fkey(full_name, phone)), students(admission_no, profiles!students_profile_id_fkey(full_name))',
    )
    .order('requested_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) fail(error, 'Could not load link requests.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    parentId: row.parent_id,
    parentName: row.parents?.profiles?.full_name ?? '',
    parentPhone: row.parents?.profiles?.phone ?? null,
    studentId: row.student_id,
    studentName: row.students?.profiles?.full_name ?? '',
    admissionNo: row.students?.admission_no ?? '',
    madrasaId: row.madrasa_id,
    relationship: row.relationship,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at ?? null,
  }));
}

// ------------------------------------------------------------ comms

export async function listMail(): Promise<Row[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    // A new-message push opens the conversation; it is not inbox mail.
    .neq('type', 'message')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) fail(error, 'Could not load your inbox.');

  // The inbox is a view over notifications rather than its own table: every
  // fee notice, receipt and report card already arrives as one.
  return (data ?? []).map((row: Row) => ({
    id: row.id,
    userId: row.user_id,
    kind: row.type,
    title: row.title,
    preview: String(row.body ?? '').slice(0, 120),
    body: row.body ?? '',
    payload: row.payload ?? {},
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
    attachmentLabel: null,
  }));
}

export async function listNotifications(): Promise<Notification[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) fail(error, 'Could not load notifications.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body ?? '',
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
    deeplink: null,
  }));
}

export async function markMailRead(mailId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', mailId);
  if (error) fail(error, 'Could not mark that as read.');
}

export async function markAllMailRead(): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) fail(error, 'Could not mark those as read.');
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  return markMailRead(notificationId);
}

export async function listThreads(): Promise<Thread[]> {
  const { data, error } = await supabase
    .from('message_threads')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (error) fail(error, 'Could not load conversations.');

  // The conversation list shows an unread badge that was fed a hardcoded
  // zero, so it never appeared. Unread means addressed to me and not yet
  // read; `messages.read_at` already records that. One query for all threads
  // rather than one per thread, and RLS limits it to messages I may read.
  const { data: auth } = await supabase.auth.getUser();
  const { data: unread } = auth.user
    ? await supabase
        .from('messages')
        .select('thread_id')
        .eq('recipient_id', auth.user.id)
        .is('read_at', null)
        .is('deleted_at', null)
    : { data: [] };

  const unreadByThread = new Map<string, number>();
  for (const m of (unread ?? []) as Row[]) {
    unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
  }

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    subjectName: row.subject_name ?? 'Conversation',
    counterpartId: row.counterpart_id ?? '',
    counterpartName: row.counterpart_name ?? '',
    counterpartRole: row.counterpart_role ?? 'teacher',
    lastMessage: row.last_message ?? '',
    lastMessageAt: row.last_message_at ?? row.created_at,
    unreadCount: unreadByThread.get(row.id) ?? 0,
  }));
}

export async function listMessages(threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at');

  if (error) fail(error, 'Could not load messages.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: '',
    recipientId: row.recipient_id,
    body: row.body,
    attachmentUrl: row.attachment_url ?? null,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
  }));
}

const DEFAULT_PREFS: NotificationPreferences = {
  fees: { push: true, email: true, sms: true },
  attendance: { push: true, email: false, sms: false },
  grades: { push: true, email: true, sms: false },
  announcements: { push: true, email: false, sms: false },
  messages: { push: true, email: false, sms: false },
  progress: { push: false, email: true, sms: false },
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const userId = await currentUserId();
  const { data } = await supabase
    .from('notification_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  return (data?.preferences as NotificationPreferences) ?? DEFAULT_PREFS;
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, preferences: prefs }, { onConflict: 'user_id' });

  if (error) fail(error, 'Could not save your preferences.');
  return prefs;
}

// -------------------------------------------------------------- search

/**
 * One search across the things a user can act on.
 *
 * Each query is separately bounded by RLS, so a parent searching "Hifz" sees
 * their own children's classes and nothing from another family.
 */
export async function search(query: string): Promise<SearchResults> {
  const term = query.trim();
  if (term.length < 2) {
    return { students: [], classes: [], lessons: [], invoices: [] };
  }

  const [students, classes, lessons, invoices] = await Promise.all([
    listStudents(),
    listClasses(),
    listLessons({}),
    listInvoices({}),
  ]);

  const matches = (value: string) => value.toLowerCase().includes(term.toLowerCase());

  return {
    students: students.items.filter((s) => matches(s.fullName) || matches(s.admissionNo)),
    classes: classes.filter((c) => matches(c.name) || matches(c.level)),
    lessons: lessons.filter((l) => matches(l.title)),
    invoices: invoices.filter((i) => matches(i.invoiceNo) || matches(i.studentName)),
  };
}
