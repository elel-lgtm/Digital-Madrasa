/**
 * Madrasa subscriptions.
 *
 * The madrasa owner pays the platform; parents pay the madrasa. Those are two
 * separate money flows and they must never share a table, a receipt series or
 * a reconciliation job — the platform's revenue and a school's fee income
 * answer to different books and, in Kenya, to different tax treatment.
 */

export const SUBSCRIPTION_CURRENCY = 'KES';

/** Monthly price in whole shillings. */
export const SUBSCRIPTION_PRICE = 3000;

/** Days a new madrasa runs free before payment is required. */
export const TRIAL_DAYS = 30;

/**
 * Days after a missed payment before administrative features lock.
 *
 * A madrasa that is late by a day should not stop being able to mark
 * attendance. This window exists so an owner travelling, or waiting on
 * end-of-term fee collection, does not lose the school's operations.
 */
export const GRACE_DAYS = 7;

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'grace',
  'restricted',
  'cancelled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** How a madrasa or a parent pays. */
export const PAYMENT_CHANNELS = ['mpesa', 'card'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/**
 * The processor behind a channel. Kept separate from the channel because it
 * changes independently: card processing may move from one gateway to another
 * without the parent-facing choice ("Card" vs "M-Pesa") changing at all.
 *
 * A note for whoever wires this up: Stripe does not onboard Kenyan-registered
 * businesses for payouts. Card acquiring here realistically means Paystack,
 * Flutterwave or DPO. The abstraction exists so that choice stays swappable.
 */
export const PAYMENT_PROVIDERS = ['daraja', 'paystack', 'flutterwave', 'stripe', 'manual'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'unknown'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

// ============================================================ subscription

export interface SubscriptionState {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
}

/**
 * Whether the madrasa may use administrative features — enrolling students,
 * issuing invoices, collecting fees.
 *
 * Deliberately true during `grace`: locking a school out the moment a card
 * fails would punish children for an adult's billing problem.
 */
export function canUseAdminFeatures(status: SubscriptionStatus): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due' || status === 'grace';
}

/**
 * Whether learning continues. Always true.
 *
 * Students keep recitation, revision and their own history no matter what the
 * owner's billing looks like. Their work is not collateral, and no data is
 * ever deleted for non-payment.
 */
export function canUseLearningFeatures(): boolean {
  return true;
}

export function daysUntil(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Trial days remaining, or 0 once the trial has ended. */
export function trialDaysLeft(state: SubscriptionState, now: Date = new Date()): number {
  if (state.status !== 'trialing') return 0;
  return daysUntil(state.trialEndsAt, now);
}

/**
 * How loudly the app should ask for payment. Drives banner prominence so the
 * nudge escalates rather than nagging at full volume from day one.
 */
export type BillingUrgency = 'none' | 'info' | 'warning' | 'critical';

export function billingUrgency(state: SubscriptionState, now: Date = new Date()): BillingUrgency {
  switch (state.status) {
    case 'active':
      return 'none';
    case 'trialing': {
      const left = trialDaysLeft(state, now);
      if (left <= 3) return 'critical';
      if (left <= 7) return 'warning';
      return 'info';
    }
    case 'past_due':
      return 'warning';
    case 'grace':
      return 'critical';
    case 'restricted':
    case 'cancelled':
      return 'critical';
  }
}

// ================================================================== cards

/**
 * Luhn check. Catches mistyped numbers before a request is made — it says
 * nothing about whether the card exists or has funds.
 */
export function isValidCardNumber(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

export function detectCardBrand(input: string): CardBrand {
  const digits = input.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  return 'unknown';
}

/** Groups digits for display: 4-4-4-4, or 4-6-5 for Amex. */
export function formatCardNumber(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 19);
  const groups = detectCardBrand(digits) === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3];

  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  return parts.join(' ');
}

export function cardCvvLength(brand: CardBrand): number {
  return brand === 'amex' ? 4 : 3;
}

/** True when the card is expired at the start of the given month. */
export function isCardExpired(month: number, year: number, now: Date = new Date()): boolean {
  if (month < 1 || month > 12) return true;
  const fullYear = year < 100 ? 2000 + year : year;
  // A card is valid through the last day of its expiry month.
  const expiry = new Date(fullYear, month, 1);
  return expiry <= now;
}
