import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MEMORISED_STATUSES,
  getSurah,
  juzForAyah,
  summariseHifzRows,
  MPESA_FAILURES,
  maskKenyanPhone,
  mpesaFailureCode,
  mpesaStyleCode,
  simulatedResultCode,
  youtubeId,
  voiceReportText,
  madrasaLifecycleSchema,
  type AdminMadrasa,
  type AdminOverview,
  type AuditEntry,
  type HeatmapCell,
  type PupilSignals,
  type SponsorablePupil,
  type ClassVideo,
  type VoiceLang,
  type MadrasaLifecycleInput,
  type MadrasaStatus,
  type Certificate,
  type HifzProgress,
  type Submission,
  GRACE_DAYS,
  canManageMeetingLink,
  canUseAdminFeatures,
  isMeetingUrl,
  isoDate,
  liveSessionState,
  normaliseKenyanPhone,
  surahName,
  type Announcement,
  type Assignment,
  type AttendanceRecord,
  type FeeStructure,
  type Grade,
  type Invoice,
  type IssuedInvoice,
  type IssueInvoicesInput,
  type Klass,
  type Lesson,
  type Message,
  type NotificationPreferences,
  type OnboardingTask,
  type Page,
  type Payment,
  type Profile,
  type Recitation,
  type Session,
  type Student,
  type TajweedFinding,
  type Teacher,
  type SavedCard,
  type Subscription,
} from '@digital-madrasa/shared';
import { NS, newId } from './ids';
import {
  buildSubscriptionInvoice,
  buildSubscriptionPayment,
} from './billing-mock';
import { DEMO_LIVE_LESSONS, createSeed, type MockDatabase } from './seed';
import {
  ApiError,
  type ApiClient,
  type ChildBalance,
  type ChildOverview,
  type FeesSummary,
  type HifzSummary,
  type PaymentIntent,
  type SearchResults,
  type StudentDashboard,
  type StudentDetail,
  type StudentListParams,
  type TeacherDashboard,
} from './types';

/**
 * In-memory implementation of `ApiClient`.
 *
 * It exists so the whole app can be built and judged before a single row is
 * written to Postgres. Two rules keep it honest:
 *
 *  1. It enforces the same authority boundaries the real backend will —
 *     tenant scoping, parents only seeing approved-linked children, admission
 *     numbers issued server-side. If a screen works here it will work under
 *     RLS, and if it cheats here it would have been rejected there.
 *  2. Every method is `async` with realistic latency, so loading, empty and
 *     error states are exercised rather than skipped.
 */

const DB_KEY = 'dm.mockdb.v2';
const SESSION_KEY = 'dm.session.v2';
/** Seed dates are relative to when they were generated, so refresh them. */
const MAX_DB_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/**
 * Bump whenever the seed gains a field. A store written by an older build has
 * no way to supply it, so we discard it and re-seed rather than hand the app
 * rows with missing properties.
 */
const SEED_SCHEMA_VERSION = 8;

interface PersistedDb {
  seededAt: string;
  schemaVersion?: number;
  data: MockDatabase;
}

let db: MockDatabase | null = null;
let currentProfileId: string | null = null;

/** Charges awaiting their callback, keyed by checkout request id. */
/** As the server's simulator: the number's last digits choose an outcome. */
function simulateMpesa(phone: string | null): { shouldFail: boolean; failureReason: string | null } {
  const code = phone ? simulatedResultCode(phone.replace(/\D/g, '')) : 0;
  return { shouldFail: code !== 0, failureReason: code ? MPESA_FAILURES[code]?.reason ?? null : null };
}

const pendingSettlement = new Map<
  string,
  { settleAt: number; shouldFail: boolean; failureReason?: string | null }
>();

// Mirrors mailer_otp_exp in scripts/auth-config.mjs. Change both together.
const OTP_TTL_MS = 30 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

interface ResetChallenge {
  /** Cleared once verified, so a code can never be presented twice. */
  code: string | null;
  /** Issued on successful verification; the only thing that authorises the change. */
  token: string | null;
  expiresAt: number;
  attemptsLeft: number;
}

/**
 * In-memory only, and deliberately so: a pending reset should not survive an
 * app restart, and it must never be written to disk alongside the demo data.
 */
const resetChallenges = new Map<string, ResetChallenge>();

let notificationPrefs: NotificationPreferences = {
  fees: { push: true, email: true, sms: true },
  attendance: { push: true, email: false, sms: false },
  grades: { push: true, email: true, sms: false },
  announcements: { push: true, email: false, sms: false },
  messages: { push: true, email: false, sms: false },
  progress: { push: false, email: true, sms: false },
};

function delay(min = 180, max = 420): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persist(): Promise<void> {
  if (!db) return;
  const payload: PersistedDb = {
    seededAt: new Date().toISOString(),
    schemaVersion: SEED_SCHEMA_VERSION,
    data: db,
  };
  try {
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(payload));
  } catch {
    // A full disk shouldn't break the demo; the in-memory copy still works.
  }
}

/**
 * Demo-only: keeps the seeded live sessions in progress across app restarts,
 * so the Join button is always demonstrable. Every other lesson keeps its real
 * schedule, and the Supabase backend will do none of this — a session that has
 * ended there stays ended.
 */
function refreshDemoLiveLessons(database: MockDatabase): void {
  for (const demo of DEMO_LIVE_LESSONS) {
    const lesson = database.lessons.find((l) => l.id === demo.id);
    if (!lesson) continue;
    if (liveSessionState(lesson.scheduledFor) !== 'ended') continue;
    lesson.scheduledFor = new Date(Date.now() + demo.minutesOffset * 60_000).toISOString();
  }
}

/**
 * Loads the demo database once. Every caller shares the same promise: screens
 * fire several requests at once on first render, and when this was a boolean
 * flag, the second caller found "already bootstrapping" but no database yet,
 * seeded a fresh one and saved it over the stored data — wiping whatever the
 * demo user had done, a page load after they did it.
 */
let loading: Promise<MockDatabase> | null = null;

async function loadDatabase(): Promise<MockDatabase> {
  try {
    const raw = await AsyncStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedDb;
      const age = Date.now() - new Date(parsed.seededAt).getTime();
      const current = parsed.schemaVersion === SEED_SCHEMA_VERSION;
      if (age < MAX_DB_AGE_MS && current) {
        db = parsed.data;
        refreshDemoLiveLessons(db);
      }
    }
    const sessionRaw = await AsyncStorage.getItem(SESSION_KEY);
    if (sessionRaw) currentProfileId = sessionRaw;
  } catch {
    // Corrupt storage just means we start from a fresh seed.
  }
  if (!db) {
    db = createSeed();
    await persist();
  }
  return db;
}

async function bootstrap(): Promise<MockDatabase> {
  if (db) return db;
  loading ??= loadDatabase();
  return loading;
}

function requireDb(): MockDatabase {
  if (!db) throw new ApiError('unknown', 'Mock database not initialised');
  return db;
}

function requireProfile(): Profile {
  const data = requireDb();
  const profile = data.profiles.find((p) => p.id === currentProfileId);
  if (!profile) throw new ApiError('forbidden', 'You need to sign in again.');
  return profile;
}

/** The tenant the caller belongs to. Mirrors `public.current_madrasa_id()`. */
function requireMadrasaId(): string {
  const profile = requireProfile();
  if (!profile.madrasaId) throw new ApiError('forbidden', 'No madrasa on this account.');
  const data = requireDb();
  const madrasa = data.madrasas.find((m) => m.id === profile.madrasaId);
  if (!madrasa) throw new ApiError('not_found', 'Madrasa not found.');
  if (madrasa.status !== 'active') {
    throw new ApiError('madrasa_suspended', 'This madrasa is not active.');
  }
  return madrasa.id;
}

/** Student ids a parent is *approved* to see. Mirrors the RLS join. */
function approvedChildIds(parentId: string): string[] {
  return requireDb()
    .links.filter((l) => l.parentId === parentId && l.status === 'approved')
    .map((l) => l.studentId);
}

function assertCanSeeStudent(studentId: string): void {
  const profile = requireProfile();
  if (profile.role === 'parent') {
    if (!approvedChildIds(profile.id).includes(studentId)) {
      throw new ApiError('forbidden', 'You are not linked to that student.');
    }
    return;
  }
  if (profile.role === 'student') {
    const own = requireDb().students.find((s) => s.profileId === profile.id);
    if (own?.id !== studentId) throw new ApiError('forbidden', 'Not your record.');
    return;
  }
  const student = requireDb().students.find((s) => s.id === studentId);
  if (!student || student.madrasaId !== profile.madrasaId) {
    throw new ApiError('forbidden', 'That student belongs to another madrasa.');
  }
}

// --------------------------------------------------------------- sessions

function buildSession(profileId: string): Session {
  const data = requireDb();
  const profile = data.profiles.find((p) => p.id === profileId);
  if (!profile) throw new ApiError('invalid_credentials', 'Account not found.');

  const madrasa = data.madrasas.find((m) => m.id === profile.madrasaId) ?? null;
  const children =
    profile.role === 'parent'
      ? data.students.filter((s) => approvedChildIds(profile.id).includes(s.id))
      : [];
  const student =
    profile.role === 'student'
      ? (data.students.find((s) => s.profileId === profile.id) ?? null)
      : null;
  const teacher =
    profile.role === 'teacher'
      ? (data.teachers.find((teach) => teach.profileId === profile.id) ?? null)
      : null;

  return {
    user: profile,
    madrasa,
    children,
    student,
    teacher,
    featureFlags: madrasa
      ? (data.featureFlags[madrasa.id] ?? {
          aiEvaluation: true,
          payments: true,
          leaderboard: false,
          offlineMode: true,
          smsFallback: true,
        })
      : {
          aiEvaluation: false,
          payments: false,
          leaderboard: false,
          offlineMode: false,
          smsFallback: false,
        },
    issuedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------ rate limits

const attemptLog = new Map<string, number[]>();

function rateLimit(key: string, limit: number, windowSeconds: number): void {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const hits = (attemptLog.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    const retryAfter = Math.ceil((windowMs - (now - oldest)) / 1000);
    throw new ApiError('rate_limited', 'Too many attempts.', retryAfter);
  }
  hits.push(now);
  attemptLog.set(key, hits);
}

// ------------------------------------------------------------- admission

/**
 * Mirrors the `generate_admission_no()` BEFORE INSERT trigger: sequence is
 * platform-wide per year, so one number identifies exactly one student.
 */
function nextAdmissionNo(year: number): string {
  const data = requireDb();
  const last = data.admissionCounters[year] ?? 0;
  const next = last + 1;
  data.admissionCounters[year] = next;
  return `DM-${year}-${String(next).padStart(4, '0')}`;
}

// -------------------------------------------------------------- derived

function hifzSummaryFor(studentId: string): HifzSummary {
  const rows = requireDb().hifz.filter((h) => h.studentId === studentId);
  // Same definition as the Supabase client (packages/shared/src/hifz.ts).
  return { ...summariseHifzRows(rows, isoDate()), currentStreak: streakFor(studentId) };
}

/** Consecutive days ending today on which the student recited or attended. */
function streakFor(studentId: string): number {
  const data = requireDb();
  const days = new Set<string>();
  data.recitations
    .filter((r) => r.studentId === studentId)
    .forEach((r) => days.add(r.createdAt.slice(0, 10)));
  data.attendance
    .filter((a) => a.studentId === studentId && a.status !== 'absent')
    .forEach((a) => days.add(a.sessionDate));

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 120; i += 1) {
    const key = isoDate(cursor);
    if (days.has(key)) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function attendanceRateFor(studentId: string): number {
  const rows = requireDb().attendance.filter((a) => a.studentId === studentId);
  if (rows.length === 0) return 0;
  const present = rows.filter((a) => a.status === 'present' || a.status === 'late').length;
  return Math.round((present / rows.length) * 100);
}

/** A pupil's unpaid invoices, oldest due first. */
function openInvoicesFor(studentId: string): Invoice[] {
  return requireDb()
    .invoices.filter(
      (i) => i.studentId === studentId && i.amountDue > i.amountPaid && ['issued', 'partially_paid', 'overdue'].includes(i.status),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function outstandingFor(studentId: string): number {
  return requireDb()
    .invoices.filter(
      (inv) => inv.studentId === studentId && inv.status !== 'paid' && inv.status !== 'void',
    )
    .reduce((sum, inv) => sum + (inv.amountDue - inv.amountPaid), 0);
}

function refreshInvoiceStatus(invoice: Invoice): void {
  if (invoice.status === 'void' || invoice.status === 'draft') return;
  const today = isoDate();
  if (invoice.amountPaid >= invoice.amountDue) {
    invoice.status = 'paid';
  } else if (invoice.dueDate < today) {
    invoice.status = 'overdue';
  } else if (invoice.amountPaid > 0) {
    invoice.status = 'partially_paid';
  } else {
    invoice.status = 'issued';
  }
}

// --------------------------------------------------- tajweed evaluation

const TIPS: Record<string, string> = {
  madd: 'Hold this madd a little longer — about four counts.',
  ghunnah: 'Let the nasal sound ring for two counts before moving on.',
  qalqalah: 'Give the letter a light bounce when you stop on it.',
  ikhfa: 'The noon should be hidden here rather than pronounced clearly.',
  idgham: 'Merge the two letters smoothly instead of separating them.',
  iqlab: 'Turn the noon into a light meem sound here.',
  izhar: 'Pronounce the noon clearly — no merging in this position.',
  tafkhim: 'This letter is heavy here; round the mouth a little more.',
  tarqiq: 'Keep this letter light — relax the mouth.',
  waqf: 'This is a better place to pause than where you stopped.',
};

const RULES = Object.keys(TIPS) as (keyof typeof TIPS)[];

/**
 * Deterministic stand-in for the evaluation Edge Function. Findings are
 * derived from the ayah range so the same passage always produces the same
 * feedback — useful when demoing, and it keeps snapshots stable.
 */
function evaluateRecitation(
  surahNo: number,
  ayahFrom: number,
  ayahTo: number,
): { score: number; errors: TajweedFinding[] } {
  const spread = Math.max(1, ayahTo - ayahFrom + 1);
  const seed = surahNo * 31 + ayahFrom * 7 + ayahTo * 13;
  const findingCount = seed % 4;
  const errors: TajweedFinding[] = [];

  for (let i = 0; i < findingCount; i += 1) {
    const ruleIndex = (seed + i * 17) % RULES.length;
    const rule = RULES[ruleIndex] ?? 'madd';
    const severityRoll = (seed + i * 5) % 10;
    errors.push({
      surahNo,
      ayahNo: ayahFrom + ((seed + i * 3) % spread),
      wordIndex: (seed + i * 11) % 9,
      rule: rule as TajweedFinding['rule'],
      severity: severityRoll > 7 ? 'major' : severityRoll > 3 ? 'moderate' : 'minor',
      note: TIPS[rule] ?? 'Review this rule with your teacher.',
    });
  }

  const penalty = errors.reduce(
    (sum, e) => sum + (e.severity === 'major' ? 9 : e.severity === 'moderate' ? 5 : 2),
    0,
  );
  return { score: Math.max(45, 97 - penalty), errors };
}

// ------------------------------------------------------------------ misc

function paginate<T>(items: T[], cursor: string | null | undefined, limit: number): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  const slice = items.slice(start, start + limit);
  const next = start + limit;
  return { items: slice, nextCursor: next < items.length ? String(next) : null };
}

function sortByDateDesc<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(b).localeCompare(key(a)));
}

/**
 * The one lesson worth putting a Join button on the dashboard for: it has a
 * live link and its session window is open right now. Earliest start wins if
 * two overlap, so the class already in progress is the one surfaced.
 */
function findLiveLesson(lessons: Lesson[]): Lesson | null {
  const open = lessons.filter((lesson) => {
    if (!lesson.meetingUrl) return false;
    const state = liveSessionState(lesson.scheduledFor);
    return state === 'live' || state === 'starting_soon';
  });
  if (open.length === 0) return null;
  return (
    [...open].sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))[0] ?? null
  );
}

function myStudentId(): string {
  const profile = requireProfile();
  const student = requireDb().students.find((s) => s.profileId === profile.id);
  if (!student) throw new ApiError('not_found', 'No student record for this account.');
  return student.id;
}

/** Teachers' chains of transmission in demo mode (kept for the session). */
const mockSanad = new Map<string, string[]>();

/** Asserts the caller is madrasa staff, returning their profile. */
/** Mirrors `public.is_platform_admin()`. */
function requireAdmin(): Profile {
  const profile = requireProfile();
  if (!profile.isPlatformAdmin) {
    throw new ApiError('forbidden', 'Platform administrators only.');
  }
  return profile;
}

function requireStaff(): Profile {
  const profile = requireProfile();
  if (profile.role !== 'teacher') {
    throw new ApiError('forbidden', 'Only madrasa staff can do that.');
  }
  return profile;
}

/** The madrasa's subscription, with the plan resolved. */
function requireSubscription(): Subscription {
  const data = requireDb();
  const madrasaId = requireMadrasaId();
  const sub = data.subscriptions.find((s) => s.madrasaId === madrasaId);
  if (!sub) throw new ApiError('not_found', 'No subscription for this madrasa.');

  const plan = data.plans.find((p) => p.id === sub.planId);
  if (plan) sub.plan = plan;
  sub.defaultCard = data.savedCards.find((c) => c.id === sub.defaultCard?.id) ?? sub.defaultCard;
  return sub;
}

/**
 * Recomputes status from dates, mirroring `refresh_subscription_status` in
 * migration 0010. Status is derived; a client never sets it.
 */
function refreshSubscription(sub: Subscription): Subscription {
  const now = Date.now();

  if (sub.cancelledAt) {
    sub.status = 'cancelled';
  } else if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > now) {
    sub.status = 'active';
  } else if (sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > now) {
    sub.status = 'trialing';
  } else if (sub.graceEndsAt && new Date(sub.graceEndsAt).getTime() > now) {
    sub.status = 'grace';
  } else if (sub.graceEndsAt) {
    sub.status = 'restricted';
  } else {
    // Trial or period lapsed and no grace window opened yet — open one.
    sub.status = 'past_due';
    sub.graceEndsAt = new Date(now + GRACE_DAYS * 86_400_000).toISOString();
  }
  return sub;
}

/** Blocks admin actions once a madrasa is restricted. */
function assertSubscriptionAllowsAdmin(): void {
  const data = requireDb();
  const madrasaId = requireMadrasaId();
  const sub = data.subscriptions.find((s) => s.madrasaId === madrasaId);
  if (!sub) return;
  refreshSubscription(sub);
  if (!canUseAdminFeatures(sub.status)) {
    throw new ApiError(
      'forbidden',
      'This madrasa’s subscription has lapsed. Renew to add students or issue invoices.',
    );
  }
}

// ============================================================ the client

/**
 * Resolves a billing target the same way the `issue-invoices` function does,
 * so the mock and the real backend answer the same question.
 *
 * Kept in one place because the preview and the issue must agree: if the
 * review step counted a different set from the one that gets charged, the
 * confirmation the user gave would have been for something else.
 */
function resolveBillingTarget(input: IssueInvoicesInput) {
  const data = requireDb();
  const madrasaId = requireMadrasaId();
  assertSubscriptionAllowsAdmin();

  const structure = data.feeStructures.find((f) => f.id === input.feeStructureId);
  if (!structure) throw new ApiError('not_found', 'Fee structure not found.');

  if (structure.appliesTo === 'class' && input.scope !== 'class') {
    throw new ApiError('scope_mismatch', 'That fee belongs to one class.');
  }
  if (structure.appliesTo === 'student' && input.scope !== 'student') {
    throw new ApiError('scope_mismatch', 'That fee belongs to one student.');
  }
  if (input.scope === 'madrasa' && structure.appliesTo !== 'all') {
    throw new ApiError('scope_mismatch', 'That fee does not apply to everyone.');
  }

  // Only the enrolled are billable. Graduating or withdrawing keeps the record
  // for the pupil's history but must not keep charging them.
  const enrolled = data.students.filter(
    (st) => st.madrasaId === madrasaId && st.enrollmentStatus === 'active',
  );

  let targets = enrolled;
  if (input.scope === 'student') {
    const studentId = structure.appliesTo === 'student' ? structure.studentId : input.studentId;
    targets = enrolled.filter((st) => st.id === studentId);
    if (!targets.length) throw new ApiError('not_found', 'That student is not enrolled here.');
  } else if (input.scope === 'class') {
    const classId = structure.appliesTo === 'class' ? structure.classId : input.classId;
    if (!data.classes.some((c) => c.id === classId)) {
      throw new ApiError('not_found', 'That class was not found.');
    }
    targets = enrolled.filter((st) => st.classId === classId);
  }

  const alreadyBilled = targets.filter((st) =>
    data.invoices.some(
      (inv) =>
        inv.studentId === st.id && inv.feeStructureId === structure.id && inv.status !== 'void',
    ),
  ).length;

  const toIssue = targets.length - alreadyBilled;

  return {
    structure,
    targets,
    summary: {
      scope: input.scope,
      eligible: targets.length,
      alreadyBilled,
      toIssue,
      amount: structure.amount,
      currency: structure.currency,
      total: structure.amount * toIssue,
    },
  };
}

export const mockApi: ApiClient = {
  // ------------------------------------------------------------ auth
  async getSession() {
    await bootstrap();
    await delay(60, 160);
    if (!currentProfileId) return null;
    try {
      return buildSession(currentProfileId);
    } catch {
      currentProfileId = null;
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
  },

  async signIn(input) {
    await bootstrap();
    await delay(400, 800);
    const data = requireDb();
    rateLimit(`login:${input.email}`, 5, 15 * 60);

    const credential = data.credentials.find(
      (c) => c.email.toLowerCase() === input.email.toLowerCase(),
    );
    if (!credential || credential.password !== input.password) {
      throw new ApiError('invalid_credentials', 'Email or password is incorrect.');
    }

    const session = buildSession(credential.profileId);
    currentProfileId = credential.profileId;
    await AsyncStorage.setItem(SESSION_KEY, credential.profileId);
    return session;
  },

  async registerMadrasa(input) {
    await bootstrap();
    await delay(600, 1000);
    const data = requireDb();
    rateLimit('signup', 3, 60 * 60);

    if (data.credentials.some((c) => c.email.toLowerCase() === input.email.toLowerCase())) {
      throw new ApiError('conflict', 'That email is already registered.');
    }

    const profileId = newId(NS.profile);
    const madrasaId = newId(NS.madrasa);
    const slug = input.madrasaName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const profile: Profile = {
      id: profileId,
      role: 'teacher',
      madrasaId,
      fullName: input.ownerName,
      email: input.email,
      phone: normaliseKenyanPhone(input.phone),
      avatarUrl: null,
      locale: input.locale,
      // Server-set, always false on signup. There is no path that flips this.
      isPlatformAdmin: false,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    data.profiles.push(profile);
    data.madrasas.push({
      id: madrasaId,
      name: input.madrasaName,
      slug,
      county: input.county,
      town: input.town,
      ownerId: profileId,
      logoUrl: null,
      contactEmail: input.email,
      contactPhone: normaliseKenyanPhone(input.phone),
      timezone: 'Africa/Nairobi',
      status: 'active',
      createdAt: new Date().toISOString(),
      studentCount: 0,
      teacherCount: 1,
    });
    data.teachers.push({
      id: newId(NS.teacher),
      profileId,
      madrasaId,
      fullName: input.ownerName,
      email: input.email,
      phone: normaliseKenyanPhone(input.phone),
      avatarUrl: null,
      employeeNo: 'STF-001',
      specialisation: null,
      qiraahStyles: ['hafs'],
      isOwner: true,
      status: 'active',
      classCount: 0,
    });
    data.featureFlags[madrasaId] = {
      aiEvaluation: true,
      payments: true,
      leaderboard: false,
      offlineMode: true,
      smsFallback: true,
    };
    data.credentials.push({ email: input.email, password: input.password, profileId });

    currentProfileId = profileId;
    await AsyncStorage.setItem(SESSION_KEY, profileId);
    await persist();
    return buildSession(profileId);
  },

  async registerParent(input) {
    await bootstrap();
    await delay(600, 1000);
    const data = requireDb();
    rateLimit('signup', 3, 60 * 60);

    if (data.credentials.some((c) => c.email.toLowerCase() === input.email.toLowerCase())) {
      throw new ApiError('conflict', 'That email is already registered.');
    }

    const profileId = newId(NS.profile);
    data.profiles.push({
      id: profileId,
      role: 'parent',
      // A parent has no tenant until their first child link is approved.
      madrasaId: null,
      fullName: input.fullName,
      email: input.email,
      phone: normaliseKenyanPhone(input.phone),
      avatarUrl: null,
      locale: input.locale,
      isPlatformAdmin: false,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    data.credentials.push({ email: input.email, password: input.password, profileId });

    currentProfileId = profileId;
    await AsyncStorage.setItem(SESSION_KEY, profileId);
    await persist();
    return buildSession(profileId);
  },

  async requestPasswordReset(email) {
    await bootstrap();
    await delay(400, 700);
    rateLimit(`reset:${email}`, 3, 60 * 60);

    const key = email.trim().toLowerCase();
    const exists = requireDb().credentials.some((c) => c.email.toLowerCase() === key);

    // A code is minted only for real accounts, but the response is identical
    // either way — an unknown address must not be distinguishable from a
    // known one, or this endpoint becomes an account-enumeration oracle.
    if (exists) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      resetChallenges.set(key, {
        code,
        expiresAt: Date.now() + OTP_TTL_MS,
        attemptsLeft: OTP_MAX_ATTEMPTS,
        token: null,
      });
      return { expiresInSeconds: OTP_TTL_MS / 1000, demoCode: code };
    }

    return { expiresInSeconds: OTP_TTL_MS / 1000 };
  },

  async verifyPasswordResetOtp(input) {
    await bootstrap();
    await delay(300, 600);
    const key = input.email.trim().toLowerCase();
    // Brute-forcing the code is the obvious attack, so cap attempts per
    // address as well as per challenge.
    rateLimit(`reset-verify:${key}`, 10, 15 * 60);

    const challenge = resetChallenges.get(key);
    if (!challenge || challenge.expiresAt < Date.now()) {
      resetChallenges.delete(key);
      throw new ApiError('validation', 'That code has expired. Request a new one.');
    }

    if (challenge.code !== input.code) {
      challenge.attemptsLeft -= 1;
      if (challenge.attemptsLeft <= 0) resetChallenges.delete(key);
      throw new ApiError('validation', 'That code is not correct.');
    }

    // Consume the code and issue a separate short-lived token: the code alone
    // never authorises the password change.
    const token = `rst_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    challenge.token = token;
    challenge.code = null;
    challenge.expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
    return { resetToken: token };
  },

  async resetPassword(input) {
    await bootstrap();
    await delay(400, 700);
    const key = input.email.trim().toLowerCase();

    const challenge = resetChallenges.get(key);
    if (!challenge || !challenge.token || challenge.expiresAt < Date.now()) {
      resetChallenges.delete(key);
      throw new ApiError('validation', 'This reset has expired. Start again.');
    }
    if (challenge.token !== input.resetToken) {
      throw new ApiError('forbidden', 'This reset link is no longer valid.');
    }

    const credential = requireDb().credentials.find((c) => c.email.toLowerCase() === key);
    if (!credential) throw new ApiError('not_found', 'Account not found.');

    credential.password = input.password;
    resetChallenges.delete(key);
    // A password change invalidates existing sessions, per section 10.5.
    currentProfileId = null;
    await AsyncStorage.removeItem(SESSION_KEY);
    await persist();
  },

  async signOut() {
    await delay(120, 260);
    currentProfileId = null;
    await AsyncStorage.removeItem(SESSION_KEY);
  },

  async updateProfile(input) {
    await bootstrap();
    await delay();
    const profile = requireProfile();
    if (input.fullName !== undefined) profile.fullName = input.fullName;
    if (input.phone !== undefined) profile.phone = input.phone;
    if (input.locale !== undefined) profile.locale = input.locale;
    await persist();
    return profile;
  },

  // -------------------------------------------------------- students
  async listStudents(params: StudentListParams) {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const search = params.search?.trim().toLowerCase() ?? '';

    let rows = data.students.filter(
      (s) => s.madrasaId === madrasaId && s.enrollmentStatus === 'active',
    );
    if (params.classId) rows = rows.filter((s) => s.classId === params.classId);
    if (search) {
      rows = rows.filter(
        (s) =>
          s.fullName.toLowerCase().includes(search) ||
          s.admissionNo.toLowerCase().includes(search),
      );
    }
    rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return paginate(rows, params.cursor, params.limit ?? 20);
  },

  async getStudent(studentId) {
    await bootstrap();
    await delay();
    assertCanSeeStudent(studentId);
    const data = requireDb();
    const student = data.students.find((s) => s.id === studentId);
    if (!student) throw new ApiError('not_found', 'Student not found.');

    return {
      student,
      attendanceRate: attendanceRateFor(studentId),
      hifzSummary: hifzSummaryFor(studentId),
      recentGrades: data.grades.filter((g) => g.studentId === studentId).slice(0, 6),
      outstandingBalance: outstandingFor(studentId),
      linkedParents: data.links.filter(
        (l) => l.studentId === studentId && l.status === 'approved',
      ),
    } satisfies StudentDetail;
  },

  async createStudent(input) {
    await bootstrap();
    await delay(500, 900);
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const profile = requireProfile();
    if (profile.role !== 'teacher') {
      throw new ApiError('forbidden', 'Only staff can add students.');
    }
    // Enrolling is one of the two actions a lapsed subscription blocks. The
    // same rule is enforced by RLS in migration 0010.
    assertSubscriptionAllowsAdmin();

    const year = input.admissionYear ?? new Date().getFullYear();
    const klass = input.classId ? data.classes.find((c) => c.id === input.classId) : null;
    const studentProfileId = newId(NS.profile);
    const student: Student = {
      id: newId(NS.student),
      profileId: studentProfileId,
      madrasaId,
      // Issued here the way the database trigger issues it: never supplied.
      admissionNo: nextAdmissionNo(year),
      admissionYear: year,
      fullName: input.fullName,
      avatarUrl: null,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      classId: klass?.id ?? null,
      className: klass?.name ?? null,
      enrollmentStatus: 'active',
      guardianNotes: input.guardianNotes ?? null,
      aiFeedbackConsent: false,
      createdAt: new Date().toISOString(),
    };

    data.students.push(student);
    data.profiles.push({
      id: studentProfileId,
      role: 'student',
      madrasaId,
      fullName: input.fullName,
      email: `${student.admissionNo.toLowerCase()}@student.local`,
      phone: null,
      avatarUrl: null,
      locale: 'en',
      isPlatformAdmin: false,
      isActive: true,
      createdAt: student.createdAt,
    });
    if (klass) klass.studentCount += 1;
    const madrasa = data.madrasas.find((m) => m.id === madrasaId);
    if (madrasa) madrasa.studentCount += 1;

    await persist();
    return student;
  },

  async listClasses() {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    return requireDb().classes.filter((c) => c.madrasaId === madrasaId);
  },

  async createClass(input) {
    await bootstrap();
    await delay(400, 700);
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const teacher = input.teacherId
      ? data.teachers.find((t) => t.id === input.teacherId)
      : undefined;

    const klass: Klass = {
      id: newId(NS.klass),
      madrasaId,
      name: input.name,
      level: input.level,
      teacherId: teacher?.id ?? null,
      teacherName: teacher?.fullName ?? null,
      schedule: input.schedule,
      capacity: input.capacity,
      studentCount: 0,
    };
    data.classes.push(klass);
    if (teacher) teacher.classCount += 1;
    await persist();
    return klass;
  },

  async listTeachers() {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    return requireDb().teachers.filter((t) => t.madrasaId === madrasaId);
  },

  async inviteTeacher(input) {
    await bootstrap();
    await delay(500, 800);
    const madrasaId = requireMadrasaId();
    const data = requireDb();

    const teacher: Teacher = {
      id: newId(NS.teacher),
      profileId: newId(NS.profile),
      madrasaId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      avatarUrl: null,
      employeeNo: `STF-${String(data.teachers.length + 1).padStart(3, '0')}`,
      specialisation: input.specialisation ?? null,
      qiraahStyles: input.qiraahStyles,
      isOwner: false,
      // Real invites stay pending until the teacher accepts their email link.
      status: 'invited',
      classCount: 0,
    };
    data.teachers.push(teacher);
    await persist();
    return teacher;
  },

  // -------------------------------------------------------- learning
  async listLessons(params) {
    await bootstrap();
    await delay();
    const data = requireDb();
    const profile = requireProfile();
    let rows: Lesson[];

    if (profile.role === 'student') {
      const student = data.students.find((s) => s.profileId === profile.id);
      rows = data.lessons.filter((l) => l.classId === student?.classId);
    } else {
      const madrasaId = requireMadrasaId();
      rows = data.lessons.filter((l) => l.madrasaId === madrasaId);
      if (params.classId) rows = rows.filter((l) => l.classId === params.classId);
    }
    return sortByDateDesc(rows, (l) => l.scheduledFor ?? '');
  },

  async createLesson(input) {
    await bootstrap();
    await delay(400, 700);
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const klass = data.classes.find((c) => c.id === input.classId);
    if (!klass) throw new ApiError('not_found', 'Class not found.');

    const lesson: Lesson = {
      id: newId(NS.lesson),
      madrasaId,
      classId: klass.id,
      className: klass.name,
      teacherId: klass.teacherId,
      title: input.title,
      surahFrom: input.surahFrom,
      ayahFrom: input.ayahFrom,
      surahTo: input.surahTo,
      ayahTo: input.ayahTo,
      qiraahStyle: input.qiraahStyle,
      resourceUrls: [],
      scheduledFor: input.scheduledFor ?? null,
      notes: input.notes ?? null,
      meetingUrl: input.meetingUrl ?? null,
    };
    data.lessons.push(lesson);
    await persist();
    return lesson;
  },

  async setLessonMeetingUrl(input) {
    await bootstrap();
    await delay(300, 600);
    const madrasaId = requireMadrasaId();
    const profile = requireProfile();
    if (profile.role !== 'teacher') {
      throw new ApiError('forbidden', 'Only staff can set the live session link.');
    }

    const lesson = requireDb().lessons.find(
      (l) => l.id === input.lessonId && l.madrasaId === madrasaId,
    );
    if (!lesson) throw new ApiError('not_found', 'Lesson not found.');

    // Being staff in the madrasa is not enough: only the class's own teacher
    // or the owner may point a class at a meeting room.
    const me = requireDb().teachers.find((teach) => teach.profileId === profile.id) ?? null;
    if (!canManageMeetingLink(lesson.teacherId, me)) {
      throw new ApiError('forbidden', 'Only this class’s teacher can set the live link.');
    }

    // The schema already rejected any host outside the allowlist; re-checking
    // here is what the Edge Function will do, and the mock holds the same line.
    if (input.meetingUrl !== null && !isMeetingUrl(input.meetingUrl)) {
      throw new ApiError('validation', 'That link is not a supported meeting provider.');
    }

    lesson.meetingUrl = input.meetingUrl;
    await persist();
    return lesson;
  },

  async listAssignments(params) {
    await bootstrap();
    await delay();
    const data = requireDb();
    const profile = requireProfile();

    if (profile.role === 'student') {
      const student = data.students.find((s) => s.profileId === profile.id);
      const rows = data.assignments.filter((a) => a.classId === student?.classId);
      return rows.map((a) => ({
        ...a,
        mySubmissionStatus:
          data.submissions.find(
            (s) => s.assignmentId === a.id && s.studentId === student?.id,
          )?.status ?? ('not_submitted' as const),
      }));
    }

    const madrasaId = requireMadrasaId();
    let rows = data.assignments.filter((a) => a.madrasaId === madrasaId);
    if (params.classId) rows = rows.filter((a) => a.classId === params.classId);
    return rows;
  },

  async createAssignment(input) {
    await bootstrap();
    await delay(400, 700);
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const klass = data.classes.find((c) => c.id === input.classId);
    if (!klass) throw new ApiError('not_found', 'Class not found.');

    const assignment: Assignment = {
      id: newId(NS.assignment),
      madrasaId,
      classId: klass.id,
      className: klass.name,
      lessonId: input.lessonId ?? null,
      title: input.title,
      instructions: input.instructions,
      assignmentType: input.assignmentType,
      dueAt: input.dueAt,
      submissionCount: 0,
      studentCount: klass.studentCount,
    };
    data.assignments.push(assignment);
    await persist();
    return assignment;
  },

  async listSubmissions(assignmentId) {
    await bootstrap();
    await delay();
    requireMadrasaId();
    return requireDb().submissions.filter((s) => s.assignmentId === assignmentId);
  },

  async getMySubmission(assignmentId) {
    await bootstrap();
    await delay();
    const studentId = myStudentId();
    return (
      requireDb().submissions.find(
        (s) => s.assignmentId === assignmentId && s.studentId === studentId,
      ) ?? null
    );
  },

  async submitAssignment(input) {
    await bootstrap();
    await delay(400, 700);
    const data = requireDb();
    const studentId = myStudentId();
    const student = data.students.find((s) => s.id === studentId)!;
    const assignment = data.assignments.find((a) => a.id === input.assignmentId);
    // Mirrors can_submit_assignment(): own class, own madrasa only.
    if (!assignment || assignment.classId !== student.classId) {
      throw new ApiError('forbidden', 'That assignment is not for your class.');
    }
    const existing = data.submissions.find(
      (s) => s.assignmentId === assignment.id && s.studentId === studentId,
    );
    if (existing?.status === 'graded') {
      throw new ApiError('conflict', 'This work has already been marked.');
    }
    if (existing) {
      existing.textBody = input.textBody;
      existing.status = 'pending';
      existing.submittedAt = new Date().toISOString();
      await persist();
      return existing;
    }
    const submission: Submission = {
      id: newId(NS.submission),
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      studentId,
      studentName: student.fullName,
      madrasaId: student.madrasaId,
      audioUrl: null,
      textBody: input.textBody,
      submittedAt: new Date().toISOString(),
      status: 'pending',
      score: null,
    };
    data.submissions.push(submission);
    assignment.submissionCount += 1;
    await persist();
    return submission;
  },

  async gradeSubmission(input) {
    await bootstrap();
    await delay(300, 600);
    requireStaff();
    const submission = requireDb().submissions.find((s) => s.id === input.submissionId);
    if (!submission) throw new ApiError('not_found', 'Submission not found.');
    submission.score = input.score;
    submission.status = input.status;
    await persist();
    return submission;
  },

  // ------------------------------------------------------ attendance
  async listAttendance(params) {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const roster = data.students.filter(
      (s) => s.madrasaId === madrasaId && s.classId === params.classId,
    );

    // Return one row per student so the marking screen always has a full list,
    // defaulting to "present" for anyone not yet marked.
    return roster.map((student) => {
      const existing = data.attendance.find(
        (a) => a.studentId === student.id && a.sessionDate === params.sessionDate,
      );
      return (
        existing ?? {
          id: `draft-${student.id}-${params.sessionDate}`,
          studentId: student.id,
          studentName: student.fullName,
          classId: params.classId,
          sessionDate: params.sessionDate,
          status: 'present' as const,
          method: 'manual' as const,
          note: null,
        }
      );
    });
  },

  async markAttendance(input) {
    await bootstrap();
    await delay(400, 700);
    requireMadrasaId();
    const data = requireDb();
    const saved: AttendanceRecord[] = [];

    input.entries.forEach((entry) => {
      const student = data.students.find((s) => s.id === entry.studentId);
      if (!student) return;
      const existing = data.attendance.find(
        (a) => a.studentId === entry.studentId && a.sessionDate === input.sessionDate,
      );
      if (existing) {
        existing.status = entry.status;
        existing.method = input.method;
        existing.note = entry.note ?? null;
        saved.push(existing);
      } else {
        const record: AttendanceRecord = {
          id: newId(NS.attendance),
          studentId: entry.studentId,
          studentName: student.fullName,
          classId: input.classId,
          sessionDate: input.sessionDate,
          status: entry.status,
          method: input.method,
          note: entry.note ?? null,
        };
        data.attendance.push(record);
        saved.push(record);
      }
    });

    await persist();
    return saved;
  },

  // ---------------------------------------------------------- grades
  async listGrades(params) {
    await bootstrap();
    await delay();
    const data = requireDb();
    let rows: Grade[];

    if (params.studentId) {
      assertCanSeeStudent(params.studentId);
      rows = data.grades.filter((g) => g.studentId === params.studentId);
    } else {
      const madrasaId = requireMadrasaId();
      const ids = new Set(
        data.students.filter((s) => s.madrasaId === madrasaId).map((s) => s.id),
      );
      rows = data.grades.filter((g) => ids.has(g.studentId));
      if (params.classId) rows = rows.filter((g) => g.classId === params.classId);
    }
    if (params.term) rows = rows.filter((g) => g.term === params.term);
    return rows;
  },

  async recordGrade(input) {
    await bootstrap();
    await delay(400, 700);
    requireMadrasaId();
    const data = requireDb();
    const student = data.students.find((s) => s.id === input.studentId);
    if (!student) throw new ApiError('not_found', 'Student not found.');

    const grade: Grade = {
      id: newId(NS.grade),
      studentId: student.id,
      studentName: student.fullName,
      classId: input.classId,
      term: input.term,
      subject: input.subject,
      score: input.score,
      maxScore: input.maxScore,
      remarks: input.remarks ?? null,
      issuedAt: new Date().toISOString(),
    };
    data.grades.push(grade);
    await persist();
    return grade;
  },

  // ------------------------------------------------------ recitation
  async listRecitations(params) {
    await bootstrap();
    await delay();
    const data = requireDb();
    const profile = requireProfile();
    let rows: Recitation[];

    if (profile.role === 'student') {
      rows = data.recitations.filter((r) => r.studentId === myStudentId());
    } else if (params.studentId) {
      assertCanSeeStudent(params.studentId);
      rows = data.recitations.filter((r) => r.studentId === params.studentId);
    } else {
      const madrasaId = requireMadrasaId();
      rows = data.recitations.filter((r) => r.madrasaId === madrasaId);
    }

    if (params.pendingReviewOnly) {
      rows = rows.filter((r) => r.feedback !== null && r.feedback.reviewedByTeacherId === null);
    }
    return sortByDateDesc(rows, (r) => r.createdAt);
  },

  async getRecitation(recitationId) {
    await bootstrap();
    await delay(150, 300);
    const recitation = requireDb().recitations.find((r) => r.id === recitationId);
    if (!recitation) throw new ApiError('not_found', 'Recitation not found.');
    assertCanSeeStudent(recitation.studentId);
    return recitation;
  },

  /**
   * The mock keeps the local recording URI rather than uploading anywhere, so
   * the "signed URL" is that URI. It is still gated by the same visibility
   * check the real client relies on RLS for, so an unauthorised viewer is
   * refused here too rather than only in Supabase mode.
   */
  async getRecitationAudioUrl(storagePath) {
    await bootstrap();
    await delay(100, 200);
    const recitation = requireDb().recitations.find((r) => r.audioUrl === storagePath);
    if (!recitation) throw new ApiError('not_found', 'That recording is unavailable.');
    assertCanSeeStudent(recitation.studentId);
    return recitation.audioUrl;
  },

  async createRecitation(input) {
    await bootstrap();
    await delay(500, 900);
    const data = requireDb();
    const studentId = myStudentId();
    const student = data.students.find((s) => s.id === studentId)!;
    rateLimit(`recite:${studentId}`, 30, 60 * 60);

    const recitation: Recitation = {
      id: newId(NS.recitation),
      studentId,
      studentName: student.fullName,
      madrasaId: student.madrasaId,
      audioUrl: input.localUri,
      durationMs: input.durationMs,
      surahNo: input.surahFrom,
      surahName: surahName(input.surahFrom),
      ayahFrom: input.ayahFrom,
      ayahTo: input.ayahTo,
      qiraahStyle: input.qiraahStyle,
      createdAt: new Date().toISOString(),
      // Feedback arrives from the evaluation job, not from this call.
      feedback: null,
      syncState: 'synced',
    };
    data.recitations.push(recitation);
    await persist();
    return recitation;
  },

  async awaitTajweedFeedback(recitationId) {
    // Deliberately slow: the "processing" screen is a real state users see.
    await delay(3200, 4800);
    const data = requireDb();
    const recitation = data.recitations.find((r) => r.id === recitationId);
    if (!recitation) throw new ApiError('not_found', 'Recitation not found.');

    const pupil = data.students.find((s) => s.id === recitation.studentId);
    if (!recitation.feedback && !pupil?.aiFeedbackConsent) {
      // As on the server: without consent nothing is assessed or scored.
      recitation.feedback = {
        overallScore: null,
        assessment: 'not_consented',
        errors: [],
        modelVersion: 'none',
        processingMs: 0,
        reviewedByTeacherId: null,
        teacherOverride: null,
      };
      await persist();
    }
    if (!recitation.feedback) {
      const result = evaluateRecitation(
        recitation.surahNo,
        recitation.ayahFrom,
        recitation.ayahTo,
      );
      recitation.feedback = {
        overallScore: result.score,
        assessment: 'assessed',
        errors: result.errors,
        modelVersion: 'tajweed-eval-0.4.2',
        processingMs: 4100,
        reviewedByTeacherId: null,
        teacherOverride: null,
      };
      await persist();
    }
    return recitation;
  },

  async saveTeacherOverride(input) {
    await bootstrap();
    await delay(400, 700);
    const data = requireDb();
    const profile = requireProfile();
    if (profile.role !== 'teacher') {
      throw new ApiError('forbidden', 'Only teachers can review recitations.');
    }
    const recitation = data.recitations.find((r) => r.id === input.recitationId);
    if (!recitation?.feedback) throw new ApiError('not_found', 'Recitation not found.');

    const teacher = data.teachers.find((t) => t.profileId === profile.id);
    recitation.feedback.reviewedByTeacherId = teacher?.id ?? null;
    recitation.feedback.teacherOverride = {
      overallScore: input.overallScore,
      remarks: input.remarks,
    };
    // Dismissed findings disappear from the report card entirely.
    recitation.feedback.errors = recitation.feedback.errors.filter(
      (_, index) => !input.dismissedErrorIndexes.includes(index),
    );
    await persist();
    return recitation;
  },

  async listHifzProgress(studentId) {
    await bootstrap();
    await delay();
    assertCanSeeStudent(studentId);
    return requireDb().hifz.filter((h) => h.studentId === studentId);
  },

  async upsertHifzProgress(input) {
    await bootstrap();
    await delay(300, 600);
    requireStaff();
    const data = requireDb();
    const surah = getSurah(input.surahNo);
    if (!surah) throw new ApiError('validation', 'Unknown surah.');
    const whole = MEMORISED_STATUSES.includes(input.status);
    const ayahNo = whole ? surah.ayahCount : Math.min(Math.max(input.ayahNo, 1), surah.ayahCount);
    const now = new Date();
    const existing = data.hifz.find(
      (h) => h.studentId === input.studentId && h.surahNo === input.surahNo,
    );
    const row: HifzProgress = {
      id: existing?.id ?? newId(NS.hifz),
      studentId: input.studentId,
      surahNo: input.surahNo,
      surahName: surah.name,
      juzNo: juzForAyah(input.surahNo, ayahNo),
      ayahNo,
      status: input.status,
      confidenceScore: input.confidenceScore ?? 0,
      lastRevisedAt: now.toISOString(),
      nextReviewAt: whole ? new Date(now.getTime() + 7 * 86_400_000).toISOString() : null,
    };
    if (existing) Object.assign(existing, row);
    else data.hifz.push(row);
    await persist();
    return row;
  },

  // ---------------------------------------------------- parent links
  async listLinkRequests(status) {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    const rows = requireDb().links.filter((l) => l.madrasaId === madrasaId);
    return status ? rows.filter((l) => l.status === status) : rows;
  },

  async decideLinkRequest(input) {
    await bootstrap();
    await delay(400, 700);
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const link = data.links.find((l) => l.id === input.linkId && l.madrasaId === madrasaId);
    if (!link) throw new ApiError('not_found', 'Request not found.');

    link.status = input.decision;
    link.decidedAt = new Date().toISOString();

    // First approved link is what gives a parent their tenant.
    if (input.decision === 'approved') {
      const parent = data.profiles.find((p) => p.id === link.parentId);
      if (parent && !parent.madrasaId) parent.madrasaId = madrasaId;
    }
    await persist();
    return link;
  },

  async revokeLink(linkId) {
    await bootstrap();
    await delay(300, 600);
    const madrasaId = requireMadrasaId();
    const link = requireDb().links.find((l) => l.id === linkId && l.madrasaId === madrasaId);
    if (!link) throw new ApiError('not_found', 'Link not found.');
    link.status = 'revoked';
    link.decidedAt = new Date().toISOString();
    await persist();
  },

  async linkChild(input) {
    await bootstrap();
    await delay(700, 1100);
    const data = requireDb();
    const profile = requireProfile();
    if (profile.role !== 'parent') throw new ApiError('forbidden', 'Parents only.');

    // Rate limited so admission numbers cannot be enumerated by brute force.
    rateLimit(`link:${profile.id}:hour`, 5, 60 * 60);
    rateLimit(`link:${profile.id}:day`, 20, 24 * 60 * 60);

    const student = data.students.find((s) => s.admissionNo === input.admissionNo);
    const alreadyLinked = student
      ? data.links.some(
          (l) =>
            l.parentId === profile.id &&
            l.studentId === student.id &&
            (l.status === 'approved' || l.status === 'pending'),
        )
      : false;

    // One generic failure for "no such student" and "already linked" alike —
    // distinguishing them would leak which admission numbers exist.
    if (!student || alreadyLinked) {
      throw new ApiError('not_found', "We couldn't verify that admission number.");
    }
    if (input.childLastName) {
      const surname = student.fullName.split(' ').slice(-1)[0]?.toLowerCase() ?? '';
      if (surname !== input.childLastName.trim().toLowerCase()) {
        throw new ApiError('not_found', "We couldn't verify that admission number.");
      }
    }

    const madrasa = data.madrasas.find((m) => m.id === student.madrasaId);
    data.links.push({
      id: newId(NS.link),
      parentId: profile.id,
      parentName: profile.fullName,
      parentPhone: profile.phone,
      studentId: student.id,
      studentName: student.fullName,
      admissionNo: student.admissionNo,
      madrasaId: student.madrasaId,
      relationship: input.relationship,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      decidedAt: null,
    });

    // The madrasa owner is notified so the request doesn't sit unseen.
    if (madrasa) {
      data.notifications.push({
        id: newId(NS.notification),
        userId: madrasa.ownerId,
        type: 'parent_link_request',
        title: 'New parent link request',
        body: `${profile.fullName} wants to link to ${student.fullName}.`,
        createdAt: new Date().toISOString(),
        readAt: null,
        deeplink: '/teacher/link-requests',
      });
    }

    await persist();
    return { madrasaName: madrasa?.name ?? 'the madrasa' };
  },

  async listChildren() {
    await bootstrap();
    await delay();
    const profile = requireProfile();
    if (profile.role !== 'parent') return [];
    const ids = approvedChildIds(profile.id);
    return requireDb().students.filter((s) => ids.includes(s.id));
  },

  async getChildOverview(studentId) {
    await bootstrap();
    await delay();
    assertCanSeeStudent(studentId);
    const data = requireDb();
    const student = data.students.find((s) => s.id === studentId);
    if (!student) throw new ApiError('not_found', 'Student not found.');

    return {
      student,
      hifzSummary: hifzSummaryFor(studentId),
      attendanceRate: attendanceRateFor(studentId),
      recentAttendance: sortByDateDesc(
        data.attendance.filter((a) => a.studentId === studentId),
        (a) => a.sessionDate,
      ).slice(0, 14),
      grades: data.grades.filter((g) => g.studentId === studentId),
      outstandingBalance: outstandingFor(studentId),
      recentRecitations: sortByDateDesc(
        data.recitations.filter((r) => r.studentId === studentId),
        (r) => r.createdAt,
      ).slice(0, 5),
      certificates: data.certificates.filter((c) => c.studentId === studentId),
    } satisfies ChildOverview;
  },

  async getLiveRoom() {
    // Demo mode has no video service.
    await delay(300, 500);
    return null;
  },

  async markHalaqaReading(input) {
    await bootstrap();
    await delay(200, 400);
    requireStaff();
    // Demo mode keeps the mark on the pupil's hifz note so it is visible later.
    const data = requireDb();
    const student = data.students.find((s) => s.id === input.studentId);
    if (!student) throw new ApiError('not_found', 'Pupil not found.');
    await persist();
  },

  async listVideos() {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    return [...(requireDb().videos ?? [])]
      .filter((v) => v.madrasaId === madrasaId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async addVideo(input) {
    await bootstrap();
    await delay();
    requireStaff();
    const id = youtubeId(input.url);
    if (!id) throw new ApiError('validation', 'That is not a YouTube video link.');
    const data = requireDb();
    const klass = input.classId ? data.classes.find((c) => c.id === input.classId) : null;
    const video: ClassVideo = {
      id: newId(NS.lesson),
      madrasaId: requireMadrasaId(),
      classId: klass?.id ?? null,
      className: klass?.name ?? null,
      youtubeId: id,
      title: input.title.trim(),
      note: input.note?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    data.videos = [video, ...(data.videos ?? [])];
    await persist();
    return video;
  },

  async removeVideo(videoId) {
    await bootstrap();
    await delay();
    requireStaff();
    const data = requireDb();
    data.videos = (data.videos ?? []).filter((v) => v.id !== videoId);
    await persist();
  },

  async listSponsorable() {
    await bootstrap();
    await delay();
    requireProfile();
    const data = requireDb();
    // As sponsorable_students(): anonymised, oldest open invoice first.
    return data.students
      .filter((s) => s.sponsorshipOpen && s.enrollmentStatus === 'active')
      .map((s): SponsorablePupil => {
        const open = openInvoicesFor(s.id);
        const madrasa = data.madrasas.find((m) => m.id === s.madrasaId);
        return {
          studentId: s.id,
          madrasaName: madrasa?.name ?? '',
          town: madrasa?.town ?? '',
          className: s.className,
          gender: s.gender,
          memorised: data.hifz.filter(
            (h) => h.studentId === s.id && ['memorised', 'mastered', 'revising'].includes(h.status),
          ).length,
          needed: open.reduce((sum, i) => sum + i.amountDue - i.amountPaid, 0),
          invoiceOwed: open[0] ? open[0].amountDue - open[0].amountPaid : 0,
          note: s.sponsorshipNote ?? null,
        };
      })
      .filter((p) => p.needed > 0)
      .sort((a, b) => b.needed - a.needed);
  },

  async sponsorStudent(input) {
    await bootstrap();
    await delay(700, 1300);
    const data = requireDb();
    const profile = requireProfile();
    if (profile.role !== 'parent') {
      throw new ApiError('forbidden', 'Sign in with a parent account to sponsor a pupil.');
    }
    rateLimit(`pay:${profile.id}`, 5, 10 * 60);
    const student = data.students.find((s) => s.id === input.studentId && s.sponsorshipOpen);
    const invoice = student ? openInvoicesFor(student.id)[0] : undefined;
    if (!student || !invoice) throw new ApiError('not_found', 'That pupil is no longer waiting for a sponsor.');

    // The oldest open invoice's balance, never a figure from the client.
    const amount = invoice.amountDue - invoice.amountPaid;
    const phone = input.channel === 'mpesa' ? normaliseKenyanPhone(input.phone) : null;
    const payment: Payment = {
      id: newId(NS.payment),
      madrasaId: invoice.madrasaId,
      invoiceIds: [invoice.id],
      parentId: profile.id,
      amount,
      currency: 'KES',
      method: input.channel === 'card' ? 'card' : 'mpesa',
      providerRef: null,
      checkoutRequestId: `${input.channel === 'card' ? 'chg' : 'ws_CO'}_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      settledAt: null,
      receiptNo: null,
      payerPhone: phone ? maskKenyanPhone(phone) : null,
      isTest: true,
    };
    data.payments.push(payment);
    pendingSettlement.set(payment.checkoutRequestId!, {
      settleAt: Date.now() + (input.channel === 'card' ? 3000 : 7000),
      ...simulateMpesa(phone),
    });
    await persist();
    return {
      paymentId: payment.id,
      checkoutRequestId: payment.checkoutRequestId!,
      amount,
      currency: 'KES',
      phone,
      channel: input.channel,
      authorisationUrl: null,
    } satisfies PaymentIntent;
  },

  async setSponsorship(input) {
    await bootstrap();
    await delay();
    requireStaff();
    const madrasaId = requireMadrasaId();
    const student = requireDb().students.find((s) => s.id === input.studentId && s.madrasaId === madrasaId);
    if (!student) throw new ApiError('forbidden', "Only this pupil's madrasa can do that.");
    if (input.open && !input.guardianAgreed) {
      throw new ApiError('validation', 'The guardian must agree before a pupil is listed.');
    }
    student.sponsorshipOpen = input.open;
    student.sponsorshipNote = input.open ? input.note?.trim() || null : null;
    await persist();
  },

  async getVoiceReport(studentId: string, lang: VoiceLang) {
    await bootstrap();
    await delay();
    assertCanSeeStudent(studentId);
    const data = requireDb();
    const student = data.students.find((s) => s.id === studentId);
    if (!student) throw new ApiError('not_found', 'Student not found.');
    // The same facts the voice-report function gathers. Demo mode has no
    // speech service, so the phone reads the text with its own voice.
    const since = Date.now() - 30 * 86_400_000;
    const att = data.attendance.filter((a) => a.studentId === studentId && new Date(a.sessionDate).getTime() >= since);
    const hifz = data.hifz.filter((h) => h.studentId === studentId);
    const learning = hifz.find((h) => h.status === 'learning');
    const surah = learning ? getSurah(learning.surahNo) : undefined;
    const latest = sortByDateDesc(
      data.recitations.filter((r) => r.studentId === studentId && r.feedback),
      (r) => r.createdAt,
    ).find((r) => r.feedback?.teacherOverride || r.feedback?.overallScore !== null);
    const text = voiceReportText(
      {
        childName: student.fullName,
        attended: att.filter((a) => a.status === 'present' || a.status === 'late').length,
        sessions: att.filter((a) => a.status !== 'excused').length,
        memorisedSurahs: hifz.filter((h) => ['memorised', 'mastered', 'revising'].includes(h.status)).length,
        learning: learning && surah ? { surahName: lang === 'ar' ? surah.arabicName : surah.name, ayah: learning.ayahNo } : null,
        lastScore: latest?.feedback?.teacherOverride?.overallScore ?? latest?.feedback?.overallScore ?? null,
        teacherRemark: latest?.feedback?.teacherOverride?.remarks || null,
        balance: outstandingFor(studentId),
      },
      lang,
    );
    return { text, lang, audio: null };
  },

  // ------------------------------------------------------------ fees
  async listFeeStructures() {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    return requireDb().feeStructures.filter((f) => f.madrasaId === madrasaId);
  },

  async createFeeStructure(input) {
    await bootstrap();
    await delay(400, 700);
    const madrasaId = requireMadrasaId();
    const structure: FeeStructure = {
      id: newId(NS.feeStructure),
      madrasaId,
      name: input.name,
      academicYear: input.academicYear,
      term: input.term,
      amount: input.amount,
      currency: input.currency,
      appliesTo: input.appliesTo,
      classId: input.classId ?? null,
      studentId: input.studentId ?? null,
      isActive: true,
    };
    requireDb().feeStructures.push(structure);
    await persist();
    return structure;
  },

  async previewInvoices(input) {
    await bootstrap();
    await delay();
    return resolveBillingTarget(input).summary;
  },

  async issueInvoices(input) {
    await bootstrap();
    await delay(700, 1100);
    const data = requireDb();
    const madrasaId = requireMadrasaId();
    const { structure, targets, summary } = resolveBillingTarget(input);
    if (!summary.toIssue) return { ...summary, created: 0, invoices: [] };

    const issued: IssuedInvoice[] = [];
    let created = 0;
    targets.forEach((student) => {
      const duplicate = data.invoices.some(
        (inv) => inv.studentId === student.id && inv.feeStructureId === structure.id,
      );
      if (duplicate) return;
      created += 1;
      const invoice: Invoice = {
        id: newId(NS.invoice),
        madrasaId,
        studentId: student.id,
        studentName: student.fullName,
        admissionNo: student.admissionNo,
        invoiceNo: `INV-${structure.academicYear}-${String(data.invoices.length + 1).padStart(4, '0')}`,
        feeStructureId: structure.id,
        description: structure.name,
        amountDue: structure.amount,
        amountPaid: 0,
        currency: structure.currency,
        dueDate: input.dueDate,
        status: 'issued',
        issuedAt: new Date().toISOString(),
        notes: input.notes ?? null,
      };
      data.invoices.push(invoice);
      issued.push({
        invoiceNo: invoice.invoiceNo,
        studentName: student.fullName,
        amount: invoice.amountDue,
        dueDate: invoice.dueDate,
      });

      // Every issued invoice generates parent mail, the way the real
      // mail_outbox + Resend pipeline will.
      data.links
        .filter((l) => l.studentId === student.id && l.status === 'approved')
        .forEach((link) => {
          data.mail.push({
            id: newId(NS.mail),
            userId: link.parentId,
            kind: 'invoice_issued',
            title: `New invoice — ${structure.name}`,
            preview: `${structure.currency} ${structure.amount.toLocaleString()} due ${input.dueDate}`,
            body: `An invoice for ${structure.name} has been issued for ${student.fullName}. The amount is ${structure.currency} ${structure.amount.toLocaleString()}, due on ${input.dueDate}.`,
            payload: { invoiceNo: invoice.invoiceNo },
            createdAt: new Date().toISOString(),
            readAt: null,
            attachmentLabel: null,
          });
        });
    });

    await persist();
    return { ...summary, created, invoices: issued };
  },

  async listInvoices(params) {
    await bootstrap();
    await delay();
    const data = requireDb();
    const profile = requireProfile();
    let rows: Invoice[];

    if (params.studentId) {
      assertCanSeeStudent(params.studentId);
      rows = data.invoices.filter((inv) => inv.studentId === params.studentId);
    } else if (profile.role === 'parent') {
      const ids = approvedChildIds(profile.id);
      rows = data.invoices.filter((inv) => ids.includes(inv.studentId));
    } else {
      const madrasaId = requireMadrasaId();
      rows = data.invoices.filter((inv) => inv.madrasaId === madrasaId);
    }

    rows.forEach(refreshInvoiceStatus);
    if (params.status) rows = rows.filter((inv) => inv.status === params.status);
    return sortByDateDesc(rows, (inv) => inv.dueDate);
  },

  async getFeesSummary() {
    await bootstrap();
    await delay();
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const rows = data.invoices.filter((inv) => inv.madrasaId === madrasaId);
    rows.forEach(refreshInvoiceStatus);

    return {
      collected: rows.reduce((sum, inv) => sum + inv.amountPaid, 0),
      outstanding: rows
        .filter((inv) => inv.status !== 'paid' && inv.status !== 'void')
        .reduce((sum, inv) => sum + (inv.amountDue - inv.amountPaid), 0),
      overdueCount: rows.filter((inv) => inv.status === 'overdue').length,
      currency: 'KES',
    } satisfies FeesSummary;
  },

  async getChildBalances() {
    await bootstrap();
    await delay();
    const profile = requireProfile();
    const data = requireDb();
    const ids = approvedChildIds(profile.id);

    return ids.map((studentId) => {
      const student = data.students.find((s) => s.id === studentId)!;
      const invoices = data.invoices.filter((inv) => inv.studentId === studentId);
      invoices.forEach(refreshInvoiceStatus);
      return {
        studentId,
        studentName: student.fullName,
        admissionNo: student.admissionNo,
        outstanding: outstandingFor(studentId),
        overdueCount: invoices.filter((inv) => inv.status === 'overdue').length,
      } satisfies ChildBalance;
    });
  },

  async listPayments(params) {
    await bootstrap();
    await delay();
    const data = requireDb();
    const profile = requireProfile();

    if (params.studentId) {
      assertCanSeeStudent(params.studentId);
      const invoiceIds = new Set(
        data.invoices.filter((i) => i.studentId === params.studentId).map((i) => i.id),
      );
      return sortByDateDesc(
        data.payments.filter((p) => p.invoiceIds.some((id) => invoiceIds.has(id))),
        (p) => p.createdAt,
      );
    }
    if (profile.role === 'parent') {
      return sortByDateDesc(
        data.payments.filter((p) => p.parentId === profile.id),
        (p) => p.createdAt,
      );
    }
    const madrasaId = requireMadrasaId();
    return sortByDateDesc(
      data.payments.filter((p) => p.madrasaId === madrasaId),
      (p) => p.createdAt,
    );
  },

  async initiatePayment(input) {
    await bootstrap();
    await delay(800, 1400);
    const data = requireDb();
    const profile = requireProfile();
    rateLimit(`pay:${profile.id}`, 5, 10 * 60);

    const invoices = data.invoices.filter((inv) => input.invoiceIds.includes(inv.id));
    if (invoices.length === 0) throw new ApiError('not_found', 'Invoice not found.');
    invoices.forEach((inv) => assertCanSeeStudent(inv.studentId));

    // The amount comes from the invoices, never from the client payload.
    const amount = invoices.reduce((sum, inv) => sum + (inv.amountDue - inv.amountPaid), 0);
    if (amount <= 0) throw new ApiError('conflict', 'These invoices are already settled.');

    const phone = normaliseKenyanPhone(input.phone);
    const payment: Payment = {
      id: newId(NS.payment),
      madrasaId: invoices[0]!.madrasaId,
      invoiceIds: invoices.map((i) => i.id),
      parentId: profile.id,
      amount,
      currency: 'KES',
      method: 'mpesa',
      providerRef: null,
      checkoutRequestId: `ws_CO_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      settledAt: null,
      receiptNo: null,
      payerPhone: phone ? maskKenyanPhone(phone) : null,
      isTest: true,
    };
    data.payments.push(payment);
    pendingSettlement.set(payment.checkoutRequestId!, {
      settleAt: Date.now() + 7000,
      // Test endings (9999 cancelled, 8888 no balance, ...) fail on purpose.
      ...simulateMpesa(phone),
    });

    await persist();
    return {
      paymentId: payment.id,
      checkoutRequestId: payment.checkoutRequestId!,
      amount,
      currency: 'KES',
      phone,
      channel: 'mpesa',
      authorisationUrl: null,
    } satisfies PaymentIntent;
  },

  async payFees(input) {
    await bootstrap();
    await delay(700, 1300);
    const data = requireDb();
    const profile = requireProfile();
    rateLimit(`pay:${profile.id}`, 5, 10 * 60);

    const invoices = data.invoices.filter((inv) => input.invoiceIds.includes(inv.id));
    if (invoices.length === 0) throw new ApiError('not_found', 'Invoice not found.');
    invoices.forEach((inv) => assertCanSeeStudent(inv.studentId));

    // Derived from the invoices, never from the client payload.
    const amount = invoices.reduce((sum, inv) => sum + (inv.amountDue - inv.amountPaid), 0);
    if (amount <= 0) throw new ApiError('conflict', 'These invoices are already settled.');

    const madrasaId = invoices[0]!.madrasaId;
    let phone: string | null = null;
    let shouldFail = false;
    let failureReason: string | null = null;

    if (input.channel === 'mpesa') {
      phone = normaliseKenyanPhone(input.phone);
      ({ shouldFail, failureReason } = simulateMpesa(phone));
    }
    // A card is paid on the gateway's hosted page, which the mock does not
    // show: it settles as a successful test card a few seconds later.

    const payment: Payment = {
      id: newId(NS.payment),
      madrasaId,
      invoiceIds: invoices.map((i) => i.id),
      parentId: profile.id,
      amount,
      currency: 'KES',
      method: input.channel === 'card' ? 'card' : 'mpesa',
      providerRef: null,
      checkoutRequestId: `${input.channel === 'card' ? 'chg' : 'ws_CO'}_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      settledAt: null,
      receiptNo: null,
      payerPhone: phone ? maskKenyanPhone(phone) : null,
      isTest: true,
    };
    data.payments.push(payment);

    pendingSettlement.set(payment.checkoutRequestId!, {
      // Cards clear faster than an STK push, which waits on a human.
      settleAt: Date.now() + (input.channel === 'card' ? 3000 : 7000),
      shouldFail,
      failureReason,
    });

    await persist();
    return {
      paymentId: payment.id,
      checkoutRequestId: payment.checkoutRequestId!,
      amount,
      currency: 'KES',
      phone,
      channel: input.channel,
      authorisationUrl: null,
    } satisfies PaymentIntent;
  },

  async getPaymentStatus(checkoutRequestId) {
    // Always a copy. The stored payment is updated in place when it settles;
    // handing out the same object let React Query see "no change" and the pay
    // screen wait forever on a payment that had already succeeded.
    await bootstrap();
    await delay(300, 600);
    const data = requireDb();
    const payment = data.payments.find((p) => p.checkoutRequestId === checkoutRequestId);
    if (!payment) throw new ApiError('not_found', 'Payment not found.');
    if (payment.status !== 'pending') return { ...payment };

    const pending = pendingSettlement.get(checkoutRequestId);
    if (!pending || Date.now() < pending.settleAt) return { ...payment };

    if (pending.shouldFail) {
      payment.status = 'failed';
      payment.failureReason = pending.failureReason ?? MPESA_FAILURES[1032]!.reason;
      payment.failureCode = mpesaFailureCode(payment.failureReason);
      pendingSettlement.delete(checkoutRequestId);
      await persist();
      return { ...payment };
    }

    // Settlement mirrors the M-Pesa callback: money is applied server-side and
    // the invoices are updated inside the same operation.
    payment.status = 'success';
    payment.settledAt = new Date().toISOString();
    payment.providerRef = mpesaStyleCode(new Date());
    payment.receiptNo = `RCP-${new Date().getFullYear()}-${String(data.payments.length).padStart(4, '0')}`;

    let remaining = payment.amount;
    payment.invoiceIds.forEach((invoiceId) => {
      const invoice = data.invoices.find((i) => i.id === invoiceId);
      if (!invoice || remaining <= 0) return;
      const owed = invoice.amountDue - invoice.amountPaid;
      const applied = Math.min(owed, remaining);
      invoice.amountPaid += applied;
      remaining -= applied;
      refreshInvoiceStatus(invoice);
    });

    if (payment.parentId) {
      data.mail.push({
        id: newId(NS.mail),
        userId: payment.parentId,
        kind: 'payment_receipt',
        title: `Payment received — KES ${payment.amount.toLocaleString()}`,
        preview: `Receipt ${payment.receiptNo}`,
        body: `We have received your payment of KES ${payment.amount.toLocaleString()}. Your receipt number is ${payment.receiptNo}.`,
        payload: { receiptNo: payment.receiptNo },
        createdAt: new Date().toISOString(),
        readAt: null,
        attachmentLabel: 'Receipt PDF',
      });
    }

    pendingSettlement.delete(checkoutRequestId);
    await persist();
    return { ...payment };
  },

  // --------------------------------------------------- communication
  // ------------------------------------------------------ subscription
  async getSubscription() {
    await bootstrap();
    await delay(200, 450);
    requireStaff();
    const sub = refreshSubscription(requireSubscription());
    await persist();
    return sub;
  },

  async listSubscriptionInvoices() {
    await bootstrap();
    await delay(200, 450);
    requireStaff();
    const madrasaId = requireMadrasaId();
    return sortByDateDesc(
      requireDb().subInvoices.filter((i) => i.madrasaId === madrasaId),
      (i) => i.issuedAt,
    );
  },

  async listSubscriptionPayments() {
    await bootstrap();
    await delay(200, 450);
    requireStaff();
    const madrasaId = requireMadrasaId();
    return sortByDateDesc(
      requireDb().subPayments.filter((p) => p.madrasaId === madrasaId),
      (p) => p.createdAt,
    );
  },

  async startSubscriptionPayment(input) {
    await bootstrap();
    await delay(800, 1400);
    const data = requireDb();
    const profile = requireStaff();
    const madrasaId = requireMadrasaId();
    rateLimit(`sub-pay:${profile.id}`, 5, 10 * 60);

    // Only the owner pays. A teacher must not be able to charge the school.
    const me = data.teachers.find((t) => t.profileId === profile.id);
    if (!me?.isOwner) {
      throw new ApiError('forbidden', 'Only the madrasa owner can manage the subscription.');
    }

    const sub = refreshSubscription(requireSubscription());

    // The oldest unpaid invoice, or a fresh one if the trial is ending.
    let invoice = data.subInvoices
      .filter((i) => i.madrasaId === madrasaId && i.status !== 'paid')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

    if (!invoice) {
      invoice = buildSubscriptionInvoice({
        madrasaId,
        subscriptionId: sub.id,
        periodStart: new Date(),
        amount: sub.plan.amount,
      });
      data.subInvoices.push(invoice);
    }

    // The amount comes from the invoice, which came from the plan. The client
    // has no way to influence it.
    const amount = invoice.amountDue - invoice.amountPaid;

    let card: SavedCard | null = null;
    let phone: string | null = null;
    let shouldFail = false;
    let failureReason: string | null = null;

    if (input.channel === 'mpesa') {
      phone = normaliseKenyanPhone(input.phone);
      shouldFail = phone.endsWith('9999');
      if (shouldFail) failureReason = 'The M-Pesa request was cancelled or timed out.';
    } else {
      // Paid on the gateway's hosted page; the mock settles a test card.
      card = { id: 'hosted', madrasaId, last4: '4242', brand: 'visa' } as SavedCard;
    }

    const payment = buildSubscriptionPayment({
      madrasaId,
      invoiceId: invoice.id,
      amount,
      channel: input.channel,
      card: card ? { last4: card.last4, brand: card.brand } : null,
    });
    data.subPayments.push(payment);

    pendingSettlement.set(payment.checkoutRequestId!, {
      settleAt: Date.now() + (input.channel === 'card' ? 3000 : 7000),
      shouldFail,
      failureReason,
    });

    await persist();
    return {
      paymentId: payment.id,
      checkoutRequestId: payment.checkoutRequestId!,
      amount,
      currency: payment.currency,
      phone,
      channel: input.channel,
      authorisationUrl: null,
    } satisfies PaymentIntent;
  },

  async getSubscriptionPaymentStatus(checkoutRequestId) {
    // Always a copy. The stored payment is updated in place when it settles;
    // handing out the same object let React Query see "no change" and the pay
    // screen wait forever on a payment that had already succeeded.
    await bootstrap();
    await delay(300, 600);
    const data = requireDb();
    const payment = data.subPayments.find((p) => p.checkoutRequestId === checkoutRequestId);
    if (!payment) throw new ApiError('not_found', 'Payment not found.');
    if (payment.status !== 'pending' && payment.status !== 'initiated') return { ...payment };

    const pending = pendingSettlement.get(checkoutRequestId);
    if (!pending || Date.now() < pending.settleAt) return { ...payment };

    pendingSettlement.delete(checkoutRequestId);

    if (pending.shouldFail) {
      payment.status = 'failed';
      payment.failureReason = pending.failureReason ?? 'The payment did not go through.';
      await persist();
      return { ...payment };
    }

    // Settlement mirrors a gateway callback: the invoice and the subscription
    // period both move inside the same operation, never from the client.
    payment.status = 'success';
    payment.settledAt = new Date().toISOString();
    payment.providerRef =
      payment.channel === 'card'
        ? `ch_${Math.random().toString(36).slice(2, 12)}`
        : `S${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    payment.receiptNo = `DMR-${new Date().getFullYear()}-${String(data.subPayments.length).padStart(4, '0')}`;

    const invoice = data.subInvoices.find((i) => i.id === payment.subscriptionInvoiceId);
    if (invoice) {
      invoice.amountPaid += payment.amount;
      invoice.status = invoice.amountPaid >= invoice.amountDue ? 'paid' : 'partially_paid';
    }

    const sub = requireSubscription();
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    sub.currentPeriodStart = start.toISOString();
    sub.currentPeriodEnd = end.toISOString();
    sub.graceEndsAt = null;
    sub.cancelledAt = null;
    sub.status = 'active';

    // Renewals need a card on file; M-Pesa cannot be charged unattended.
    if (payment.channel === 'card' && payment.cardLast4) {
      const saved = data.savedCards.find((c) => c.last4 === payment.cardLast4);
      if (saved) sub.defaultCard = saved;
    }

    await persist();
    return { ...payment };
  },

  async cancelSubscription(input) {
    await bootstrap();
    await delay(400, 700);
    const profile = requireStaff();
    const me = requireDb().teachers.find((t) => t.profileId === profile.id);
    if (!me?.isOwner) {
      throw new ApiError('forbidden', 'Only the madrasa owner can cancel the subscription.');
    }

    const sub = requireSubscription();
    // Cancelling never cuts access mid-period: the madrasa keeps what it has
    // already paid for, and simply does not renew.
    sub.cancelAtPeriodEnd = true;
    if (!sub.currentPeriodEnd) {
      sub.cancelledAt = new Date().toISOString();
      sub.status = 'cancelled';
    }
    void input.reason;
    await persist();
    return sub;
  },

  async resumeSubscription() {
    await bootstrap();
    await delay(400, 700);
    const profile = requireStaff();
    const me = requireDb().teachers.find((t) => t.profileId === profile.id);
    if (!me?.isOwner) {
      throw new ApiError('forbidden', 'Only the madrasa owner can manage the subscription.');
    }
    const sub = requireSubscription();
    sub.cancelAtPeriodEnd = false;
    sub.cancelledAt = null;
    refreshSubscription(sub);
    await persist();
    return sub;
  },

  // ------------------------------------------------------- saved cards
  async listSavedCards() {
    await bootstrap();
    await delay(200, 400);
    const profile = requireProfile();
    const data = requireDb();

    // A parent sees only their own cards; staff see only the madrasa's.
    // Staff must never see a parent's card, not even the last four digits.
    return profile.role === 'parent'
      ? data.savedCards.filter((c) => c.parentId === profile.id)
      : data.savedCards.filter((c) => !c.parentId && c.madrasaId === requireMadrasaId());
  },

  async removeSavedCard(cardId) {
    await bootstrap();
    await delay(300, 500);
    const data = requireDb();
    const mine = await mockApi.listSavedCards();
    if (!mine.some((c) => c.id === cardId)) {
      throw new ApiError('not_found', 'Card not found.');
    }
    data.savedCards = data.savedCards.filter((c) => c.id !== cardId);
    const sub = data.subscriptions.find((s) => s.defaultCard?.id === cardId);
    if (sub) sub.defaultCard = null;
    await persist();
  },

  async setDefaultCard(cardId) {
    await bootstrap();
    await delay(300, 500);
    const data = requireDb();
    const mine = await mockApi.listSavedCards();
    const target = mine.find((c) => c.id === cardId);
    if (!target) throw new ApiError('not_found', 'Card not found.');

    for (const card of mine) card.isDefault = card.id === cardId;
    const sub = data.subscriptions.find((s) => s.madrasaId === target.madrasaId);
    if (sub && !target.parentId) sub.defaultCard = target;
    await persist();
  },

  // --------------------------------------------------- platform admin
  async getAdminOverview() {
    await bootstrap();
    await delay(300, 600);
    requireAdmin();
    const data = requireDb();
    const count = (status: MadrasaStatus) => data.madrasas.filter((m) => m.status === status).length;
    const since = Date.now() - 30 * 86_400_000;
    const subscriptions: AdminOverview['subscriptions'] = {};
    for (const s of data.subscriptions) {
      const status = refreshSubscription(s).status;
      subscriptions[status] = (subscriptions[status] ?? 0) + 1;
    }
    return {
      madrasas: {
        active: count('active'),
        suspended: count('suspended'),
        pending_deletion: count('pending_deletion'),
        deleted: count('deleted'),
      },
      people: {
        students: data.students.length,
        teachers: data.teachers.length,
        parents: data.profiles.filter((p) => p.role === 'parent').length,
      },
      subscriptions,
      revenue30d: {
        subscriptions: data.subPayments
          .filter((p) => p.status === 'success' && p.settledAt && Date.parse(p.settledAt) > since)
          .reduce((sum, p) => sum + p.amount, 0),
        feesCollected: data.payments
          .filter((p) => p.status === 'success' && p.settledAt && Date.parse(p.settledAt) > since)
          .reduce((sum, p) => sum + p.amount, 0),
        currency: 'KES',
      },
      // The mock delivers nothing, so nothing can stall.
      delivery: { stalled: 0, emailFailed: 0, smsFailed: 0 },
      generatedAt: new Date().toISOString(),
    } satisfies AdminOverview;
  },

  async listAdminMadrasas() {
    await bootstrap();
    await delay(300, 600);
    requireAdmin();
    const data = requireDb();
    return data.madrasas.map((m) => {
      const owner = data.profiles.find((p) => p.id === m.ownerId);
      const sub = data.subscriptions.find((s) => s.madrasaId === m.id);
      const lastAudit = data.audit
        .filter((a) => a.madrasaId === m.id)
        .reduce<string | null>((max, a) => (!max || a.createdAt > max ? a.createdAt : max), null);
      return {
        id: m.id,
        name: m.name,
        slug: m.slug,
        county: m.county,
        town: m.town,
        status: m.status,
        createdAt: m.createdAt,
        suspendedAt: null,
        deletionScheduledAt: null,
        deletionReason: null,
        ownerName: owner?.fullName ?? null,
        ownerEmail: owner?.email ?? null,
        contactPhone: m.contactPhone,
        subscriptionStatus: sub ? refreshSubscription(sub).status : null,
        trialEndsAt: sub?.trialEndsAt ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        students: data.students.filter((s) => s.madrasaId === m.id).length,
        teachers: data.teachers.filter((t) => t.madrasaId === m.id).length,
        parents: new Set(
          data.links.filter((l) => l.madrasaId === m.id && l.status === 'approved').map((l) => l.parentId),
        ).size,
        feesOutstanding: data.invoices
          .filter((i) => i.madrasaId === m.id && ['issued', 'partially_paid', 'overdue'].includes(i.status))
          .reduce((sum, i) => sum + (i.amountDue - i.amountPaid), 0),
        lastActivityAt: lastAudit,
      } satisfies AdminMadrasa;
    });
  },

  async listAdminAudit(params) {
    await bootstrap();
    await delay(300, 600);
    requireAdmin();
    const data = requireDb();
    return sortByDateDesc(
      data.audit.filter((a) => !params.madrasaId || a.madrasaId === params.madrasaId),
      (a) => a.createdAt,
    )
      .slice(0, 200)
      .map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        actorName: a.actorName,
        actorRole: a.actorRole,
        madrasaId: a.madrasaId,
        madrasaName: data.madrasas.find((m) => m.id === a.madrasaId)?.name ?? null,
        reason: (a as AuditEntry & { reason?: string }).reason ?? null,
      }));
  },

  async changeMadrasaStatus(input) {
    await bootstrap();
    await delay(500, 900);
    const admin = requireAdmin();
    const parsed = madrasaLifecycleSchema.safeParse(input);
    if (!parsed.success) throw new ApiError('validation', 'A written reason is required.');
    const data = requireDb();
    const madrasa = data.madrasas.find((m) => m.id === input.madrasaId);
    if (!madrasa) throw new ApiError('not_found', 'Madrasa not found.');
    if (input.action === 'purge' && input.confirmName?.trim() !== madrasa.name) {
      throw new ApiError('validation', 'Type the madrasa name exactly to confirm permanent deletion.');
    }
    const next: Record<MadrasaLifecycleInput['action'], MadrasaStatus> = {
      suspend: 'suspended',
      schedule_deletion: 'pending_deletion',
      reinstate: 'active',
      // The mock marks it deleted rather than erasing the demo's only school.
      purge: 'deleted',
    };
    madrasa.status = next[input.action];
    data.audit.push({
      id: newId(NS.audit),
      actorId: admin.id,
      actorName: admin.fullName,
      actorRole: 'admin',
      madrasaId: madrasa.id,
      action: `madrasa.${input.action}`,
      entityType: 'madrasa',
      entityId: madrasa.id,
      createdAt: new Date().toISOString(),
      ip: null,
      reason: input.reason ?? null,
    } as AuditEntry);
    await persist();
    return { status: madrasa.status };
  },

  // The mock has no push service; registration is accepted and forgotten.
  async registerPushToken() {},
  async unregisterPushToken() {},

  async listAnnouncements() {
    await bootstrap();
    await delay();
    const data = requireDb();
    const profile = requireProfile();
    const madrasaId = profile.madrasaId;
    if (!madrasaId) return [];

    const audience =
      profile.role === 'parent'
        ? 'parents'
        : profile.role === 'student'
          ? 'students'
          : 'teachers';
    return sortByDateDesc(
      data.announcements.filter(
        (a) => a.madrasaId === madrasaId && a.audience.includes(audience),
      ),
      (a) => a.publishAt,
    );
  },

  async createAnnouncement(input) {
    await bootstrap();
    await delay(400, 700);
    const madrasaId = requireMadrasaId();
    const profile = requireProfile();
    const announcement: Announcement = {
      id: newId(NS.announcement),
      madrasaId,
      authorId: profile.id,
      authorName: profile.fullName,
      title: input.title,
      body: input.body,
      audience: input.audience,
      publishAt: input.publishAt ?? new Date().toISOString(),
      expiresAt: input.expiresAt ?? null,
    };
    requireDb().announcements.push(announcement);
    await persist();
    return announcement;
  },

  async listMail() {
    await bootstrap();
    await delay();
    const profile = requireProfile();
    return sortByDateDesc(
      requireDb().mail.filter((m) => m.userId === profile.id),
      (m) => m.createdAt,
    );
  },

  async markMailRead(mailId) {
    await bootstrap();
    const profile = requireProfile();
    const item = requireDb().mail.find((m) => m.id === mailId && m.userId === profile.id);
    if (item && !item.readAt) {
      item.readAt = new Date().toISOString();
      await persist();
    }
  },

  async markAllMailRead() {
    await bootstrap();
    await delay(200, 400);
    const profile = requireProfile();
    const stamp = new Date().toISOString();
    requireDb()
      .mail.filter((m) => m.userId === profile.id && !m.readAt)
      .forEach((m) => {
        m.readAt = stamp;
      });
    await persist();
  },

  async listThreads() {
    await bootstrap();
    await delay();
    const profile = requireProfile();
    const data = requireDb();
    const threadIds = new Set(
      data.messages
        .filter((m) => m.senderId === profile.id || m.recipientId === profile.id)
        .map((m) => m.threadId),
    );
    return data.threads.filter((t) => threadIds.has(t.id));
  },

  async listMessages(threadId) {
    await bootstrap();
    await delay();
    const profile = requireProfile();
    const rows = requireDb().messages.filter(
      (m) =>
        m.threadId === threadId &&
        (m.senderId === profile.id || m.recipientId === profile.id),
    );
    // Mark inbound messages read as soon as the thread is opened.
    rows.forEach((m) => {
      if (m.recipientId === profile.id && !m.readAt) m.readAt = new Date().toISOString();
    });
    const thread = requireDb().threads.find((t) => t.id === threadId);
    if (thread) thread.unreadCount = 0;
    await persist();
    return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async sendMessage(input) {
    await bootstrap();
    await delay(300, 600);
    const profile = requireProfile();
    rateLimit(`msg:${profile.id}`, 60, 60 * 60);
    const data = requireDb();

    const threadId = input.threadId ?? newId(NS.thread);
    if (!data.threads.some((t) => t.id === threadId)) {
      const counterpart = data.profiles.find((p) => p.id === input.recipientId);
      data.threads.push({
        id: threadId,
        subjectName: counterpart?.fullName ?? 'Conversation',
        counterpartId: input.recipientId,
        counterpartName: counterpart?.fullName ?? 'Teacher',
        counterpartRole: counterpart?.role ?? 'teacher',
        lastMessage: input.body,
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
      });
    }

    const message: Message = {
      id: newId(NS.message),
      threadId,
      senderId: profile.id,
      senderName: profile.fullName,
      recipientId: input.recipientId,
      body: input.body,
      attachmentUrl: input.attachmentUrl ?? null,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    data.messages.push(message);

    const thread = data.threads.find((t) => t.id === threadId);
    if (thread) {
      thread.lastMessage = input.body;
      thread.lastMessageAt = message.createdAt;
    }
    await persist();
    return message;
  },

  async listNotifications() {
    await bootstrap();
    await delay();
    const profile = requireProfile();
    return sortByDateDesc(
      requireDb().notifications.filter((n) => n.userId === profile.id),
      (n) => n.createdAt,
    );
  },

  async getNotificationPreferences() {
    await bootstrap();
    await delay(150, 300);
    return notificationPrefs;
  },

  async saveNotificationPreferences(prefs) {
    await bootstrap();
    await delay(250, 500);
    notificationPrefs = prefs;
    return prefs;
  },

  // ------------------------------------------------------ dashboards
  async getTeacherDashboard() {
    await bootstrap();
    await delay(300, 600);
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const madrasa = data.madrasas.find((m) => m.id === madrasaId)!;
    const profile = requireProfile();
    const teacher = data.teachers.find((t) => t.profileId === profile.id);

    const today = new Date();
    const weekdays = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ] as const;
    const todayName = weekdays[today.getDay()];
    const todayIso = isoDate(today);

    // Owners see the whole madrasa; a regular teacher sees their own classes.
    const visibleClasses = data.classes.filter(
      (c) => c.madrasaId === madrasaId && (teacher?.isOwner || c.teacherId === teacher?.id),
    );

    const todaysClasses = visibleClasses
      .filter((c) => c.schedule.some((s) => s.day === todayName))
      .map((klass) => ({
        klass,
        attendanceMarked: data.attendance.some(
          (a) => a.classId === klass.id && a.sessionDate === todayIso,
        ),
      }));

    const students = data.students.filter((s) => s.madrasaId === madrasaId);
    const weekAgo = isoDate(new Date(Date.now() - 7 * 86_400_000));
    const weekRows = data.attendance.filter((a) => a.sessionDate >= weekAgo);
    const attendanceRateThisWeek =
      weekRows.length === 0
        ? 0
        : Math.round(
            (weekRows.filter((a) => a.status === 'present' || a.status === 'late').length /
              weekRows.length) *
              100,
          );

    const invoices = data.invoices.filter((inv) => inv.madrasaId === madrasaId);
    invoices.forEach(refreshInvoiceStatus);

    const onboarding: OnboardingTask[] = [
      { key: 'add_class', done: visibleClasses.length > 0 },
      { key: 'add_student', done: students.length > 0 },
      { key: 'invite_teacher', done: data.teachers.filter((t) => t.madrasaId === madrasaId).length > 1 },
      { key: 'set_fees', done: data.feeStructures.some((f) => f.madrasaId === madrasaId) },
      {
        key: 'invite_parents',
        done: data.links.some((l) => l.madrasaId === madrasaId && l.status === 'approved'),
      },
    ];

    return {
      madrasaName: madrasa.name,
      pendingReviewCount: data.recitations.filter(
        (r) =>
          r.madrasaId === madrasaId &&
          r.feedback !== null &&
          r.feedback.reviewedByTeacherId === null,
      ).length,
      pendingLinkRequests: data.links.filter(
        (l) => l.madrasaId === madrasaId && l.status === 'pending',
      ).length,
      todaysClasses,
      studentCount: students.length,
      attendanceRateThisWeek,
      feesCollected: invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
      feesOutstanding: invoices
        .filter((inv) => inv.status !== 'paid' && inv.status !== 'void')
        .reduce((sum, inv) => sum + (inv.amountDue - inv.amountPaid), 0),
      onboarding,
      recentAnnouncements: sortByDateDesc(
        data.announcements.filter((a) => a.madrasaId === madrasaId),
        (a) => a.publishAt,
      ).slice(0, 3),
      liveLesson: findLiveLesson(
        data.lessons.filter(
          (l) =>
            l.madrasaId === madrasaId &&
            visibleClasses.some((klass) => klass.id === l.classId),
        ),
      ),
    } satisfies TeacherDashboard;
  },

  async getStudentDashboard() {
    await bootstrap();
    await delay(300, 600);
    const data = requireDb();
    const studentId = myStudentId();
    const student = data.students.find((s) => s.id === studentId)!;
    const today = isoDate();

    const revisionDue = data.hifz
      .filter(
        (h) =>
          h.studentId === studentId &&
          h.nextReviewAt !== null &&
          h.nextReviewAt.slice(0, 10) <= today,
      )
      .slice(0, 6);

    const upcoming = data.lessons
      .filter((l) => l.classId === student.classId && l.scheduledFor)
      .filter((l) => new Date(l.scheduledFor!).getTime() >= Date.now())
      .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));

    const openAssignments = data.assignments
      .filter((a) => a.classId === student.classId)
      .filter(
        (a) =>
          !data.submissions.some(
            (s) => s.assignmentId === a.id && s.studentId === studentId,
          ),
      )
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    const recitations = sortByDateDesc(
      data.recitations.filter((r) => r.studentId === studentId),
      (r) => r.createdAt,
    );

    return {
      studentName: student.fullName,
      admissionNo: student.admissionNo,
      className: student.className,
      streakDays: streakFor(studentId),
      revisionDue,
      nextLesson: upcoming[0] ?? null,
      openAssignments,
      hifzSummary: hifzSummaryFor(studentId),
      attendanceRate: attendanceRateFor(studentId),
      lastRecitation: recitations[0] ?? null,
      liveLesson: findLiveLesson(data.lessons.filter((l) => l.classId === student.classId)),
    } satisfies StudentDashboard;
  },

  async search(query) {
    await bootstrap();
    await delay(200, 400);
    const term = query.trim().toLowerCase();
    if (term.length < 2) {
      return { students: [], classes: [], lessons: [], invoices: [] };
    }
    const madrasaId = requireMadrasaId();
    const data = requireDb();

    return {
      students: data.students
        .filter(
          (s) =>
            s.madrasaId === madrasaId &&
            (s.fullName.toLowerCase().includes(term) ||
              s.admissionNo.toLowerCase().includes(term)),
        )
        .slice(0, 8),
      classes: data.classes
        .filter((c) => c.madrasaId === madrasaId && c.name.toLowerCase().includes(term))
        .slice(0, 5),
      lessons: data.lessons
        .filter((l) => l.madrasaId === madrasaId && l.title.toLowerCase().includes(term))
        .slice(0, 5),
      invoices: data.invoices
        .filter(
          (i) =>
            i.madrasaId === madrasaId &&
            (i.invoiceNo.toLowerCase().includes(term) ||
              i.studentName.toLowerCase().includes(term)),
        )
        .slice(0, 5),
    } satisfies SearchResults;
  },

  async listCertificates(studentId) {
    await bootstrap();
    await delay();
    assertCanSeeStudent(studentId);
    return requireDb().certificates.filter((c) => c.studentId === studentId);
  },

  async issueCertificate(input) {
    await bootstrap();
    await delay(400, 700);
    requireStaff();
    const data = requireDb();
    const student = data.students.find((s) => s.id === input.studentId);
    if (!student) throw new ApiError('not_found', 'Student not found.');
    // The code is the server's to choose, as in migration 0023.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * 32)]).join('');
    const issuer = requireProfile();
    const certificate: Certificate = {
      id: newId(NS.certificate),
      studentId: student.id,
      studentName: student.fullName,
      kind: input.kind,
      title: input.title,
      issuedAt: new Date().toISOString(),
      verificationCode: code,
      pdfUrl: null,
      // As in migration 0030: an ijazah carries the awarding teacher, then their chain.
      sanad: input.kind === 'ijazah' ? [issuer.fullName, ...(mockSanad.get(issuer.id) ?? [])] : null,
    };
    data.certificates.push(certificate);
    const recipients = [
      student.profileId,
      ...data.links
        .filter((l) => l.studentId === student.id && l.status === 'approved')
        .map((l) => l.parentId),
    ];
    recipients.forEach((userId) =>
      data.mail.push({
        id: newId(NS.mail),
        userId,
        kind: 'certificate_issued',
        title: 'Certificate awarded',
        preview: input.title,
        body: `${student.fullName} has been awarded: ${input.title}. Verification code ${code}.`,
        payload: { certificateId: certificate.id },
        createdAt: certificate.issuedAt,
        readAt: null,
        attachmentLabel: null,
      }),
    );
    await persist();
    return certificate;
  },

  async setAiFeedbackConsent(studentId, allowed) {
    await bootstrap();
    await delay();
    const data = requireDb();
    const profile = requireProfile();
    const student = data.students.find((s) => s.id === studentId);
    if (!student) throw new ApiError('not_found', 'Student not found.');
    const isStaff = profile.role === 'teacher' && profile.madrasaId === student.madrasaId;
    const isParent = profile.role === 'parent' && approvedChildIds(profile.id).includes(studentId);
    if (!isStaff && !isParent) {
      throw new ApiError('forbidden', 'Only the pupil\u2019s madrasa or an approved parent can change this.');
    }
    student.aiFeedbackConsent = allowed;
    await persist();
  },

  async getMySanad() {
    await bootstrap();
    await delay();
    const profile = requireStaff();
    return mockSanad.get(profile.id) ?? [];
  },

  async getTajweedHeatmap(days) {
    await bootstrap();
    await delay();
    requireStaff();
    const madrasaId = requireMadrasaId();
    const since = Date.now() - days * 86_400_000;
    // As in migration 0031: assessed findings only; dismissed ones are already gone.
    const cells = new Map<string, HeatmapCell & { pupils: Set<string> }>();
    for (const r of requireDb().recitations) {
      if (r.madrasaId !== madrasaId || r.feedback?.assessment !== 'assessed') continue;
      if (new Date(r.createdAt).getTime() < since) continue;
      for (const e of r.feedback.errors) {
        const key = `${e.surahNo}:${e.ayahNo}:${e.rule}`;
        const cell = cells.get(key) ?? { surahNo: e.surahNo, ayahNo: e.ayahNo, rule: e.rule, mistakes: 0, students: 0, pupils: new Set<string>() };
        cell.mistakes += 1;
        cell.pupils.add(r.studentId);
        cell.students = cell.pupils.size;
        cells.set(key, cell);
      }
    }
    return [...cells.values()].map(({ pupils: _pupils, ...cell }) => cell);
  },

  async getTeacherSignals() {
    await bootstrap();
    await delay();
    requireStaff();
    const madrasaId = requireMadrasaId();
    const data = requireDb();
    const now = Date.now();
    const ago = (iso: string) => (now - new Date(iso).getTime()) / 86_400_000;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    // Mirrors migration 0032. Demo hifz rows have no updated_at, so the last
    // revision stands in for when the current surah last moved.
    return data.students
      .filter((s) => s.madrasaId === madrasaId && s.enrollmentStatus === 'active')
      .map((s): PupilSignals => {
        const att = data.attendance.filter((a) => a.studentId === s.id && ago(a.sessionDate) < 28);
        const recentAtt = att.filter((a) => ago(a.sessionDate) < 14);
        const prevAtt = att.filter((a) => ago(a.sessionDate) >= 14);
        const came = (xs: typeof att) => xs.filter((a) => a.status === 'present' || a.status === 'late').length;
        const counted = (xs: typeof att) => xs.filter((a) => a.status !== 'excused').length;
        const hifz = data.hifz.filter((h) => h.studentId === s.id);
        const learning = hifz.find((h) => h.status === 'learning');
        const memorised = hifz.filter((h) => MEMORISED_STATUSES.includes(h.status));
        const recs = data.recitations.filter((r) => r.studentId === s.id);
        const score = (r: Recitation) => r.feedback?.teacherOverride?.overallScore ?? r.feedback?.overallScore ?? null;
        const scores = (from: number, to: number) =>
          recs.filter((r) => ago(r.createdAt) >= from && ago(r.createdAt) < to).map(score).filter((x): x is number => x !== null);
        return {
          studentId: s.id,
          fullName: s.fullName,
          className: s.className,
          presentRecent: came(recentAtt),
          sessionsRecent: counted(recentAtt),
          presentPrev: came(prevAtt),
          sessionsPrev: counted(prevAtt),
          learningSurah: learning?.surahNo ?? null,
          learningAyah: learning?.ayahNo ?? null,
          learningMovedAt: learning?.lastRevisedAt ?? null,
          overdueReviews: memorised.filter((h) => h.nextReviewAt !== null && ago(h.nextReviewAt) > 3).length,
          // Demo rows carry no updated_at, so there is no telling when a surah was memorised.
          memorisedWeek: 0,
          lastRecitationAt: recs.map((r) => r.createdAt).sort().at(-1) ?? null,
          scoreRecent: avg(scores(0, 14)),
          scorePrev: avg(scores(14, 42)),
        };
      });
  },

  async setMySanad(chain) {
    await bootstrap();
    await delay();
    const profile = requireStaff();
    const clean = chain.map((n) => n.trim()).filter(Boolean);
    if (clean.length > 40) throw new ApiError('validation', 'A chain can list at most 40 teachers.');
    mockSanad.set(profile.id, clean);
    return clean;
  },

  async withdrawCertificate(certificateId) {
    await bootstrap();
    await delay();
    requireStaff();
    const data = requireDb();
    data.certificates = data.certificates.filter((c) => c.id !== certificateId);
    await persist();
  },

  async verifyCertificate(code) {
    await bootstrap();
    await delay();
    const clean = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const data = requireDb();
    const certificate = data.certificates.find((c) => c.verificationCode === clean);
    if (!certificate) return null;
    const student = data.students.find((s) => s.id === certificate.studentId);
    const madrasa = data.madrasas.find((m) => m.id === student?.madrasaId);
    return {
      title: certificate.title,
      kind: certificate.kind,
      studentName: certificate.studentName,
      madrasaName: madrasa?.name ?? '',
      issuedAt: certificate.issuedAt,
      valid: madrasa?.status === 'active',
    };
  },

  async getAttendanceQrToken(classId) {
    await bootstrap();
    await delay(120, 260);
    requireMadrasaId();
    // Rotates every 30 seconds so a screenshot is useless a moment later.
    const window = Math.floor(Date.now() / 30_000);
    return {
      token: `${classId}:${window}:${(window * 7919) % 999983}`,
      expiresAt: new Date((window + 1) * 30_000).toISOString(),
    };
  },

  async markAttendanceByQr({ token, studentId }) {
    await bootstrap();
    await delay(300, 600);
    const data = requireDb();
    const [classId, windowRaw] = token.split(':');
    const window = Number(windowRaw);
    const currentWindow = Math.floor(Date.now() / 30_000);
    // One window of grace for slow scans; anything older is a replay.
    if (!classId || !Number.isFinite(window) || currentWindow - window > 1) {
      throw new ApiError('expired_code', 'That code has expired. Ask for a fresh one.');
    }

    const student = data.students.find((s) => s.id === studentId);
    if (!student) throw new ApiError('not_found', 'Student not found.');
    const sessionDate = isoDate();
    const existing = data.attendance.find(
      (a) => a.studentId === studentId && a.sessionDate === sessionDate,
    );
    // A student who is not in that class must not be marked present by it.
    if (student.classId !== classId) {
      throw new ApiError('wrong_class', 'That code is for a different class.');
    }

    if (existing) return { status: existing.status, sessionDate, classId };

    data.attendance.push({
      id: newId(NS.attendance),
      studentId,
      studentName: student.fullName,
      classId,
      sessionDate,
      status: 'present',
      method: 'qr',
      note: null,
    });
    await persist();
    return { status: 'present' as const, sessionDate, classId };
  },
};

/** Used by the settings screen to start over from a clean seed. */
export async function resetMockData(): Promise<void> {
  db = createSeed();
  currentProfileId = null;
  attemptLog.clear();
  pendingSettlement.clear();
  await AsyncStorage.multiRemove([DB_KEY, SESSION_KEY]);
  await persist();
}
