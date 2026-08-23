import { z } from 'zod';
import { ADMISSION_NO_REGEX, QIRAAH_STYLES, RELATIONSHIPS } from '../constants';
import {
  fullNameSchema,
  isoDateSchema,
  phoneSchema,
  plainTextSchema,
  uuidSchema,
  emailSchema,
} from './common';

/**
 * Student creation deliberately has NO admission_no field. The number is
 * issued by a Postgres BEFORE INSERT trigger so it cannot be supplied,
 * guessed or overwritten by any client. It is shown read-only afterwards.
 */
export const createStudentSchema = z.object({
  fullName: fullNameSchema,
  dateOfBirth: isoDateSchema,
  gender: z.enum(['male', 'female']),
  classId: uuidSchema.nullish(),
  guardianNotes: plainTextSchema(500).optional(),
  guardianPhone: phoneSchema.optional(),
  admissionYear: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().extend({
  enrollmentStatus: z.enum(['active', 'graduated', 'withdrawn']).optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

/** CSV bulk import row, validated before the preview screen renders. */
export const bulkStudentRowSchema = z.object({
  fullName: fullNameSchema,
  dateOfBirth: isoDateSchema,
  gender: z.enum(['male', 'female']),
  className: z.string().trim().max(80).optional(),
  guardianPhone: phoneSchema.optional(),
});
export type BulkStudentRow = z.infer<typeof bulkStudentRowSchema>;

export const inviteTeacherSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  specialisation: plainTextSchema(120).optional(),
  qiraahStyles: z.array(z.enum(QIRAAH_STYLES)).min(1, 'validation.qiraah_required'),
});
export type InviteTeacherInput = z.infer<typeof inviteTeacherSchema>;

/**
 * The parent link request. This never hits the `students` table directly —
 * it goes through a rate-limited Edge Function so admission numbers cannot
 * be enumerated, and it always returns a generic failure message.
 */
export const linkChildSchema = z.object({
  admissionNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ADMISSION_NO_REGEX, 'validation.admission_no_invalid'),
  relationship: z.enum(RELATIONSHIPS),
  /** Optional second factor the madrasa can require. */
  childLastName: z.string().trim().max(80).optional(),
  childDateOfBirth: isoDateSchema.optional(),
});
export type LinkChildInput = z.infer<typeof linkChildSchema>;

export const decideLinkSchema = z.object({
  linkId: uuidSchema,
  decision: z.enum(['approved', 'rejected']),
  reason: plainTextSchema(300).optional(),
});
export type DecideLinkInput = z.infer<typeof decideLinkSchema>;

export const createClassSchema = z.object({
  name: plainTextSchema(80).pipe(z.string().min(2, 'validation.name_too_short')),
  level: plainTextSchema(40),
  teacherId: uuidSchema.nullish(),
  capacity: z.number().int().min(1).max(200),
  schedule: z
    .array(
      z.object({
        day: z.enum([
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ]),
        startTime: z.string().regex(/^\d{2}:\d{2}$/, 'validation.time_invalid'),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, 'validation.time_invalid'),
      }),
    )
    .default([]),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;
