import {
  SUBSCRIPTION_CURRENCY,
  type Announcement,
  type AttendanceRecord,
  type CreateAnnouncementInput,
  type CreateAssignmentInput,
  type CreateClassInput,
  type CreateFeeStructureInput,
  type CreateLessonInput,
  type CreateStudentInput,
  type FeeStructure,
  type Grade,
  type Klass,
  type Lesson,
  type MarkAttendanceInput,
  type Message,
  type RecordGradeInput,
  type SavedCard,
  type SendMessageInput,
  type SetLessonMeetingInput,
  type Student,
  type Subscription,
  type SubscriptionInvoice,
  type SubscriptionPayment,
} from '@digital-madrasa/shared';
import { ApiError } from '../types';
import { supabase } from './client';
import { listLessons } from './queries';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/**
 * Writes.
 *
 * Every insert omits the columns the server owns — `admission_no` comes from
 * a trigger, `madrasa_id` from the caller's profile, status fields from
 * server logic. RLS rejects a write that tries to reach outside the caller's
 * tenant, so these do not re-check what the database already enforces.
 */

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  const message = error?.message ?? fallback;
  // A policy refusal reads as a permissions problem, not a server fault.
  if (error?.code === '42501' || /row-level security/i.test(message)) {
    throw new ApiError('forbidden', 'You do not have permission to do that.');
  }
  throw new ApiError('unknown', message);
}

async function currentMadrasaId(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new ApiError('forbidden', 'You are not signed in.');
  const { data } = await supabase
    .from('profiles')
    .select('madrasa_id')
    .eq('id', auth.user.id)
    .maybeSingle();
  const id = data?.madrasa_id as string | null;
  if (!id) throw new ApiError('forbidden', 'Your account is not attached to a madrasa.');
  return id;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new ApiError('forbidden', 'You are not signed in.');
  return data.user.id;
}

// ------------------------------------------------------------------ people

/**
 * Enrols a student.
 *
 * Creating the auth user requires admin privileges the client does not have,
 * so this is the one place a Supabase-only implementation genuinely cannot go
 * the whole way — it needs an Edge Function to mint the login. Reported
 * honestly rather than half-done.
 */
export async function createStudent(_input: CreateStudentInput): Promise<Student> {
  throw new ApiError(
    'not_implemented',
    'Adding a student needs an Edge Function to create their login. Not built yet.',
  );
}

export async function createClass(input: CreateClassInput): Promise<Klass> {
  const madrasaId = await currentMadrasaId();
  const { data, error } = await supabase
    .from('classes')
    .insert({
      madrasa_id: madrasaId,
      name: input.name,
      level: input.level,
      teacher_id: input.teacherId ?? null,
      capacity: input.capacity,
      schedule: input.schedule ?? [],
    })
    .select('*, teachers(profiles!teachers_profile_id_fkey(full_name))')
    .single();

  if (error) fail(error, 'Could not create the class.');

  return {
    id: data.id,
    madrasaId: data.madrasa_id,
    name: data.name,
    level: data.level,
    teacherId: data.teacher_id ?? null,
    teacherName: (data as Row).teachers?.profiles?.full_name ?? null,
    schedule: (data.schedule ?? []) as unknown as Klass["schedule"],
    capacity: data.capacity,
    studentCount: 0,
  };
}

// ---------------------------------------------------------------- learning

export async function createLesson(input: CreateLessonInput): Promise<Lesson> {
  const madrasaId = await currentMadrasaId();
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      madrasa_id: madrasaId,
      class_id: input.classId,
      title: input.title,
      surah_from: input.surahFrom,
      ayah_from: input.ayahFrom,
      surah_to: input.surahTo,
      ayah_to: input.ayahTo,
      qiraah_style: input.qiraahStyle,
      scheduled_for: input.scheduledFor ?? null,
      notes: input.notes ?? null,
      meeting_url: input.meetingUrl ?? null,
    })
    .select('id')
    .single();

  if (error) fail(error, 'Could not create the lesson.');

  const lessons = await listLessons({});
  const created = lessons.find((l) => l.id === data.id);
  if (!created) throw new ApiError('not_found', 'Lesson was created but could not be read back.');
  return created;
}

export async function setLessonMeetingUrl(input: SetLessonMeetingInput): Promise<Lesson> {
  const { error } = await supabase
    .from('lessons')
    .update({ meeting_url: input.meetingUrl })
    .eq('id', input.lessonId);

  if (error) fail(error, 'Could not save the live link.');

  const lessons = await listLessons({});
  const updated = lessons.find((l) => l.id === input.lessonId);
  if (!updated) throw new ApiError('not_found', 'Lesson not found.');
  return updated;
}

export async function createAssignment(input: CreateAssignmentInput): Promise<Row> {
  const madrasaId = await currentMadrasaId();
  const { data, error } = await supabase
    .from('assignments')
    .insert({
      madrasa_id: madrasaId,
      class_id: input.classId,
      lesson_id: input.lessonId ?? null,
      title: input.title,
      instructions: input.instructions,
      assignment_type: input.assignmentType,
      due_at: input.dueAt,
    })
    .select('*, classes(name)')
    .single();

  if (error) fail(error, 'Could not create the assignment.');

  return {
    id: data.id,
    madrasaId: data.madrasa_id,
    classId: data.class_id,
    className: (data as Row).classes?.name ?? '',
    lessonId: data.lesson_id ?? null,
    title: data.title,
    instructions: data.instructions,
    assignmentType: data.assignment_type,
    dueAt: data.due_at,
    submissionCount: 0,
    studentCount: 0,
  };
}

export async function markAttendance(input: MarkAttendanceInput): Promise<AttendanceRecord[]> {
  const madrasaId = await currentMadrasaId();
  const markedBy = await currentUserId();

  const rows = input.entries.map((entry) => ({
    madrasa_id: madrasaId,
    class_id: input.classId,
    student_id: entry.studentId,
    session_date: input.sessionDate,
    status: entry.status,
    method: 'manual' as const,
    marked_by: markedBy,
  }));

  const { data, error } = await supabase
    .from('attendance')
    // One session per student per day: re-marking corrects rather than duplicates.
    .upsert(rows, { onConflict: 'class_id,student_id,session_date' })
    .select('*');

  if (error) fail(error, 'Could not save attendance.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: '',
    classId: row.class_id,
    sessionDate: row.session_date,
    status: row.status,
    method: row.method ?? 'manual',
    note: row.note ?? null,
  }));
}

export async function recordGrade(input: RecordGradeInput): Promise<Grade> {
  const madrasaId = await currentMadrasaId();
  const issuedBy = await currentUserId();

  const { data, error } = await supabase
    .from('grades')
    .insert({
      madrasa_id: madrasaId,
      student_id: input.studentId,
      class_id: input.classId,
      term: input.term,
      subject: input.subject,
      score: input.score,
      max_score: input.maxScore,
      remarks: input.remarks ?? null,
      issued_by: issuedBy,
    })
    .select('*, students(profiles!students_profile_id_fkey(full_name))')
    .single();

  if (error) fail(error, 'Could not save the grade.');

  return {
    id: data.id,
    studentId: data.student_id,
    studentName: (data as Row).students?.profiles?.full_name ?? '',
    classId: data.class_id,
    term: data.term,
    subject: data.subject,
    score: Number(data.score),
    maxScore: Number(data.max_score),
    remarks: data.remarks ?? null,
    issuedAt: data.created_at,
  };
}

// ------------------------------------------------------------------- fees

export async function createFeeStructure(
  input: CreateFeeStructureInput,
): Promise<FeeStructure> {
  const madrasaId = await currentMadrasaId();
  const { data, error } = await supabase
    .from('fee_structures')
    .insert({
      madrasa_id: madrasaId,
      name: input.name,
      academic_year: input.academicYear,
      term: input.term,
      amount: input.amount,
      currency: 'KES',
      applies_to: input.appliesTo,
      class_id: input.classId ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) fail(error, 'Could not create the fee structure.');

  return {
    id: data.id,
    madrasaId: data.madrasa_id,
    name: data.name,
    academicYear: data.academic_year,
    term: data.term,
    amount: Number(data.amount),
    currency: data.currency ?? 'KES',
    appliesTo: data.applies_to,
    classId: data.class_id ?? null,
    isActive: data.is_active,
  };
}

/**
 * Issues invoices for a fee structure.
 *
 * Invoice numbers must be unique and gapless per madrasa, which is a
 * server-side sequence problem, not something a client should attempt with a
 * count query. Needs an Edge Function.
 */
export async function issueInvoices(): Promise<{ created: number }> {
  throw new ApiError(
    'not_implemented',
    'Issuing invoices needs an Edge Function to allocate invoice numbers safely. Not built yet.',
  );
}

// ---------------------------------------------------------- communication

export async function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<Announcement> {
  const madrasaId = await currentMadrasaId();
  const authorId = await currentUserId();

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      madrasa_id: madrasaId,
      author_id: authorId,
      title: input.title,
      body: input.body,
      audience: input.audience as string[],
      publish_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) fail(error, 'Could not publish the announcement.');

  return {
    id: data.id,
    madrasaId: data.madrasa_id,
    authorId: data.author_id,
    authorName: '',
    title: data.title,
    body: data.body,
    audience: (data.audience ?? []) as Announcement["audience"],
    publishAt: data.publish_at,
    expiresAt: data.expires_at ?? null,
  };
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const madrasaId = await currentMadrasaId();
  const senderId = await currentUserId();

  // A message must belong to a thread, so the first message to someone opens
  // one. Doing it here rather than making the caller do it keeps "send" a
  // single action from the screen's point of view.
  let threadId = input.threadId ?? null;
  if (!threadId) {
    const { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        madrasa_id: madrasaId,
        participant_a: senderId,
        participant_b: input.recipientId,
      })
      .select('id')
      .single();
    if (threadError) fail(threadError, 'Could not start the conversation.');
    threadId = thread.id;
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      madrasa_id: madrasaId,
      thread_id: threadId,
      sender_id: senderId,
      recipient_id: input.recipientId,
      body: input.body,
      attachment_url: input.attachmentUrl ?? null,
    })
    .select()
    .single();

  if (error) fail(error, 'Could not send the message.');

  return {
    id: data.id,
    threadId: data.thread_id ?? '',
    senderId: data.sender_id,
    senderName: '',
    recipientId: data.recipient_id,
    body: data.body,
    attachmentUrl: data.attachment_url ?? null,
    createdAt: data.created_at,
    readAt: null,
  };
}

// ----------------------------------------------------------- subscription

export async function getSubscription(): Promise<Subscription> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans(*)')
    .limit(1)
    .maybeSingle();

  if (error) fail(error, 'Could not load your subscription.');
  if (!data) throw new ApiError('not_found', 'No subscription for this madrasa.');

  const plan = (data as Row).subscription_plans ?? {};

  return {
    id: data.id,
    madrasaId: data.madrasa_id,
    planId: data.plan_id,
    plan: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      amount: Number(plan.amount ?? 0),
      currency: plan.currency ?? SUBSCRIPTION_CURRENCY,
      interval: plan.interval ?? 'monthly',
      trialDays: plan.trial_days ?? 30,
      features: plan.features ?? [],
      isActive: plan.is_active ?? true,
    },
    status: data.status,
    trialEndsAt: data.trial_ends_at ?? null,
    currentPeriodStart: data.current_period_start ?? null,
    currentPeriodEnd: data.current_period_end ?? null,
    graceEndsAt: data.grace_ends_at ?? null,
    cancelledAt: data.cancelled_at ?? null,
    cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
    defaultCard: null,
  };
}

export async function listSubscriptionInvoices(): Promise<SubscriptionInvoice[]> {
  const { data, error } = await supabase
    .from('subscription_invoices')
    .select('*')
    .order('issued_at', { ascending: false });

  if (error) fail(error, 'Could not load subscription invoices.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    subscriptionId: row.subscription_id,
    invoiceNo: row.invoice_no,
    amountDue: Number(row.amount_due),
    amountPaid: Number(row.amount_paid),
    currency: row.currency ?? SUBSCRIPTION_CURRENCY,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueDate: row.due_date,
    status: row.status,
    issuedAt: row.issued_at,
  }));
}

export async function listSubscriptionPayments(): Promise<SubscriptionPayment[]> {
  const { data, error } = await supabase
    .from('subscription_payments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) fail(error, 'Could not load subscription payments.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    subscriptionInvoiceId: row.subscription_invoice_id,
    amount: Number(row.amount),
    currency: row.currency ?? SUBSCRIPTION_CURRENCY,
    channel: row.channel,
    provider: row.provider,
    providerRef: row.provider_ref ?? null,
    checkoutRequestId: row.checkout_request_id ?? null,
    status: row.status,
    cardLast4: row.card_last4 ?? null,
    cardBrand: row.card_brand ?? null,
    failureReason: row.failure_reason ?? null,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? null,
    receiptNo: null,
  }));
}

export async function listSavedCards(): Promise<SavedCard[]> {
  const { data, error } = await supabase
    .from('saved_cards')
    .select('*')
    .is('deleted_at', null);

  if (error) fail(error, 'Could not load your cards.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    parentId: row.parent_id ?? null,
    brand: row.brand,
    last4: row.last4,
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    holderName: row.holder_name,
    provider: row.provider,
    isDefault: row.is_default ?? false,
    createdAt: row.created_at,
  }));
}

export async function removeSavedCard(cardId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_cards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', cardId);
  if (error) fail(error, 'Could not remove that card.');
}

