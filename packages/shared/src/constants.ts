/**
 * Platform-wide constants shared by the mobile app, the web console and the
 * Edge Functions. Anything that must agree across those boundaries lives here.
 */

export const APP_NAME = 'Digital Madrasa';

/** Admission numbers are `DM-YYYY-XXXX`, unique platform-wide per year. */
export const ADMISSION_NO_PREFIX = 'DM';
export const ADMISSION_NO_REGEX = /^DM-\d{4}-\d{4}$/;

/** Kenyan mobile numbers, the primary market. */
export const KE_PHONE_REGEX = /^\+?254[17]\d{8}$/;

export const DEFAULT_CURRENCY = 'KES';
export const DEFAULT_TIMEZONE = 'Africa/Nairobi';

export const ROLES = ['student', 'teacher', 'parent', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const MADRASA_STATUSES = ['active', 'suspended', 'pending_deletion', 'deleted'] as const;
export type MadrasaStatus = (typeof MADRASA_STATUSES)[number];

export const ENROLLMENT_STATUSES = ['active', 'graduated', 'withdrawn'] as const;
export const LINK_STATUSES = ['pending', 'approved', 'rejected', 'revoked'] as const;
export const RELATIONSHIPS = ['father', 'mother', 'guardian'] as const;

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ASSIGNMENT_TYPES = ['memorisation', 'recitation', 'tajweed', 'written'] as const;
export const SUBMISSION_STATUSES = ['pending', 'graded', 'returned'] as const;

export const HIFZ_STATUSES = [
  'not_started',
  'learning',
  'memorised',
  'revising',
  'mastered',
] as const;
export type HifzStatus = (typeof HIFZ_STATUSES)[number];

export const INVOICE_STATUSES = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'void',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['mpesa', 'cash', 'bank', 'stripe', 'card'] as const;
export const PAYMENT_STATUSES = ['initiated', 'pending', 'success', 'failed', 'reversed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Qiraah styles. A reading that is correct in one style is not necessarily
 * correct in another, so this is an *input* to tajweed evaluation.
 */
export const QIRAAH_STYLES = ['hafs', 'warsh', 'qaloon', 'duri', 'shubah'] as const;
export type QiraahStyle = (typeof QIRAAH_STYLES)[number];

/** Tajweed rules the evaluation layer can report on. */
export const TAJWEED_RULES = [
  'madd',
  'ghunnah',
  'qalqalah',
  'ikhfa',
  'idgham',
  'iqlab',
  'izhar',
  'tafkhim',
  'tarqiq',
  'waqf',
] as const;
export type TajweedRule = (typeof TAJWEED_RULES)[number];

export const TAJWEED_SEVERITIES = ['minor', 'moderate', 'major'] as const;
export type TajweedSeverity = (typeof TAJWEED_SEVERITIES)[number];

export const SUPPORTED_LOCALES = ['en', 'sw', 'so', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ['ar'];

/**
 * All 47 Kenyan counties, in official county-code order (001 Mombasa through
 * 047 Nairobi) as set out in the First Schedule to the Constitution.
 *
 * Kept in code order rather than alphabetical because the code is the
 * canonical identifier: it is what appears on government returns, and a
 * madrasa's registration paperwork will carry it. The picker sorts for
 * display, so ordering here is about correctness, not presentation.
 */
export const KENYA_COUNTIES = [
  'Mombasa',
  'Kwale',
  'Kilifi',
  'Tana River',
  'Lamu',
  'Taita-Taveta',
  'Garissa',
  'Wajir',
  'Mandera',
  'Marsabit',
  'Isiolo',
  'Meru',
  'Tharaka-Nithi',
  'Embu',
  'Kitui',
  'Machakos',
  'Makueni',
  'Nyandarua',
  'Nyeri',
  'Kirinyaga',
  "Murang'a",
  'Kiambu',
  'Turkana',
  'West Pokot',
  'Samburu',
  'Trans Nzoia',
  'Uasin Gishu',
  'Elgeyo-Marakwet',
  'Nandi',
  'Baringo',
  'Laikipia',
  'Nakuru',
  'Narok',
  'Kajiado',
  'Kericho',
  'Bomet',
  'Kakamega',
  'Vihiga',
  'Bungoma',
  'Busia',
  'Siaya',
  'Kisumu',
  'Homa Bay',
  'Migori',
  'Kisii',
  'Nyamira',
  'Nairobi',
] as const;

export type KenyaCounty = (typeof KENYA_COUNTIES)[number];

/** Official county code, 1-based, matching the order above. */
export function countyCode(county: KenyaCounty): number {
  return KENYA_COUNTIES.indexOf(county) + 1;
}

/**
 * Counties in our initial go-to-market. Surfaced first in the picker so the
 * madrasas we are actually onboarding do not have to scroll past 40 others.
 */
export const PRIORITY_COUNTIES: readonly KenyaCounty[] = [
  'Mandera',
  'Wajir',
  'Garissa',
  'Nairobi',
  'Kajiado',
];

/**
 * Rate limits enforced at the Edge Function boundary. Mirrored here so the
 * client can show honest "try again in N minutes" copy instead of guessing.
 */
export const RATE_LIMITS = {
  login: { limit: 5, windowSeconds: 15 * 60 },
  passwordReset: { limit: 3, windowSeconds: 60 * 60 },
  signup: { limit: 3, windowSeconds: 60 * 60 },
  parentLinkHourly: { limit: 5, windowSeconds: 60 * 60 },
  parentLinkDaily: { limit: 20, windowSeconds: 24 * 60 * 60 },
  recitationUpload: { limit: 30, windowSeconds: 60 * 60 },
  paymentInitiation: { limit: 5, windowSeconds: 10 * 60 },
  messageSend: { limit: 60, windowSeconds: 60 * 60 },
  authenticatedApi: { limit: 100, windowSeconds: 60 },
} as const;

/** Upload guards. The server re-checks all of these; the client just fails fast. */
export const UPLOAD_LIMITS = {
  audioBytes: 10 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
  audioMimeTypes: ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/aac'],
  imageMimeTypes: ['image/jpeg', 'image/png'],
  documentMimeTypes: ['application/pdf'],
} as const;

/** Minimum password strength. Enforced again server-side. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MIN_ZXCVBN_SCORE = 3;

export const TOTAL_QURAN_AYAHS = 6236;
export const TOTAL_JUZ = 30;
export const TOTAL_SURAHS = 114;
