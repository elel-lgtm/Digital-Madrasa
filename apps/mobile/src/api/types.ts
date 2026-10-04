import type {
  AdminAuditEntry,
  AdminMadrasa,
  AdminOverview,
  MadrasaLifecycleInput,
  MadrasaStatus,
  Announcement,
  Assignment,
  AttendanceStatus,
  AttendanceRecord,
  Certificate,
  CreateAssignmentInput,
  CreateClassInput,
  CreateFeeStructureInput,
  CreateLessonInput,
  CreateStudentInput,
  DecideLinkInput,
  FeeStructure,
  Grade,
  HifzProgress,
  InitiatePaymentInput,
  InviteTeacherInput,
  Invoice,
  InvoiceBatchPreview,
  InvoiceBatchResult,
  IssueInvoicesInput,
  Klass,
  Lesson,
  LinkChildInput,
  MailItem,
  MarkAttendanceInput,
  Message,
  Notification,
  OnboardingTask,
  Page,
  ParentLink,
  Payment,
  Profile,
  Recitation,
  RecordGradeInput,
  RegisterMadrasaInput,
  RegisterParentInput,
  CancelSubscriptionInput,
  PayFeesInput,
  PaymentChannel,
  ResetPasswordInput,
  SavedCard,
  Session,
  StartSubscriptionPaymentInput,
  Subscription,
  SubscriptionInvoice,
  SubscriptionPayment,
  SendMessageInput,
  SetLessonMeetingInput,
  SignInInput,
  VerifyPasswordResetOtpInput,
  Student,
  Submission,
  TeacherOverrideInput,
  Teacher,
  Thread,
  CreateAnnouncementInput,
  CreateRecitationInput,
  NotificationPreferences,
  GradeSubmissionInput,
  IssueCertificateInput,
  SubmitAssignmentInput,
  UpdateHifzProgressInput,
  VerifiedCertificate,
  HeatmapCell,
} from '@digital-madrasa/shared';

/**
 * Every failure the UI is expected to handle. The mock raises these; the
 * Supabase implementation will map Postgres/Edge Function errors onto the same
 * set, so screens never learn which backend they are talking to.
 */
export type ApiErrorCode =
  | 'invalid_credentials'
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'conflict'
  | 'validation'
  | 'madrasa_suspended'
  /** The madrasa's subscription has lapsed; admin features are locked. */
  | 'subscription_lapsed'
  /** Signup succeeded but the address must be confirmed before signing in. */
  | 'email_confirmation_required'
  /** A scanned attendance code has rotated out of its window. */
  | 'expired_code'
  /** A scanned attendance code belongs to a class the student is not in. */
  | 'wrong_class'
  /** The chosen billing target is wider or narrower than the fee allows. */
  | 'scope_mismatch'
  /** No card gateway is connected; M-Pesa is the way to pay. */
  | 'card_unavailable'
  /** A prompt for this bill is already waiting on a phone. */
  | 'payment_in_progress'
  /** M-Pesa could not be reached, or is not configured. */
  | 'payment_provider'
  /** The Supabase client has no implementation for this call yet. */
  | 'not_implemented'
  | 'network'
  | 'unknown';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** Seconds until the caller may retry, when the server sent Retry-After. */
  readonly retryAfter?: number;

  constructor(code: ApiErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

export interface ListParams {
  cursor?: string | null;
  limit?: number;
}

export interface StudentListParams extends ListParams {
  search?: string;
  classId?: string | null;
}

export interface StudentDetail {
  student: Student;
  attendanceRate: number;
  hifzSummary: HifzSummary;
  recentGrades: Grade[];
  outstandingBalance: number;
  linkedParents: ParentLink[];
}

export interface HifzSummary {
  memorisedAyahs: number;
  totalAyahs: number;
  juzCompleted: number;
  surahsMemorised: number;
  currentStreak: number;
  dueForRevision: number;
}

export interface TeacherDashboard {
  madrasaName: string;
  pendingReviewCount: number;
  pendingLinkRequests: number;
  todaysClasses: { klass: Klass; attendanceMarked: boolean }[];
  studentCount: number;
  attendanceRateThisWeek: number;
  feesCollected: number;
  feesOutstanding: number;
  onboarding: OnboardingTask[];
  recentAnnouncements: Announcement[];
  /** A lesson with a live link that is running right now, if any. */
  liveLesson: Lesson | null;
}

export interface StudentDashboard {
  studentName: string;
  admissionNo: string;
  className: string | null;
  streakDays: number;
  revisionDue: HifzProgress[];
  nextLesson: Lesson | null;
  /** A lesson with a live link that is running right now, if any. */
  liveLesson: Lesson | null;
  openAssignments: Assignment[];
  hifzSummary: HifzSummary;
  attendanceRate: number;
  lastRecitation: Recitation | null;
}

export interface ChildOverview {
  student: Student;
  hifzSummary: HifzSummary;
  attendanceRate: number;
  recentAttendance: AttendanceRecord[];
  grades: Grade[];
  outstandingBalance: number;
  recentRecitations: Recitation[];
  certificates: Certificate[];
}

export interface FeesSummary {
  collected: number;
  outstanding: number;
  overdueCount: number;
  currency: string;
}

export interface ChildBalance {
  studentId: string;
  studentName: string;
  admissionNo: string;
  outstanding: number;
  overdueCount: number;
}

export interface PaymentIntent {
  paymentId: string;
  checkoutRequestId: string;
  amount: number;
  currency: string;
  /** Set for M-Pesa: the handset that will receive the STK prompt. */
  phone: string | null;
  channel: PaymentChannel;
  /**
   * Card only. In production the gateway returns a 3-D Secure URL the app
   * must present in a browser before the charge completes.
   */
  authorisationUrl?: string | null;
}

export interface SearchResults {
  students: Student[];
  classes: Klass[];
  lessons: Lesson[];
  invoices: Invoice[];
}

/**
 * The single seam between the app and its backend. `apps/mobile/src/api/mock.ts`
 * implements it today; a Supabase implementation will replace it without any
 * screen changing.
 */
export interface PasswordResetChallenge {
  /** Seconds the emailed code stays valid. Drives the countdown and resend. */
  expiresInSeconds: number;
  /**
   * Present only in the mock, which has no mail server. The real client
   * returns nothing here, so the demo banner disappears on its own once the
   * Supabase implementation is wired in.
   */
  demoCode?: string;
}

export interface ApiClient {
  // -- auth ---------------------------------------------------------------
  getSession(): Promise<Session | null>;
  signIn(input: SignInInput): Promise<Session>;
  registerMadrasa(input: RegisterMadrasaInput): Promise<Session>;
  registerParent(input: RegisterParentInput): Promise<Session>;
  /** Emails a one-time code. Resolves the same way whether or not the address exists. */
  requestPasswordReset(email: string): Promise<PasswordResetChallenge>;
  verifyPasswordResetOtp(input: VerifyPasswordResetOtpInput): Promise<{ resetToken: string }>;
  resetPassword(input: ResetPasswordInput): Promise<void>;
  signOut(): Promise<void>;
  updateProfile(input: Partial<Pick<Profile, 'fullName' | 'phone' | 'locale'>>): Promise<Profile>;

  // -- madrasa / people ---------------------------------------------------
  listStudents(params: StudentListParams): Promise<Page<Student>>;
  getStudent(studentId: string): Promise<StudentDetail>;
  createStudent(input: CreateStudentInput): Promise<Student>;
  listClasses(): Promise<Klass[]>;
  createClass(input: CreateClassInput): Promise<Klass>;
  listTeachers(): Promise<Teacher[]>;
  inviteTeacher(input: InviteTeacherInput): Promise<Teacher>;

  // -- learning -----------------------------------------------------------
  listLessons(params: { classId?: string | null }): Promise<Lesson[]>;
  createLesson(input: CreateLessonInput): Promise<Lesson>;
  /** Attaches (or clears, with null) the live session link on a lesson. */
  setLessonMeetingUrl(input: SetLessonMeetingInput): Promise<Lesson>;
  listAssignments(params: { classId?: string | null }): Promise<Assignment[]>;
  createAssignment(input: CreateAssignmentInput): Promise<Assignment>;
  listSubmissions(assignmentId: string): Promise<Submission[]>;
  /** The signed-in student's own submission for an assignment, if any. */
  getMySubmission(assignmentId: string): Promise<Submission | null>;
  /** Hands in, or revises while unmarked or returned, a written answer. */
  submitAssignment(input: SubmitAssignmentInput): Promise<Submission>;
  /** Staff mark a submission or return it for another attempt. */
  gradeSubmission(input: GradeSubmissionInput): Promise<Submission>;

  listAttendance(params: { classId: string; sessionDate: string }): Promise<AttendanceRecord[]>;
  markAttendance(input: MarkAttendanceInput): Promise<AttendanceRecord[]>;

  listGrades(params: { studentId?: string; classId?: string; term?: string }): Promise<Grade[]>;
  recordGrade(input: RecordGradeInput): Promise<Grade>;

  // -- recitation & AI ----------------------------------------------------
  listRecitations(params: { studentId?: string; pendingReviewOnly?: boolean }): Promise<Recitation[]>;
  getRecitation(recitationId: string): Promise<Recitation>;
  /**
   * A short-lived URL for playing a stored recitation. Takes the storage path
   * from `Recitation.audioUrl`; the bucket stays private and no permanent URL
   * is ever created.
   */
  getRecitationAudioUrl(storagePath: string): Promise<string>;
  createRecitation(input: CreateRecitationInput): Promise<Recitation>;
  /** Resolves once the evaluation job finishes; mirrors the Edge Function. */
  awaitTajweedFeedback(recitationId: string): Promise<Recitation>;
  saveTeacherOverride(input: TeacherOverrideInput): Promise<Recitation>;

  listHifzProgress(studentId: string): Promise<HifzProgress[]>;
  /** Staff record where a student has reached in one surah. */
  upsertHifzProgress(input: UpdateHifzProgressInput): Promise<HifzProgress>;

  // -- parent linking -----------------------------------------------------
  listLinkRequests(status?: ParentLink['status']): Promise<ParentLink[]>;
  decideLinkRequest(input: DecideLinkInput): Promise<ParentLink>;
  revokeLink(linkId: string): Promise<void>;
  linkChild(input: LinkChildInput): Promise<{ madrasaName: string }>;
  listChildren(): Promise<Student[]>;
  getChildOverview(studentId: string): Promise<ChildOverview>;

  // -- fees ---------------------------------------------------------------
  listFeeStructures(): Promise<FeeStructure[]>;
  createFeeStructure(input: CreateFeeStructureInput): Promise<FeeStructure>;
  /**
   * What a billing run would charge, and to whom, without raising anything.
   * Answered by the server so the review step shows the set the issue will
   * actually use rather than one the device worked out for itself.
   */
  previewInvoices(input: IssueInvoicesInput): Promise<InvoiceBatchPreview>;
  issueInvoices(input: IssueInvoicesInput): Promise<InvoiceBatchResult>;
  listInvoices(params: { studentId?: string; status?: Invoice['status'] }): Promise<Invoice[]>;
  getFeesSummary(): Promise<FeesSummary>;
  getChildBalances(): Promise<ChildBalance[]>;
  listPayments(params: { studentId?: string }): Promise<Payment[]>;
  initiatePayment(input: InitiatePaymentInput): Promise<PaymentIntent>;
  getPaymentStatus(checkoutRequestId: string): Promise<Payment>;
  /** Fee payment by M-Pesa or card. Amounts are derived from the invoices. */
  payFees(input: PayFeesInput): Promise<PaymentIntent>;

  // -- subscription (madrasa owner pays the platform) ----------------------
  getSubscription(): Promise<Subscription>;
  listSubscriptionInvoices(): Promise<SubscriptionInvoice[]>;
  listSubscriptionPayments(): Promise<SubscriptionPayment[]>;
  /** Charges the current amount due. The price is never sent by the client. */
  startSubscriptionPayment(input: StartSubscriptionPaymentInput): Promise<PaymentIntent>;
  getSubscriptionPaymentStatus(checkoutRequestId: string): Promise<SubscriptionPayment>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<Subscription>;
  resumeSubscription(): Promise<Subscription>;

  // -- saved cards ---------------------------------------------------------
  listSavedCards(): Promise<SavedCard[]>;
  removeSavedCard(cardId: string): Promise<void>;
  setDefaultCard(cardId: string): Promise<void>;

  // -- platform admin (web console) ---------------------------------------
  /** Platform admins only. Counts and totals; no pupil records. */
  getAdminOverview(): Promise<AdminOverview>;
  listAdminMadrasas(): Promise<AdminMadrasa[]>;
  listAdminAudit(params: { madrasaId?: string }): Promise<AdminAuditEntry[]>;
  /** Suspend, schedule deletion, reinstate or purge. Audited server-side. */
  changeMadrasaStatus(input: MadrasaLifecycleInput): Promise<{ status: MadrasaStatus }>;

  // -- push ---------------------------------------------------------------
  /** Ties this device's Expo push token to the signed-in account. */
  registerPushToken(token: string, platform: 'android' | 'ios'): Promise<void>;
  /** Called before sign-out, so the device stops receiving for the account. */
  unregisterPushToken(token: string): Promise<void>;

  // -- communication ------------------------------------------------------
  listAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement>;
  listMail(): Promise<MailItem[]>;
  markMailRead(mailId: string): Promise<void>;
  markAllMailRead(): Promise<void>;
  listThreads(): Promise<Thread[]>;
  listMessages(threadId: string): Promise<Message[]>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  listNotifications(): Promise<Notification[]>;
  getNotificationPreferences(): Promise<NotificationPreferences>;
  saveNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences>;

  // -- dashboards & misc --------------------------------------------------
  getTeacherDashboard(): Promise<TeacherDashboard>;
  getStudentDashboard(): Promise<StudentDashboard>;
  search(query: string): Promise<SearchResults>;
  listCertificates(studentId: string): Promise<Certificate[]>;
  /** Staff award a certificate; the verification code is issued by the server. */
  issueCertificate(input: IssueCertificateInput): Promise<Certificate>;
  withdrawCertificate(certificateId: string): Promise<void>;
  /** An approved parent or the pupil's madrasa allows AI feedback on recordings. */
  setAiFeedbackConsent(studentId: string, allowed: boolean): Promise<void>;
  /** The signed-in teacher's own chain of transmission (sanad), sheikh first. */
  getMySanad(): Promise<string[]>;
  /** Staff: tajweed findings per ayah and rule across the madrasa, over the last `days`. */
  getTajweedHeatmap(days: number): Promise<HeatmapCell[]>;
  setMySanad(chain: string[]): Promise<string[]>;
  /** Public check of a certificate code; works without signing in. */
  verifyCertificate(code: string): Promise<VerifiedCertificate | null>;
  /** Rotating QR payload for attendance; refreshes every 30 seconds. */
  getAttendanceQrToken(classId: string): Promise<{ token: string; expiresAt: string }>;
  markAttendanceByQr(params: {
    token: string;
    studentId: string;
  }): Promise<{ status: AttendanceStatus; sessionDate: string; classId: string }>;
}
