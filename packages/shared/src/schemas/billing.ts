import { z } from 'zod';
import {
  PAYMENT_CHANNELS,
  cardCvvLength,
  detectCardBrand,
  isCardExpired,
  isValidCardNumber,
} from '../billing';
import { phoneSchema, uuidSchema } from './common';

/**
 * Card details are validated here and then exchanged for a provider token.
 *
 * The raw number never reaches our database, our logs or our servers in
 * production — the gateway SDK tokenises it on the device. These schemas
 * exist to catch typos before that exchange, not to authorise a charge.
 */
export const cardNumberSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s|-/g, ''))
  .refine(isValidCardNumber, 'validation.card_number_invalid');

export const cardExpirySchema = z
  .string()
  .trim()
  .regex(/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/, 'validation.card_expiry_invalid')
  .refine((value) => {
    const [month, year] = value.split('/').map((p) => Number(p.trim()));
    return !isCardExpired(month!, year!);
  }, 'validation.card_expired');

export const cardHolderSchema = z
  .string()
  .trim()
  .min(2, 'validation.name_too_short')
  .max(80, 'validation.name_too_long');

export const cardDetailsSchema = z
  .object({
    number: cardNumberSchema,
    expiry: cardExpirySchema,
    cvv: z.string().trim().regex(/^\d{3,4}$/, 'validation.card_cvv_invalid'),
    holderName: cardHolderSchema,
    /** Stores the tokenised card for future charges. Opt-in, never default. */
    saveCard: z.boolean().default(false),
  })
  .refine((data) => data.cvv.length === cardCvvLength(detectCardBrand(data.number)), {
    message: 'validation.card_cvv_invalid',
    path: ['cvv'],
  });
export type CardDetailsInput = z.infer<typeof cardDetailsSchema>;

export const paymentChannelSchema = z.enum(PAYMENT_CHANNELS);

/**
 * Starting a madrasa subscription payment.
 *
 * The client never sends an amount. The price comes from the plan on the
 * server, so a tampered request cannot buy a month for one shilling.
 */
export const startSubscriptionPaymentSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('mpesa'),
    phone: phoneSchema,
  }),
  z.object({
    channel: z.literal('card'),
    card: cardDetailsSchema.optional(),
    /** Reuse of an already-tokenised card instead of re-entering details. */
    savedCardId: uuidSchema.optional(),
  }),
]);
export type StartSubscriptionPaymentInput = z.infer<typeof startSubscriptionPaymentSchema>;

/**
 * A parent paying school fees. Same rule on amounts: the client sends invoice
 * ids, and the server derives what is owed.
 */
export const payFeesSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('mpesa'),
    invoiceIds: z.array(uuidSchema).min(1, 'validation.no_invoices_selected'),
    phone: phoneSchema,
  }),
  z.object({
    channel: z.literal('card'),
    invoiceIds: z.array(uuidSchema).min(1, 'validation.no_invoices_selected'),
    card: cardDetailsSchema.optional(),
    savedCardId: uuidSchema.optional(),
  }),
]);
export type PayFeesInput = z.infer<typeof payFeesSchema>;

export const cancelSubscriptionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
