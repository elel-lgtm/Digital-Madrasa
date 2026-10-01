import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { PublicError } from './http.ts';

/**
 * Rate limiting backed by the `rate_limits` table.
 *
 * Counting in Postgres rather than in memory is deliberate: Edge Functions are
 * horizontally scaled and stateless, so an in-process counter would reset on
 * every cold start and reallocate per instance — which is the same as having
 * no limit at all under load.
 *
 * Limits mirror the table in section 10.4.
 */

export const LIMITS = {
  linkChildHourly: { limit: 5, windowSeconds: 3600 },
  linkChildDaily: { limit: 20, windowSeconds: 86_400 },
  createStudent: { limit: 60, windowSeconds: 3600 },
  inviteTeacher: { limit: 20, windowSeconds: 3600 },
  issueInvoices: { limit: 10, windowSeconds: 3600 },
  recitationUpload: { limit: 30, windowSeconds: 3600 },
  qrScan: { limit: 30, windowSeconds: 3600 },
  // Each attempt puts a prompt on somebody's phone.
  payment: { limit: 5, windowSeconds: 600 },
  // Each question is a call to a metered model.
  aiChat: { limit: 10, windowSeconds: 60 },
  generic: { limit: 100, windowSeconds: 60 },
} as const;

/**
 * Consumes one unit against `key`. Throws 429 when the window is exhausted.
 *
 * Uses the admin client on purpose: rate_limits has no RLS policies, because
 * a caller must not be able to read or reset their own counter.
 */
export async function rateLimit(
  admin: SupabaseClient,
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);

  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_key: key,
    p_window_start: windowStart.toISOString(),
    p_limit: limit,
  });

  if (error) {
    // A failure counting must not become a free pass, but it also should not
    // take the feature down. Log and allow, so a broken counter degrades to
    // "unlimited" rather than "unusable" — and shows up in logs.
    console.error('[rate-limit]', key, error.message);
    return;
  }

  if (data === false) {
    throw new PublicError(429, 'rate_limited', 'Too many attempts. Please wait and try again.');
  }
}
