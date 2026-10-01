import { z } from 'zod';
import { plainTextSchema, uuidSchema } from './common';

export const MADRASA_LIFECYCLE_ACTIONS = ['suspend', 'schedule_deletion', 'reinstate', 'purge'] as const;
export type MadrasaLifecycleAction = (typeof MADRASA_LIFECYCLE_ACTIONS)[number];

/**
 * A platform admin changing a madrasa's status. Mirrors the checks in the
 * `madrasa-lifecycle` Edge Function, which remains the authority: every
 * action but reinstatement needs a written reason (it goes into the audit
 * log), and a purge needs the madrasa's exact name typed back.
 */
export const madrasaLifecycleSchema = z
  .object({
    madrasaId: uuidSchema,
    action: z.enum(MADRASA_LIFECYCLE_ACTIONS),
    reason: plainTextSchema(500).optional(),
    confirmName: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.action === 'reinstate' || Boolean(v.reason && v.reason.length >= 5), {
    message: 'validation.reason_required',
    path: ['reason'],
  })
  .refine((v) => v.action !== 'purge' || Boolean(v.confirmName), {
    message: 'validation.confirm_name_required',
    path: ['confirmName'],
  });
export type MadrasaLifecycleInput = z.infer<typeof madrasaLifecycleSchema>;
