import { z } from 'zod';
import { DEFAULT_CURRENCY } from '../constants';
import { isoDateSchema, moneySchema, phoneSchema, plainTextSchema, uuidSchema } from './common';

export const createFeeStructureSchema = z
  .object({
    name: plainTextSchema(80).pipe(z.string().min(2, 'validation.name_too_short')),
    academicYear: z.number().int().min(2000).max(2100),
    term: z.string().trim().min(1).max(20),
    amount: moneySchema.refine((v) => v > 0, 'validation.amount_invalid'),
    currency: z.string().length(3).default(DEFAULT_CURRENCY),
    appliesTo: z.enum(['all', 'class', 'student']),
    classId: uuidSchema.nullish(),
    studentId: uuidSchema.nullish(),
  })
  .refine((f) => f.appliesTo !== 'class' || !!f.classId, {
    message: 'validation.class_required',
    path: ['classId'],
  })
  .refine((f) => f.appliesTo !== 'student' || !!f.studentId, {
    message: 'validation.student_required',
    path: ['studentId'],
  });
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

/**
 * Who a billing run charges.
 *
 * Stated rather than inferred. The scope used to be left out entirely and the
 * server read an absent target as "every student in the madrasa", so the only
 * thing the screen could do was bill everyone. Requiring the scope here means
 * a request that forgets it fails on the device instead of quietly becoming
 * the broadest possible run.
 */
export const billingScopeSchema = z.enum(['student', 'class', 'madrasa']);
export type BillingScope = z.infer<typeof billingScopeSchema>;

export const issueInvoicesSchema = z
  .object({
    feeStructureId: uuidSchema,
    dueDate: isoDateSchema,
    scope: billingScopeSchema,
    studentId: uuidSchema.optional(),
    classId: uuidSchema.optional(),
    notes: plainTextSchema(300).optional(),
  })
  .refine((v) => v.scope !== 'student' || !!v.studentId, {
    message: 'validation.student_required',
    path: ['studentId'],
  })
  .refine((v) => v.scope !== 'class' || !!v.classId, {
    message: 'validation.class_required',
    path: ['classId'],
  });
export type IssueInvoicesInput = z.infer<typeof issueInvoicesSchema>;

/**
 * Payment initiation carries NO amount. The server derives what is owed from
 * the invoice, so a tampered client cannot change what is charged.
 */
export const initiatePaymentSchema = z.object({
  invoiceIds: z.array(uuidSchema).min(1, 'validation.invoice_required').max(10),
  phone: phoneSchema,
});
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export const recordManualPaymentSchema = z.object({
  invoiceId: uuidSchema,
  amount: moneySchema.refine((v) => v > 0, 'validation.amount_invalid'),
  method: z.enum(['cash', 'bank']),
  reference: plainTextSchema(60).optional(),
});
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;
