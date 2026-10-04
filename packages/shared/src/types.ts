import type {
  BillingInterval,
  CardBrand,
  PaymentChannel,
  PaymentProvider,
  SubscriptionStatus,
} from './billing';
import type {
  AttendanceStatus,
  HifzStatus,
  InvoiceStatus,
  Locale,
  MadrasaStatus,
  PaymentStatus,
  QiraahStyle,
  Role,
  TajweedRule,
  TajweedSeverity,
} from './constants';

/**
 * Domain models as the app consumes them. These mirror the Postgres tables but
 * use camelCase and resolve the joins the UI actually needs, so screens never
 * assemble data by hand.
 */

export type ID = string;

export interface Profile {
  id: ID;
  role: Role;
  madrasaId: ID | null;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  locale: Locale;
  /** Server-set only. No client path can ever write this. */
  isPlatformAdmin: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Madrasa {
  id: ID;
  name: string;
  slug: string;
  county: string;
  town: string;
  ownerId: ID;
  logoUrl: string | null;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  status: MadrasaStatus;
  createdAt: string;
  studentCount: number;
  teacherCount: number;
}

export interface Student {
  id: ID;
  profileId: ID;
  madrasaId: ID;
  /** `DM-YYYY-XXXX`, issued by a database trigger. Read-only everywhere. */
  admissionNo: string;
  admissionYear: number;
  fullName: string;
  avatarUrl: string | null;
  dateOfBirth: string;
  gender: 'male' | 'female';
  classId: ID | null;
  className: string | null;
  enrollmentStatus: 'active' | 'graduated' | 'withdrawn';
  guardianNotes: string | null;
  /** Recordings may be sent to the AI service for feedback (migration 0028). */
  aiFeedbackConsent: boolean;
  createdAt: string;
}

export interface Teacher {
  id: ID;
  profileId: ID;
  madrasaId: ID;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  employeeNo: string;
  specialisation: string | null;
  qiraahStyles: QiraahStyle[];
  isOwner: boolean;
  status: 'active' | 'invited' | 'suspended';
  classCount: number;
}

export interface ClassSession {
  day: string;
  startTime: string;
  endTime: string;
}

export interface Klass {
  id: ID;
  madrasaId: ID;
  name: string;
  level: string;
  teacherId: ID | null;
  teacherName: string | null;
  schedule: ClassSession[];
  capacity: number;
  studentCount: number;
}

export interface ParentLink {
  id: ID;
  parentId: ID;
  parentName: string;
  parentPhone: string | null;
  studentId: ID;
  studentName: string;
  admissionNo: string;
  madrasaId: ID;
  relationship: 'father' | 'mother' | 'guardian';
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
}

export interface Lesson {
  id: ID;
  madrasaId: ID;
  classId: ID;
  className: string;
  /**
   * Teacher of the lesson's class, denormalised alongside `className`.
   * Decides who may attach or change the live session link.
   */
  teacherId: ID | null;
  title: string;
  surahFrom: number;
  ayahFrom: number;
  surahTo: number;
  ayahTo: number;
  qiraahStyle: QiraahStyle;
  resourceUrls: string[];
  scheduledFor: string | null;
  notes: string | null;
  /**
   * Google Meet / Teams / Zoom link for the live session, or null if this
   * lesson is in-person only. Validated against a host allowlist.
   */
  meetingUrl: string | null;
}

export interface Assignment {
  id: ID;
  madrasaId: ID;
  classId: ID;
  className: string;
  lessonId: ID | null;
  title: string;
  instructions: string;
  assignmentType: 'memorisation' | 'recitation' | 'tajweed' | 'written';
  dueAt: string;
  submissionCount: number;
  studentCount: number;
  /** Present when fetched in a student context. */
  mySubmissionStatus?: 'not_submitted' | 'pending' | 'graded' | 'returned';
}

export interface Submission {
  id: ID;
  assignmentId: ID;
  assignmentTitle: string;
  studentId: ID;
  studentName: string;
  madrasaId: ID;
  audioUrl: string | null;
  textBody: string | null;
  submittedAt: string;
  status: 'pending' | 'graded' | 'returned';
  score: number | null;
}

export interface HifzProgress {
  id: ID;
  studentId: ID;
  surahNo: number;
  surahName: string;
  juzNo: number;
  ayahNo: number;
  status: HifzStatus;
  confidenceScore: number;
  lastRevisedAt: string | null;
  nextReviewAt: string | null;
}

export interface TajweedFinding {
  surahNo: number;
  ayahNo: number;
  wordIndex: number;
  rule: TajweedRule;
  severity: TajweedSeverity;
  note: string;
}

export interface Recitation {
  id: ID;
  studentId: ID;
  studentName: string;
  madrasaId: ID;
  audioUrl: string;
  durationMs: number;
  surahNo: number;
  surahName: string;
  ayahFrom: number;
  ayahTo: number;
  qiraahStyle: QiraahStyle;
  createdAt: string;
  /** `null` while the evaluation job is still running. */
  feedback: {
    /** Null unless `assessment` is 'assessed'. Never a stand-in score. */
    overallScore: number | null;
    /** Why there is or is not an AI score: consent off, or AI unavailable. */
    assessment: 'assessed' | 'not_consented' | 'unavailable';
    errors: TajweedFinding[];
    modelVersion: string;
    processingMs: number;
    reviewedByTeacherId: ID | null;
    teacherOverride: { overallScore: number; remarks: string } | null;
  } | null;
  syncState: 'synced' | 'pending_upload' | 'uploading' | 'failed';
}

export interface AttendanceRecord {
  id: ID;
  studentId: ID;
  studentName: string;
  classId: ID;
  sessionDate: string;
  status: AttendanceStatus;
  method: 'manual' | 'qr';
  note: string | null;
}

export interface Grade {
  id: ID;
  studentId: ID;
  studentName: string;
  classId: ID;
  term: string;
  subject: string;
  score: number;
  maxScore: number;
  remarks: string | null;
  issuedAt: string;
}

export interface FeeStructure {
  id: ID;
  madrasaId: ID;
  name: string;
  academicYear: number;
  term: string;
  amount: number;
  currency: string;
  appliesTo: 'all' | 'class' | 'student';
  classId: ID | null;
  /** Set when `appliesTo` is `student`; the one pupil this fee belongs to. */
  studentId: ID | null;
  isActive: boolean;
}

/**
 * What a billing run would do, answered by the server before anything is
 * raised. The counts are the authoritative ones: eligibility and the
 * already-billed rule are evaluated against the database, not guessed from
 * whatever roster the device happens to be holding.
 */
export interface InvoiceBatchPreview {
  scope: 'student' | 'class' | 'madrasa';
  /** Enrolled students the target resolves to. */
  eligible: number;
  /** Of those, the ones that already have an invoice for this fee. */
  alreadyBilled: number;
  /** Invoices this run would actually raise. */
  toIssue: number;
  amount: number;
  currency: string;
  total: number;
}

/** A run that has happened, reported with the numbers the database allocated. */
export interface InvoiceBatchResult extends InvoiceBatchPreview {
  created: number;
  invoices: IssuedInvoice[];
}

export interface IssuedInvoice {
  invoiceNo: string;
  studentName: string;
  amount: number;
  dueDate: string;
}

export interface Invoice {
  id: ID;
  madrasaId: ID;
  studentId: ID;
  studentName: string;
  admissionNo: string;
  invoiceNo: string;
  feeStructureId: ID;
  description: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  dueDate: string;
  status: InvoiceStatus;
  issuedAt: string;
  notes: string | null;
}

export interface Payment {
  id: ID;
  madrasaId: ID;
  invoiceIds: ID[];
  parentId: ID | null;
  amount: number;
  currency: string;
  method: 'mpesa' | 'cash' | 'bank' | 'stripe' | 'card';
  providerRef: string | null;
  checkoutRequestId: string | null;
  status: PaymentStatus;
  createdAt: string;
  settledAt: string | null;
  receiptNo: string | null;
}

// ============================================================ subscriptions

export interface SubscriptionPlan {
  id: ID;
  code: string;
  name: string;
  amount: number;
  currency: string;
  interval: BillingInterval;
  trialDays: number;
  features: string[];
  isActive: boolean;
}

export interface Subscription {
  id: ID;
  madrasaId: ID;
  planId: ID;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelledAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Tokenised card kept for renewals, if the owner opted in. */
  defaultCard: SavedCard | null;
}

export interface SubscriptionInvoice {
  id: ID;
  madrasaId: ID;
  subscriptionId: ID;
  invoiceNo: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: InvoiceStatus;
  issuedAt: string;
}

export interface SubscriptionPayment {
  id: ID;
  madrasaId: ID;
  subscriptionInvoiceId: ID;
  amount: number;
  currency: string;
  channel: PaymentChannel;
  provider: PaymentProvider;
  providerRef: string | null;
  checkoutRequestId: string | null;
  status: PaymentStatus;
  cardLast4: string | null;
  cardBrand: CardBrand | null;
  failureReason: string | null;
  createdAt: string;
  settledAt: string | null;
  receiptNo: string | null;
}

/**
 * A tokenised card. The PAN is never stored — only what is needed to show the
 * owner which card this is, plus the gateway's token.
 */
export interface SavedCard {
  id: ID;
  madrasaId: ID;
  /** Set when a parent saved the card; null when it belongs to the madrasa. */
  parentId: ID | null;
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  holderName: string;
  provider: PaymentProvider;
  isDefault: boolean;
  createdAt: string;
}

export interface Message {
  id: ID;
  threadId: ID;
  senderId: ID;
  senderName: string;
  recipientId: ID;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface Thread {
  id: ID;
  subjectName: string;
  counterpartId: ID;
  counterpartName: string;
  counterpartRole: Role;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface Announcement {
  id: ID;
  madrasaId: ID;
  authorId: ID;
  authorName: string;
  title: string;
  body: string;
  audience: ('students' | 'parents' | 'teachers')[];
  publishAt: string;
  expiresAt: string | null;
}

export type MailKind =
  | 'invoice_issued'
  | 'payment_receipt'
  | 'fee_reminder'
  | 'fee_overdue'
  | 'attendance_alert'
  | 'report_card'
  | 'announcement'
  | 'message'
  | 'progress_summary'
  // Written by Edge Functions: issue-invoices, link-child, decide-link,
  // madrasa-lifecycle. The inbox must render every one of them.
  | 'fee_due'
  | 'link_request'
  | 'link_approved'
  | 'madrasa_status'
  | 'certificate_issued';

export interface MailItem {
  id: ID;
  userId: ID;
  kind: MailKind;
  title: string;
  preview: string;
  body: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  attachmentLabel: string | null;
}

export interface Notification {
  id: ID;
  userId: ID;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  deeplink: string | null;
}

export interface Certificate {
  id: ID;
  studentId: ID;
  studentName: string;
  kind: 'juz_completion' | 'quran_completion' | 'tajweed_level';
  title: string;
  issuedAt: string;
  verificationCode: string;
  pdfUrl: string | null;
  /** Ijazah only: the chain of transmission, the awarding teacher first. */
  sanad?: string[] | null;
}

/** What a public certificate check returns; nothing beyond the certificate itself. */
export interface VerifiedCertificate {
  title: string;
  kind: Certificate['kind'];
  studentName: string;
  madrasaName: string;
  issuedAt: string;
  valid: boolean;
}

export interface AuditEntry {
  id: ID;
  actorId: ID;
  actorName: string;
  actorRole: Role;
  madrasaId: ID | null;
  action: string;
  entityType: string;
  entityId: ID;
  createdAt: string;
  ip: string | null;
}

export interface OnboardingTask {
  key: 'add_class' | 'add_student' | 'invite_teacher' | 'set_fees' | 'invite_parents';
  done: boolean;
}

export interface FeatureFlags {
  aiEvaluation: boolean;
  payments: boolean;
  leaderboard: boolean;
  offlineMode: boolean;
  smsFallback: boolean;
}

/** The authenticated principal as the app holds it in memory. */
export interface Session {
  user: Profile;
  madrasa: Madrasa | null;
  /** Populated for parents: the children they are approved-linked to. */
  children: Student[];
  /** Populated for students: their own student record. */
  student: Student | null;
  /** Populated for staff: their own teacher record, including `isOwner`. */
  teacher: Teacher | null;
  featureFlags: FeatureFlags;
  issuedAt: string;
}

// ============================================================ platform admin

/** The platform at a glance. Counts and totals only — no pupil records. */
export interface AdminOverview {
  madrasas: Record<MadrasaStatus, number>;
  people: { students: number; teachers: number; parents: number };
  subscriptions: Partial<Record<SubscriptionStatus, number>>;
  revenue30d: { subscriptions: number; feesCollected: number; currency: string };
  /** Non-zero `stalled` means notification delivery is not running. */
  delivery: { stalled: number; emailFailed: number; smsFailed: number };
  generatedAt: string;
}

export interface AdminMadrasa {
  id: ID;
  name: string;
  slug: string;
  county: string;
  town: string;
  status: MadrasaStatus;
  createdAt: string;
  suspendedAt: string | null;
  deletionScheduledAt: string | null;
  deletionReason: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  contactPhone: string;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  students: number;
  teachers: number;
  parents: number;
  feesOutstanding: number;
  lastActivityAt: string | null;
}

export interface AdminAuditEntry {
  id: ID;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: ID | null;
  actorName: string;
  actorRole: string | null;
  madrasaId: ID | null;
  madrasaName: string | null;
  reason: string | null;
}
