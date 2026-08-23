import { z } from 'zod';
import { KENYA_COUNTIES } from '../constants';
import {
  emailSchema,
  fullNameSchema,
  localeSchema,
  passwordSchema,
  phoneSchema,
  plainTextSchema,
} from './common';

/**
 * Public signup has exactly two paths: register a madrasa (creates an owner)
 * or create a parent account. There is deliberately no schema, route or
 * function anywhere in this codebase that can create a platform admin —
 * `is_platform_admin` is granted out-of-band via SQL. See section 3.2.
 */

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'validation.password_required'),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** The admin console additionally requires a TOTP code. */
export const adminSignInSchema = signInSchema.extend({
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'validation.totp_invalid'),
});
export type AdminSignInInput = z.infer<typeof adminSignInSchema>;

export const registerMadrasaSchema = z
  .object({
    ownerName: fullNameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    madrasaName: z
      .string()
      .trim()
      .min(3, 'validation.madrasa_name_too_short')
      .max(120, 'validation.name_too_long'),
    county: z.enum(KENYA_COUNTIES),
    town: plainTextSchema(80),
    locale: localeSchema.default('en'),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'validation.terms_required' }),
    }),
    /** Kenya Data Protection Act 2019 — consent is captured, not assumed. */
    acceptedDataPolicy: z.literal(true, {
      errorMap: () => ({ message: 'validation.data_policy_required' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwords_do_not_match',
    path: ['confirmPassword'],
  });
export type RegisterMadrasaInput = z.infer<typeof registerMadrasaSchema>;

export const registerParentSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    locale: localeSchema.default('en'),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'validation.terms_required' }),
    }),
    acceptedDataPolicy: z.literal(true, {
      errorMap: () => ({ message: 'validation.data_policy_required' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwords_do_not_match',
    path: ['confirmPassword'],
  });
export type RegisterParentInput = z.infer<typeof registerParentSchema>;

export const requestPasswordResetSchema = z.object({ email: emailSchema });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

/** Digits in a one-time code. Six is the ceiling most users will retype. */
export const OTP_LENGTH = 6;

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'validation.otp_invalid');

export const verifyOtpSchema = z.object({ code: otpCodeSchema });
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * Password reset is a three-step exchange: request a code by email, prove you
 * received it, then set a new password using the short-lived token the
 * verification returns.
 *
 * The code is never accepted as authorisation for the password change itself
 * — only the token issued after verification is. That keeps a guessed code
 * from being replayable, and lets the server expire the two independently.
 */
export const verifyPasswordResetOtpSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});
export type VerifyPasswordResetOtpInput = z.infer<typeof verifyPasswordResetOtpSchema>;

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    resetToken: z.string().min(10),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwords_do_not_match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
