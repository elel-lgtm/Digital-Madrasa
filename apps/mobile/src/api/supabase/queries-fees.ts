import { surahName, type Certificate, type FeeStructure, type Invoice, type Payment, type Recitation } from '@digital-madrasa/shared';
import { ApiError, type FeesSummary } from '../types';
import { supabase } from './client';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/**
 * Fees, payments and recitations.
 *
 * As elsewhere, no tenant or parent-link filtering: RLS decides which invoices
 * a caller sees. A parent gets their children's, staff get the madrasa's, and
 * the same query serves both.
 */

function fail(error: { message: string } | null, fallback: string): never {
  throw new ApiError('unknown', error?.message ?? fallback);
}

const STUDENT_JOIN = 'students(admission_no, profiles!students_profile_id_fkey(full_name))';

function studentName(row: Row): string {
  return row.students?.profiles?.full_name ?? '';
}

// -------------------------------------------------------------------- fees

export async function listFeeStructures(): Promise<FeeStructure[]> {
  const { data, error } = await supabase
    .from('fee_structures')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) fail(error, 'Could not load fee structures.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    name: row.name,
    academicYear: row.academic_year,
    term: row.term,
    amount: Number(row.amount),
    currency: row.currency ?? 'KES',
    appliesTo: row.applies_to,
    classId: row.class_id ?? null,
    isActive: row.is_active ?? true,
  }));
}

export async function listInvoices(params: {
  studentId?: string;
  status?: Invoice['status'];
}): Promise<Invoice[]> {
  let query = supabase
    .from('invoices')
    .select(`*, ${STUDENT_JOIN}`)
    .order('issued_at', { ascending: false });

  if (params.studentId) query = query.eq('student_id', params.studentId);
  if (params.status) query = query.eq('status', params.status);

  const { data, error } = await query;
  if (error) fail(error, 'Could not load invoices.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    studentId: row.student_id,
    studentName: studentName(row),
    admissionNo: row.students?.admission_no ?? '',
    invoiceNo: row.invoice_no,
    feeStructureId: row.fee_structure_id,
    description: row.description ?? row.invoice_no,
    amountDue: Number(row.amount_due),
    amountPaid: Number(row.amount_paid),
    currency: row.currency ?? 'KES',
    dueDate: row.due_date,
    status: row.status,
    issuedAt: row.issued_at,
    notes: row.notes ?? null,
  }));
}

export async function getFeesSummary(): Promise<FeesSummary> {
  const invoices = await listInvoices({});

  return {
    collected: invoices.reduce((sum, i) => sum + i.amountPaid, 0),
    outstanding: invoices.reduce((sum, i) => sum + (i.amountDue - i.amountPaid), 0),
    overdueCount: invoices.filter((i) => i.status === 'overdue').length,
    currency: 'KES',
  };
}

export async function listPayments(params: { studentId?: string }): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, payment_allocations(invoice_id)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) fail(error, 'Could not load payments.');

  const rows = (data ?? []).map((row: Row) => ({
    id: row.id,
    madrasaId: row.madrasa_id,
    invoiceIds: (row.payment_allocations ?? []).map((a: Row) => a.invoice_id),
    parentId: row.parent_id ?? null,
    amount: Number(row.amount),
    currency: row.currency ?? 'KES',
    method: row.method,
    providerRef: row.provider_ref ?? null,
    checkoutRequestId: row.checkout_request_id ?? null,
    status: row.status,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? null,
    receiptNo: null,
  }));

  // Narrowing only; RLS already bounded the set.
  return params.studentId
    ? rows.filter((p) => p.invoiceIds.length > 0)
    : rows;
}

// ------------------------------------------------------------- recitations

export async function listRecitations(params: {
  studentId?: string;
  pendingReviewOnly?: boolean;
}): Promise<Recitation[]> {
  let query = supabase
    .from('recitations')
    .select(`*, ${STUDENT_JOIN}, tajweed_feedback(*)`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (params.studentId) query = query.eq('student_id', params.studentId);

  const { data, error } = await query;
  if (error) fail(error, 'Could not load recitations.');

  const rows = (data ?? []).map(mapRecitation);
  return params.pendingReviewOnly
    ? rows.filter((r) => r.feedback !== null && r.feedback.reviewedByTeacherId === null)
    : rows;
}

export async function getRecitation(recitationId: string): Promise<Recitation> {
  const { data, error } = await supabase
    .from('recitations')
    .select(`*, ${STUDENT_JOIN}, tajweed_feedback(*)`)
    .eq('id', recitationId)
    .maybeSingle();

  if (error) fail(error, 'Could not load that recitation.');
  if (!data) throw new ApiError('not_found', 'Recitation not found.');
  return mapRecitation(data);
}

function mapRecitation(row: Row): Recitation {
  const fb = Array.isArray(row.tajweed_feedback) ? row.tajweed_feedback[0] : row.tajweed_feedback;

  return {
    id: row.id,
    studentId: row.student_id,
    studentName: studentName(row),
    madrasaId: row.madrasa_id,
    audioUrl: row.audio_url,
    durationMs: row.duration_ms,
    surahNo: row.surah_no,
    surahName: surahName(row.surah_no),
    ayahFrom: row.ayah_from,
    ayahTo: row.ayah_to,
    qiraahStyle: row.qiraah_style,
    createdAt: row.created_at,
    feedback: fb
      ? {
          overallScore: Number(fb.overall_score),
          findings: fb.errors ?? [],
          modelVersion: fb.model_version,
          processingMs: fb.processing_ms,
          reviewedByTeacherId: fb.reviewed_by_teacher_id ?? null,
          teacherOverride: fb.teacher_override ?? null,
        }
      : null,
  } as Recitation;
}

export async function listCertificates(studentId: string): Promise<Certificate[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select(`*, ${STUDENT_JOIN}`)
    .eq('student_id', studentId)
    .order('issued_at', { ascending: false });

  if (error) fail(error, 'Could not load certificates.');

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: studentName(row),
    kind: row.kind,
    title: row.title,
    issuedAt: row.issued_at,
    verificationCode: row.verification_code,
    pdfUrl: row.pdf_url ?? null,
  }));
}
