import { adminClient } from '../_shared/auth.ts';
import { outcomeFromPaystack, validPaystackSignature, verifyCardCheckout } from '../_shared/card.ts';
import { settleCardOutcome } from '../_shared/card-settle.ts';
import { CORS_HEADERS } from '../_shared/http.ts';

/**
 * Paystack's side of a card payment. Called without a user token.
 *
 *   POST  the webhook. Accepted only with a valid x-paystack-signature
 *         (HMAC-SHA512 of the body with PAYSTACK_SECRET_KEY). A charge.success
 *         is settled through the same database function as M-Pesa, which
 *         refuses a wrong amount and ignores a repeat.
 *
 *   GET   where the browser lands after the card step (?reference=…). It asks
 *         Paystack for the outcome, settles it, and shows a short message;
 *         the app, polling in the background, picks the result up.
 *
 * Nothing from the request is trusted for money: the webhook must be signed,
 * and the browser return only triggers a server-side check with Paystack.
 */

const kindOf = (reference: string): 'fees' | 'subscription' | null =>
  reference.startsWith('DM-FEE-') ? 'fees' : reference.startsWith('DM-SUB-') ? 'subscription' : null;

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS } });
}

Deno.serve(async (req) => {
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY') || undefined;
  const admin = adminClient();

  try {
    if (req.method === 'POST') {
      const raw = await req.text();
      if (!secretKey || !(await validPaystackSignature(raw, req.headers.get('x-paystack-signature'), secretKey))) {
        return text('Invalid signature.', 401);
      }
      const event = JSON.parse(raw) as { event?: string; data?: Record<string, unknown> };
      const reference = String(event.data?.reference ?? '');
      const kind = kindOf(reference);
      // Not ours, or an event we do not act on: acknowledged so Paystack
      // stops retrying, and nothing changes.
      if (!kind || !event.data || !['charge.success', 'charge.failed'].includes(event.event ?? '')) {
        return text('Ignored.');
      }
      await settleCardOutcome(admin, kind, reference, outcomeFromPaystack(event.data));
      return text('OK');
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref') ?? '';
      const kind = kindOf(reference);
      if (kind) {
        const table = kind === 'fees' ? 'payments' : 'subscription_payments';
        const { data: row } = await admin
          .from(table)
          .select('status, amount, created_at')
          .eq('checkout_request_id', reference)
          .maybeSingle();
        if (row && (row.status === 'pending' || row.status === 'initiated')) {
          const outcome = await verifyCardCheckout({
            secretKey,
            reference,
            createdAt: row.created_at,
            amount: Number(row.amount),
          });
          await settleCardOutcome(admin, kind, reference, outcome);
        }
      }
      return text('Thank you. Your card payment has been submitted.\n\nYou can close this page and return to Digital Madrasa.');
    }

    return text('Method not allowed.', 405);
  } catch (error) {
    // Logged without the body: it can carry the payer's e-mail.
    console.error('[card-callback]', error instanceof Error ? error.message : 'error');
    return text('Something went wrong. Your payment, if made, will still be recorded.', 500);
  }
});
