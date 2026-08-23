import {
  SUBSCRIPTION_PRICE,
  detectCardBrand,
  type CardDetailsInput,
  type PaymentChannel,
  type PaymentProvider,
  type SavedCard,
  type SubscriptionInvoice,
  type SubscriptionPayment,
} from '@digital-madrasa/shared';
import { NS, newId } from './ids';

/**
 * Simulated card and subscription processing.
 *
 * The behaviour here mirrors what a real gateway does, including the parts
 * that are inconvenient: cards decline, 3-D Secure takes a moment, and a
 * charge is only settled by a callback we do not control. Building the UI
 * against a mock that always succeeds produces an app that breaks the first
 * time a parent's card is declined.
 */

/** Card numbers that always fail, so every branch of the UI is reachable. */
export const TEST_CARDS = {
  /** Any card ending 0002 is declined by the issuer. */
  declined: '0002',
  /** Any card ending 0003 has insufficient funds. */
  insufficientFunds: '0003',
} as const;

export type CardOutcome = 'success' | 'declined' | 'insufficient_funds';

export function cardOutcome(last4: string): CardOutcome {
  if (last4.endsWith(TEST_CARDS.declined)) return 'declined';
  if (last4.endsWith(TEST_CARDS.insufficientFunds)) return 'insufficient_funds';
  return 'success';
}

export function cardFailureReason(outcome: CardOutcome): string | null {
  switch (outcome) {
    case 'declined':
      return 'Your bank declined this card. Try another card or pay with M-Pesa.';
    case 'insufficient_funds':
      return 'There are not enough funds on this card.';
    case 'success':
      return null;
  }
}

/**
 * The card processor we would use. Recorded per payment because it can change
 * without the parent-facing choice changing — and because reconciliation has
 * to know which gateway to ask about a given charge.
 *
 * Paystack rather than Stripe: Stripe does not onboard Kenyan-registered
 * businesses for payouts, so a Kenyan madrasa could not be settled through it.
 */
export const CARD_PROVIDER: PaymentProvider = 'paystack';
export const MPESA_PROVIDER: PaymentProvider = 'daraja';

export function providerFor(channel: PaymentChannel): PaymentProvider {
  return channel === 'card' ? CARD_PROVIDER : MPESA_PROVIDER;
}

/**
 * Turns entered card details into the only fragments we are allowed to keep.
 * The number itself is discarded here and never stored, logged or returned.
 */
export function tokeniseCard(
  card: CardDetailsInput,
  madrasaId: string,
  parentId: string | null,
): SavedCard {
  const digits = card.number.replace(/\D/g, '');
  const [month, year] = card.expiry.split('/').map((p) => Number(p.trim()));

  return {
    id: newId(NS.savedCard),
    madrasaId,
    parentId,
    brand: detectCardBrand(digits),
    last4: digits.slice(-4),
    expiryMonth: month!,
    expiryYear: 2000 + year!,
    holderName: card.holderName.trim(),
    provider: CARD_PROVIDER,
    isDefault: false,
    createdAt: new Date().toISOString(),
  };
}

let invoiceSeq = 0;

export function nextSubscriptionInvoiceNo(): string {
  invoiceSeq += 1;
  return `DMS-${new Date().getFullYear()}-${String(invoiceSeq).padStart(4, '0')}`;
}

export function seedInvoiceSeq(existing: SubscriptionInvoice[]): void {
  invoiceSeq = Math.max(invoiceSeq, existing.length);
}

/** Builds the invoice for one billing period. Amount comes from the plan. */
export function buildSubscriptionInvoice(params: {
  madrasaId: string;
  subscriptionId: string;
  periodStart: Date;
  amount?: number;
}): SubscriptionInvoice {
  const periodEnd = new Date(params.periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    id: newId(NS.subInvoice),
    madrasaId: params.madrasaId,
    subscriptionId: params.subscriptionId,
    invoiceNo: nextSubscriptionInvoiceNo(),
    amountDue: params.amount ?? SUBSCRIPTION_PRICE,
    amountPaid: 0,
    currency: 'KES',
    periodStart: params.periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    dueDate: params.periodStart.toISOString().slice(0, 10),
    status: 'issued',
    issuedAt: new Date().toISOString(),
  };
}

export function buildSubscriptionPayment(params: {
  madrasaId: string;
  invoiceId: string;
  amount: number;
  channel: PaymentChannel;
  card?: { last4: string; brand: SavedCard['brand'] } | null;
}): SubscriptionPayment {
  return {
    id: newId(NS.subPayment),
    madrasaId: params.madrasaId,
    subscriptionInvoiceId: params.invoiceId,
    amount: params.amount,
    currency: 'KES',
    channel: params.channel,
    provider: providerFor(params.channel),
    providerRef: null,
    checkoutRequestId: `${params.channel === 'card' ? 'chg' : 'ws_CO'}_${Date.now()}`,
    status: params.channel === 'card' ? 'pending' : 'initiated',
    cardLast4: params.card?.last4 ?? null,
    cardBrand: params.card?.brand ?? null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    settledAt: null,
    receiptNo: null,
  };
}
