import {
  getSurah,
  juzForAyah,
  MEMORISED_STATUSES,
  type Certificate,
  type GradeSubmissionInput,
  type HifzProgress,
  type IssueCertificateInput,
  type Submission,
  type SubmitAssignmentInput,
  type UpdateHifzProgressInput,
  type VerifiedCertificate,
} from '@digital-madrasa/shared';
import { ApiError } from '../types';
import { supabase } from './client';
import { mapHifz } from './queries';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/**
 * Learning writes: memorisation progress, written submissions, certificates.
 *
 * Migration 0023 owns the rules. A student cannot mark their own work or
 * choose a certificate code; the database sets both whatever is sent. These
 * functions only shape requests and map rows.
 */

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  const message = error?.message ?? fallback;
  if (error?.code === '42501' || /row-level security/i.test(message)) {
    throw new ApiError('forbidden', 'You do not have permission to do that.');
  }
  if (error?.code === '23505') throw new ApiError('conflict', fallback);
  throw new ApiError('unknown', fallback);
}

// ------------------------------------------------------------ memorisation

/**
 * Records where a student has reached in one surah. For a surah memorised
 * in full the ayah is set to the surah's last ayah, so the stored row and
 * the shared totals (hifz.ts) always agree on what it covers.
 */
export async function upsertHifzProgress(input: UpdateHifzProgressInput): Promise<HifzProgress> {
  const surah = getSurah(input.surahNo);
  if (!surah) throw new ApiError('validation', 'Unknown surah.');
  const whole = MEMORISED_STATUSES.includes(input.status);
  const ayahNo = whole ? surah.ayahCount : Math.min(Math.max(input.ayahNo, 1), surah.ayahCount);

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('madrasa_id')
    .eq('id', input.studentId)
    .maybeSingle();
  if (studentError || !student) throw new ApiError('not_found', 'That student is not in your madrasa.');

  const now = new Date();
  // A revision cycle: the next check falls due in a week once memorised.
  const nextReview = whole ? new Date(now.getTime() + 7 * 86_400_000).toISOString() : null;

  const { data, error } = await supabase
    .from('hifz_progress')
    .upsert(
      {
        student_id: input.studentId,
        madrasa_id: student.madrasa_id,
        surah_no: input.surahNo,
        ayah_no: ayahNo,
        juz_no: juzForAyah(input.surahNo, ayahNo),
        status: input.status,
        confidence_score: input.confidenceScore ?? null,
        last_revised_at: now.toISOString(),
        next_review_at: nextReview,
        deleted_at: null,
      },
      { onConflict: 'student_id,surah_no' },
    )
    .select('*')
    .single();

  if (error) fail(error, 'Could not save the progress.');
  return mapHifz(data);
}

// ------------------------------------------------------------- submissions

function mapSubmission(row: Row): Submission {
  return {
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
  };
}

const SUBMISSION_SELECT =
  '*, assignments(title), students(profiles!students_profile_id_fkey(full_name))';

/** The caller's own submission for an assignment, if any. */
export async function getMySubmission(assignmentId: string): Promise<Submission | null> {
  const { data: student } = await supabase.from('students').select('id').limit(1).maybeSingle();
  if (!student) return null;
  const { data, error } = await supabase
    .from('submissions')
    .select(SUBMISSION_SELECT)
    .eq('assignment_id', assignmentId)
    .eq('student_id', student.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) fail(error, 'Could not load your submission.');
  return data ? mapSubmission(data) : null;
}

/**
 * Hands in (or revises, while unmarked) a written answer. The row is keyed
 * by (assignment, student), so a second submit updates rather than adds.
 */
export async function submitAssignment(input: SubmitAssignmentInput): Promise<Submission> {
  const { data: student } = await supabase
    .from('students')
    .select('id, madrasa_id')
    .limit(1)
    .maybeSingle();
  if (!student) throw new ApiError('forbidden', 'Only students can hand in work.');

  const existing = await getMySubmission(input.assignmentId);
  if (existing && existing.status === 'graded') {
    throw new ApiError('conflict', 'This work has already been marked.');
  }

  const query = existing
    ? supabase
        .from('submissions')
        .update({ text_body: input.textBody })
        .eq('id', existing.id)
        .select(SUBMISSION_SELECT)
        .single()
    : supabase
        .from('submissions')
        .insert({
          assignment_id: input.assignmentId,
          student_id: student.id,
          madrasa_id: student.madrasa_id,
          text_body: input.textBody,
        })
        .select(SUBMISSION_SELECT)
        .single();

  const { data, error } = await query;
  if (error) fail(error, 'Could not hand in your work.');
  return mapSubmission(data);
}

/** Staff mark a submission, or return it for another attempt. */
export async function gradeSubmission(input: GradeSubmissionInput): Promise<Submission> {
  const { data, error } = await supabase
    .from('submissions')
    .update({ score: input.score, status: input.status })
    .eq('id', input.submissionId)
    .select(SUBMISSION_SELECT)
    .single();
  if (error) fail(error, 'Could not save the mark.');
  return mapSubmission(data);
}

// ------------------------------------------------------------ certificates

function mapCertificate(row: Row): Certificate {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.students?.profiles?.full_name ?? '',
    kind: row.kind,
    title: row.title,
    issuedAt: row.issued_at,
    verificationCode: row.verification_code,
    pdfUrl: row.pdf_url ?? null,
    sanad: row.sanad ?? null,
  };
}

export async function issueCertificate(input: IssueCertificateInput): Promise<Certificate> {
  const { data: student } = await supabase
    .from('students')
    .select('madrasa_id')
    .eq('id', input.studentId)
    .maybeSingle();
  if (!student) throw new ApiError('not_found', 'That student is not in your madrasa.');

  const { data, error } = await supabase
    .from('certificates')
    .insert({
      student_id: input.studentId,
      madrasa_id: student.madrasa_id,
      kind: input.kind,
      title: input.title,
      // Required by the column, replaced by the database trigger.
      verification_code: 'pending',
    })
    .select('*, students(profiles!students_profile_id_fkey(full_name))')
    .single();
  if (error) fail(error, 'Could not issue the certificate.');
  return mapCertificate(data);
}

/** Withdrawn certificates stay on record but verify as invalid. */
export async function withdrawCertificate(certificateId: string): Promise<void> {
  // A soft delete through a narrow function: see migration 0023 for why an
  // ordinary update cannot hide the row it just changed.
  const { error } = await supabase.rpc('withdraw_certificate', { p_certificate_id: certificateId });
  if (error) fail(error, 'Could not withdraw the certificate.');
}

/**
 * Allows or stops AI feedback on a pupil's recordings. The database decides
 * who may (an approved parent or the pupil's madrasa) and records who did.
 */
export async function setAiFeedbackConsent(studentId: string, allowed: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_ai_feedback_consent', {
    p_student_id: studentId,
    p_allowed: allowed,
  });
  if (error) fail(error, 'Could not change the AI feedback setting.');
}

/** Public check of a certificate code. Works signed out. */
export async function verifyCertificate(code: string): Promise<VerifiedCertificate | null> {
  const clean = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (clean.length !== 10) return null;
  const { data, error } = await supabase.rpc('verify_certificate', { p_code: clean });
  if (error) fail(error, 'Could not check that code.');
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    title: row.title,
    kind: row.kind as VerifiedCertificate['kind'],
    studentName: row.student_name,
    madrasaName: row.madrasa_name,
    issuedAt: row.issued_at,
    valid: Boolean(row.valid),
    sanad: row.sanad ? String(row.sanad).split('\n') : null,
  };
}

/** The signed-in teacher's chain of transmission. */
export async function getMySanad(): Promise<string[]> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('teachers')
    .select('sanad')
    .eq('profile_id', auth.user?.id ?? '')
    .maybeSingle();
  if (error) fail(error, 'Could not load your chain of transmission.');
  return (data?.sanad as string[] | null) ?? [];
}

/** Saves the teacher's own chain; the database trims and checks it. */
export async function setMySanad(chain: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc('set_my_sanad', { p_chain: chain });
  if (error) fail(error, 'Could not save your chain of transmission.');
  return (data as string[] | null) ?? [];
}
