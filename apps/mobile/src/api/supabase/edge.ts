import type {
  VoiceLang,
  CreateRecitationInput,
  CreateStudentInput,
  DecideLinkInput,
  InviteTeacherInput,
  InvoiceBatchPreview,
  InvoiceBatchResult,
  InitiatePaymentInput,
  IssueInvoicesInput,
  ParentLink,
  PayFeesInput,
  Payment,
  StartSubscriptionPaymentInput,
  SubscriptionPayment,
  Recitation,
  Teacher,
  Student,
} from '@digital-madrasa/shared';
import { ApiError, type PaymentIntent, type SponsorInput, type VoiceReport } from '../types';
import { invokeFunction } from './functions';
import { listLinkRequests } from './queries-comms';
import { getRecitation } from './queries-fees';
import { uploadRecitationAudio } from './storage';

/**
 * API methods backed by deployed Edge Functions.
 *
 * Each one is a thin translation layer. The client-side Zod schemas and the
 * function request bodies were written separately and do not line up field for
 * field, so the mapping is made explicit here rather than left to coincidence.
 * Every difference is commented at the point it occurs.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

// ---------------------------------------------------------------- students

/**
 * `createStudent` -> `create-student`
 *
 * Needs a function because minting the child's login requires the Auth admin
 * API. The admission number is issued by a database trigger, so it is neither
 * sent nor accepted here.
 *
 * Schema difference: `createStudentSchema` carries `guardianPhone`, which the
 * function does not store — there is no column for it on `students`. It is
 * dropped rather than silently sent.
 */
/** voice-report builds the text from the child's records (RLS) and speaks it. */
export async function getVoiceReport(studentId: string, lang: VoiceLang): Promise<VoiceReport> {
  const body = await invokeFunction<VoiceReport>('voice-report', { body: { studentId, lang } });
  return { text: body.text, lang: body.lang ?? lang, audio: body.audio ?? null };
}

export async function createStudent(input: CreateStudentInput): Promise<Student> {
  const body = await invokeFunction<Row>('create-student', {
    body: {
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      classId: input.classId ?? null,
      guardianNotes: input.guardianNotes ?? null,
      ...(input.admissionYear !== undefined ? { admissionYear: input.admissionYear } : {}),
    },
  });

  return {
    id: body.id,
    profileId: body.profileId,
    madrasaId: body.madrasaId,
    fullName: body.fullName,
    admissionNo: body.admissionNo,
    admissionYear: body.admissionYear,
    dateOfBirth: body.dateOfBirth,
    gender: body.gender,
    classId: body.classId ?? null,
    className: body.className ?? null,
    enrollmentStatus: body.enrollmentStatus,
    guardianNotes: body.guardianNotes ?? null,
    // A new pupil starts without consent; a parent or the madrasa turns it on.
    aiFeedbackConsent: false,
    avatarUrl: body.avatarUrl ?? null,
    createdAt: body.createdAt,
  };
}

// ------------------------------------------------------------ parent links

/**
 * `linkChild` -> `link-child`
 *
 * Must be a function: a parent has no read access to `students` they are not
 * yet linked to, and giving them one would let them walk the admission-number
 * space. Every failure returns one generic message by design, so this maps a
 * miss to `not_found` without trying to explain it.
 *
 * Schema difference: the client sends `childDateOfBirth`; the function reads
 * `dateOfBirth`. `childLastName` has no server-side counterpart yet and is not
 * sent.
 */
export async function linkChild(input: {
  admissionNo: string;
  relationship: string;
  childDateOfBirth?: string;
  childLastName?: string;
}): Promise<{ madrasaName: string }> {
  const body = await invokeFunction<{ madrasaName?: string }>('link-child', {
    body: {
      admissionNo: input.admissionNo,
      relationship: input.relationship,
      ...(input.childDateOfBirth ? { dateOfBirth: input.childDateOfBirth } : {}),
    },
  });

  return { madrasaName: body.madrasaName ?? '' };
}

/**
 * `decideLinkRequest` -> `decide-link`
 *
 * The function also accepts `revoked`, which `revokeLink` below uses. The
 * client schema only allows approve/reject, so the wider value is reached
 * through the dedicated method rather than by loosening the schema.
 *
 * The function returns `{ id, status }`; the app's contract wants a full
 * `ParentLink`, so the decided row is read back through the normal RLS-bound
 * query rather than reconstructed from the request.
 */
export async function decideLinkRequest(input: DecideLinkInput): Promise<ParentLink> {
  await invokeFunction<{ id: string; status: string }>('decide-link', {
    body: {
      linkId: input.linkId,
      decision: input.decision,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });

  const links = await listLinkRequests();
  const updated = links.find((l) => l.id === input.linkId);
  if (!updated) {
    throw new ApiError('not_found', 'That request could not be read back.');
  }
  return updated;
}

/** `revokeLink` -> `decide-link` with `decision: 'revoked'`. */
export async function revokeLink(linkId: string): Promise<void> {
  await invokeFunction('decide-link', {
    body: { linkId, decision: 'revoked', reason: 'Revoked by staff' },
  });
}

// ---------------------------------------------------------------- invoices

/**
 * `issueInvoices` -> `issue-invoices`
 *
 * Needs a function because invoice numbers must be gapless per madrasa, which
 * a client-side `count + 1` cannot do without racing.
 *
 * Schema difference: the client schema has `notes`, which the function does
 * not accept — it composes the description from the fee structure instead.
 *
 * The target travels with the request and the function refuses one without it.
 * Both calls send the same body; `preview` only decides whether anything is
 * written, so what the review step counts and what the confirm step charges
 * cannot drift apart.
 */
function issueBody(input: IssueInvoicesInput, preview: boolean) {
  return {
    feeStructureId: input.feeStructureId,
    dueDate: input.dueDate,
    scope: input.scope,
    studentId: input.studentId,
    classId: input.classId,
    preview,
  };
}

export async function previewInvoices(input: IssueInvoicesInput): Promise<InvoiceBatchPreview> {
  return invokeFunction<InvoiceBatchPreview>('issue-invoices', {
    body: issueBody(input, true),
  });
}

export async function issueInvoices(input: IssueInvoicesInput): Promise<InvoiceBatchResult> {
  const body = await invokeFunction<InvoiceBatchResult>('issue-invoices', {
    body: issueBody(input, false),
  });

  // The invoice numbers are the server's. Nothing here fills a gap in them.
  return { ...body, created: body.created ?? 0, invoices: body.invoices ?? [] };
}

/**
 * `inviteTeacher` -> `invite-teacher`
 *
 * Needs a function because adding a teacher creates their login, and the Auth
 * admin API needs the service-role key — which must never reach the device.
 *
 * No email is sent. The project has no mail sender, so the new teacher takes
 * the account over through the app's own password-reset flow; the response
 * carries `deliveredByEmail: false` so the screen can say so rather than imply
 * an invitation is on its way.
 */
export async function inviteTeacher(input: InviteTeacherInput): Promise<Teacher> {
  return invokeFunction<Teacher>('invite-teacher', {
    body: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      specialisation: input.specialisation,
      qiraahStyles: input.qiraahStyles,
    },
  });
}

// -------------------------------------------------------------- attendance

/**
 * `getAttendanceQrToken` -> `attendance-qr` (GET)
 *
 * The token is an HMAC the server computes from a rotating 30-second window,
 * so it cannot be produced on the device.
 */
export async function getAttendanceQrToken(
  classId: string,
): Promise<{ token: string; expiresAt: string }> {
  const body = await invokeFunction<{ token: string; expiresAt: string }>('attendance-qr', {
    method: 'GET',
    query: { classId },
  });

  return { token: body.token, expiresAt: body.expiresAt };
}

/**
 * `markAttendanceByQr` -> `attendance-qr` (POST)
 *
 * The app's signature carries a `studentId`, but the function ignores it and
 * derives the student from the session — a scanned code must never be able to
 * mark someone else present. It is accepted here and deliberately not sent.
 */
export async function markAttendanceByQr(params: {
  token: string;
  studentId: string;
}): Promise<{ status: 'present'; sessionDate: string; classId: string }> {
  const result = await invokeFunction<{
    status: string;
    sessionDate: string;
    classId: string;
  }>('attendance-qr', { body: { token: params.token } });

  // The function only ever records a scan as present; a different status can
  // only come from a teacher marking manually. The date and class it answers
  // with are passed on so the confirmation can name what was recorded rather
  // than the screen inventing it.
  return { status: 'present', sessionDate: result.sessionDate, classId: result.classId };
}

/**
 * `createRecitation` -> Storage upload, then `evaluate-recitation` (POST)
 *
 * This is the one method that does real work before it reaches a function.
 * The app records to a local `file://` URI, and the evaluation endpoint wants
 * a path inside the private bucket — the two are both strings and mean
 * entirely different things, so the upload happens here rather than being
 * papered over by passing the local URI along.
 *
 * Order matters. The audio must exist in Storage before the row is created,
 * because the function checks the path is inside the caller's tenant folder
 * and then stores it as `audio_url`. A row written first would point at
 * nothing.
 *
 * Feedback is produced synchronously by the same call, so the recitation is
 * re-read afterwards and returned complete rather than being reconstructed
 * from the response — the screen then renders the same shape it would get
 * from any later read.
 */
export async function createRecitation(input: CreateRecitationInput): Promise<Recitation> {
  const storagePath = await uploadRecitationAudio(input.localUri);

  const result = await invokeFunction<{ id: string }>('evaluate-recitation', {
    body: {
      action: 'evaluate',
      storagePath,
      durationMs: input.durationMs,
      surahNo: input.surahFrom,
      ayahFrom: input.ayahFrom,
      ayahTo: input.ayahTo,
      qiraahStyle: input.qiraahStyle,
    },
  });

  return getRecitation(result.id);
}

/**
 * `awaitTajweedFeedback` -> a plain read.
 *
 * The mock models evaluation as a background job that the screen polls for.
 * The deployed function scores during `evaluate` and returns once the
 * `tajweed_feedback` row exists, so by the time the feedback screen mounts
 * there is nothing left to wait for and reading the recitation is the whole
 * job. The name is kept because the screen and the mock share it.
 */
export async function awaitTajweedFeedback(recitationId: string): Promise<Recitation> {
  return getRecitation(recitationId);
}

// ---------------------------------------------------------------- payments

/**
 * Payments -> `payments`
 *
 * The function records the attempt and asks M-Pesa to prompt the phone; the
 * outcome is settled on the server, and these calls only ever ask what it
 * was. No amount is sent — it is derived from the invoices server-side.
 *
 * A card payment sends only the invoice ids: the function answers with the
 * gateway's hosted checkout page, where the card is entered, so no card data
 * ever passes through the app.
 */
export async function payFees(input: PayFeesInput): Promise<PaymentIntent> {
  return invokeFunction<PaymentIntent>('payments', {
    body: input.channel === 'card'
      ? { action: 'pay-fees', channel: 'card', invoiceIds: input.invoiceIds }
      : { action: 'pay-fees', channel: 'mpesa', invoiceIds: input.invoiceIds, phone: input.phone },
  });
}

/** A sponsor pays a listed pupil's next invoice; the server sets the amount. */
export async function sponsorStudent(input: SponsorInput): Promise<PaymentIntent> {
  return invokeFunction<PaymentIntent>('payments', {
    body: input.channel === 'card'
      ? { action: 'sponsor', channel: 'card', studentId: input.studentId }
      : { action: 'sponsor', channel: 'mpesa', studentId: input.studentId, phone: input.phone },
  });
}

/** The older M-Pesa-only entry point; same request as `payFees`. */
export async function initiatePayment(input: InitiatePaymentInput): Promise<PaymentIntent> {
  return payFees({ channel: 'mpesa', invoiceIds: input.invoiceIds, phone: input.phone });
}

export async function getPaymentStatus(checkoutRequestId: string): Promise<Payment> {
  return invokeFunction<Payment>('payments', {
    body: { action: 'status', kind: 'fees', checkoutRequestId },
  });
}

export async function startSubscriptionPayment(
  input: StartSubscriptionPaymentInput,
): Promise<PaymentIntent> {
  return invokeFunction<PaymentIntent>('payments', {
    body: input.channel === 'card'
      ? { action: 'pay-subscription', channel: 'card' }
      : { action: 'pay-subscription', channel: 'mpesa', phone: input.phone },
  });
}

export async function getSubscriptionPaymentStatus(
  checkoutRequestId: string,
): Promise<SubscriptionPayment> {
  return invokeFunction<SubscriptionPayment>('payments', {
    body: { action: 'status', kind: 'subscription', checkoutRequestId },
  });
}
