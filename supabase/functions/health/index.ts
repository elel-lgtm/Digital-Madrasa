import { adminClient } from '../_shared/auth.ts';
import { handler, json } from '../_shared/http.ts';

/**
 * Health check for an uptime monitor.
 *
 * Unauthenticated on purpose — an uptime service cannot hold a JWT — so it
 * must leak nothing. It reports whether the database answers and nothing
 * about what is in it: no counts, no names, no version strings that would help
 * someone fingerprint the stack.
 *
 * It also serves a second purpose. A free-tier project pauses after about a
 * week of inactivity and can come back empty; a monitor hitting this every few
 * minutes keeps the timer from ever reaching that point.
 */
Deno.serve(handler(async () => {
  const started = Date.now();

  try {
    const admin = adminClient();
    // Cheapest possible round trip that proves Postgres is answering.
    const { error } = await admin.from('subscription_plans').select('id').limit(1);
    if (error) throw error;

    return json({ status: 'ok', database: 'up', latencyMs: Date.now() - started });
  } catch {
    return json({ status: 'degraded', database: 'down' }, 503);
  }
}));
