import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { CardOutcome } from './card.ts';

/**
 * Settles a finished card checkout through the same database functions as
 * M-Pesa (`settle_fee_payment` / `settle_subscription_payment`, service role
 * only). They lock the payment, refuse an amount other than the one charged
 * for, ignore a repeat, and issue the receipt and the notice.
 *
 * A checkout still in progress settles nothing. Returns the payment's status
 * after settlement, or null when there was nothing to settle yet.
 */
export async function settleCardOutcome(
  admin: SupabaseClient,
  kind: 'fees' | 'subscription',
  reference: string,
  outcome: CardOutcome,
): Promise<string | null> {
  if (outcome.status === 'pending') return null;

  const { data, error } = await admin.rpc(
    kind === 'fees' ? 'settle_fee_payment' : 'settle_subscription_payment',
    {
      p_checkout_request_id: reference,
      p_success: outcome.status === 'success',
      p_provider_ref: outcome.providerRef ? `PSK-${outcome.providerRef}` : null,
      p_amount: outcome.amount,
      p_raw: outcome.raw,
      p_failure_reason: outcome.failureReason,
    },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const settled = String(row?.status ?? '');

  // Only the brand and last four digits are kept, for the receipt.
  if (settled === 'success' && outcome.last4) {
    await admin
      .from(kind === 'fees' ? 'payments' : 'subscription_payments')
      .update({ card_last4: outcome.last4, card_brand: outcome.brand })
      .eq('checkout_request_id', reference);
  }
  return settled;
}
