import { z } from 'zod';
import {
  ASSIGNMENT_TYPES,
  ATTENDANCE_STATUSES,
  HIFZ_STATUSES,
  QIRAAH_STYLES,
  TAJWEED_RULES,
  TAJWEED_SEVERITIES,
  TOTAL_SURAHS,
} from '../constants';
import { isMeetingUrl } from '../meetings';
import { isoDateSchema, plainTextSchema, uuidSchema } from './common';

const surahNoSchema = z.number().int().min(1).max(TOTAL_SURAHS);
const ayahNoSchema = z.number().int().min(1).max(286);

/** Ayah ranges are ordered — enforced here and again by a Postgres CHECK. */
export const ayahRangeSchema = z
  .object({
    surahFrom: surahNoSchema,
    ayahFrom: ayahNoSchema,
    surahTo: surahNoSchema,
    ayahTo: ayahNoSchema,
  })
  .refine(
    (r) =>
      r.surahTo > r.surahFrom || (r.surahTo === r.surahFrom && r.ayahTo >= r.ayahFrom),
    { message: 'validation.ayah_range_invalid', path: ['ayahTo'] },
  );
export type AyahRange = z.infer<typeof ayahRangeSchema>;

/**
 * A live session link. Only Meet, Teams, Zoom and Jitsi hosts are accepted —
 * this field is rendered as a tappable button in front of children, so an
 * arbitrary URL here would be a phishing surface.
 */
export const meetingUrlSchema = z
  .string()
  .trim()
  .max(500, 'validation.text_too_long')
  .refine(isMeetingUrl, 'validation.meeting_url_invalid');

export const createLessonSchema = z
  .object({
    classId: uuidSchema,
    title: plainTextSchema(120).pipe(z.string().min(3, 'validation.title_too_short')),
    qiraahStyle: z.enum(QIRAAH_STYLES).default('hafs'),
    scheduledFor: z.string().datetime().nullish(),
    notes: plainTextSchema(1000).optional(),
    meetingUrl: meetingUrlSchema.nullish(),
  })
  .and(ayahRangeSchema);
export type CreateLessonInput = z.infer<typeof createLessonSchema>;

/** Attaching or clearing the live link on an existing lesson. */
export const setLessonMeetingSchema = z.object({
  lessonId: uuidSchema,
  // Null clears the link and hides the Join button.
  meetingUrl: meetingUrlSchema.nullable(),
});
export type SetLessonMeetingInput = z.infer<typeof setLessonMeetingSchema>;

export const createAssignmentSchema = z.object({
  classId: uuidSchema,
  lessonId: uuidSchema.nullish(),
  title: plainTextSchema(120).pipe(z.string().min(3, 'validation.title_too_short')),
  instructions: plainTextSchema(2000),
  assignmentType: z.enum(ASSIGNMENT_TYPES),
  dueAt: z.string().datetime(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const markAttendanceSchema = z.object({
  classId: uuidSchema,
  sessionDate: isoDateSchema,
  entries: z
    .array(
      z.object({
        studentId: uuidSchema,
        status: z.enum(ATTENDANCE_STATUSES),
        note: plainTextSchema(200).optional(),
      }),
    )
    .min(1, 'validation.attendance_empty'),
  method: z.enum(['manual', 'qr']).default('manual'),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export const recordGradeSchema = z
  .object({
    studentId: uuidSchema,
    classId: uuidSchema,
    term: z.string().trim().min(1).max(20),
    subject: plainTextSchema(60),
    score: z.number().min(0),
    maxScore: z.number().positive(),
    remarks: plainTextSchema(500).optional(),
  })
  .refine((g) => g.score <= g.maxScore, {
    message: 'validation.score_exceeds_max',
    path: ['score'],
  });
export type RecordGradeInput = z.infer<typeof recordGradeSchema>;

export const updateHifzProgressSchema = z.object({
  studentId: uuidSchema,
  surahNo: surahNoSchema,
  ayahNo: ayahNoSchema,
  status: z.enum(HIFZ_STATUSES),
  confidenceScore: z.number().min(0).max(1).optional(),
});
export type UpdateHifzProgressInput = z.infer<typeof updateHifzProgressSchema>;

/** A student's written answer. Resubmitting replaces it until it is marked. */
export const submitAssignmentSchema = z.object({
  assignmentId: uuidSchema,
  textBody: plainTextSchema(4000).pipe(z.string().min(1, 'validation.body_required')),
});
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;

/** Marking is out of 100; "returned" sends it back for another attempt. */
export const gradeSubmissionSchema = z.object({
  submissionId: uuidSchema,
  score: z.number().min(0).max(100),
  status: z.enum(['graded', 'returned']),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;

export const CERTIFICATE_KINDS = ['juz_completion', 'quran_completion', 'tajweed_level'] as const;

/** The code is never sent: the database issues it. */
export const issueCertificateSchema = z.object({
  studentId: uuidSchema,
  kind: z.enum(CERTIFICATE_KINDS),
  title: plainTextSchema(120).pipe(z.string().min(3, 'validation.title_too_short')),
});
export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;

export const createRecitationSchema = z
  .object({
    qiraahStyle: z.enum(QIRAAH_STYLES),
    durationMs: z.number().int().positive().max(15 * 60 * 1000),
    localUri: z.string().min(1),
    assignmentId: uuidSchema.nullish(),
  })
  .and(ayahRangeSchema);
export type CreateRecitationInput = z.infer<typeof createRecitationSchema>;

/**
 * A single tajweed finding. `note` is a plain-language correction tip, never a
 * religious ruling — the teacher's assessment remains final.
 */
export const tajweedErrorSchema = z.object({
  surahNo: surahNoSchema,
  ayahNo: ayahNoSchema,
  wordIndex: z.number().int().min(0),
  rule: z.enum(TAJWEED_RULES),
  severity: z.enum(TAJWEED_SEVERITIES),
  note: z.string().max(400),
});
export type TajweedError = z.infer<typeof tajweedErrorSchema>;

export const tajweedFeedbackSchema = z.object({
  recitationId: uuidSchema,
  overallScore: z.number().min(0).max(100),
  errors: z.array(tajweedErrorSchema),
  modelVersion: z.string().min(1),
  processingMs: z.number().int().nonnegative(),
});
export type TajweedFeedback = z.infer<typeof tajweedFeedbackSchema>;

/** A teacher can always override the AI. The override is what is reported. */
export const teacherOverrideSchema = z.object({
  recitationId: uuidSchema,
  overallScore: z.number().min(0).max(100),
  remarks: plainTextSchema(1000),
  dismissedErrorIndexes: z.array(z.number().int().nonnegative()).default([]),
});
export type TeacherOverrideInput = z.infer<typeof teacherOverrideSchema>;
