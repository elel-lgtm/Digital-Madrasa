import { z } from 'zod';
import { KE_PHONE_REGEX, PASSWORD_MIN_LENGTH, SUPPORTED_LOCALES } from '../constants';

/**
 * Primitive schemas reused across every entity. Client-side these drive form
 * validation (UX); Edge Functions re-run the exact same schema (security).
 */

export const uuidSchema = z.string().uuid();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'validation.email_invalid')
  .max(254, 'validation.email_invalid')
  .email('validation.email_invalid');

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(KE_PHONE_REGEX, 'validation.phone_invalid'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'validation.password_too_short')
  .max(128, 'validation.password_too_long')
  .refine((value) => /[a-z]/.test(value), 'validation.password_needs_lowercase')
  .refine((value) => /[A-Z]/.test(value), 'validation.password_needs_uppercase')
  .refine((value) => /\d/.test(value), 'validation.password_needs_number');

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'validation.name_too_short')
  .max(120, 'validation.name_too_long');

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.date_invalid');

export const moneySchema = z
  .number()
  .finite()
  .nonnegative('validation.amount_invalid')
  .max(10_000_000, 'validation.amount_too_large');

/** Free text that will be rendered. HTML is stripped, never escaped-and-shown. */
export const plainTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.text_too_long')
    .transform((value) => value.replace(/<[^>]*>/g, ''));

/** Cursor pagination — we never use OFFSET on list endpoints. */
export const paginationSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
