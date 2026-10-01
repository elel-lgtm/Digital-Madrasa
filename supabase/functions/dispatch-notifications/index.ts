import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { adminClient } from '../_shared/auth.ts';
import { json } from '../_shared/http.ts';
import { channelsFor, toE164, type Prefs } from './rules.ts';

/**
 * Delivers notifications by push, email and SMS.
 *
 * Nobody signed in calls this. It is invoked by the database — a pg_net
 * request after each batch of notifications, and a pg_cron sweep every five
 * minutes (migration 0025) — and authenticates that caller with a shared key
 * in `x-dispatch-key` (DISPATCH_SECRET, also held in Vault). JWT verification
 * is therefore off for this function (config.toml).
 *
 * One run:
 *   1. claims undelivered notifications (never the same row twice)
 *   2. decides channels: what the notification asks for, narrowed by the
 *      recipient's preferences; in-app needs no delivery
 *   3. push → Expo's push service, straight away; a token Expo says is dead
 *      is disabled
 *   4. email / SMS → a row in mail_outbox / sms_outbox, then every due row is
 *      sent, with retries and backoff handled by the outbox
 *
 * Providers:
 *   push   Expo push service. No credentials needed.
 *   email  Resend when RESEND_API_KEY and MAIL_FROM are set; otherwise mock.
 *   sms    Africa's Talking when AT_USERNAME and AT_API_KEY are set ('sandbox'
 *          as the username uses their sandbox); otherwise mock.
 * A mock send is recorded exactly like a real one, with a `mock:` provider id,
 * so the whole pipeline can be exercised before any provider is paid for.
 */

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const FOOTER = '\n\n— Digital Madrasa\nYou can choose which messages you receive in the app, under Settings → Notifications.';

// ---------------------------------------------------------------- providers

async function sendPush(admin: SupabaseClient, messages: { token: string; title: string; body: string; data: Row }[]) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        batch.map((m) => ({ to: m.token, title: m.title, body: m.body, data: m.data, sound: 'default', channelId: 'default' })),
      ),
    });
    const body = await res.json().catch(() => ({}));
    const tickets: Row[] = Array.isArray(body?.data) ? body.data : [];
    if (!res.ok || tickets.length !== batch.length) {
      // The whole batch was refused (e.g. malformed token in it). Expo says
      // which tokens in `details`; otherwise count it all as failed.
      console.error('[dispatch] push batch refused', res.status, body?.errors?.[0]?.code ?? '');
      const bad: string[] = Object.values(body?.errors?.[0]?.details ?? {}).flat() as string[];
      for (const token of bad) await disableToken(admin, token, 'invalid');
      failed += batch.length;
      continue;
    }
    for (let k = 0; k < tickets.length; k++) {
      const ticket = tickets[k];
      if (ticket.status === 'ok') {
        sent += 1;
      } else {
        failed += 1;
        const reason = ticket.details?.error ?? 'error';
        if (reason === 'DeviceNotRegistered') await disableToken(admin, batch[k].token, reason);
        else console.error('[dispatch] push ticket', reason);
      }
    }
  }
  return { sent, failed };
}

async function disableToken(admin: SupabaseClient, token: string, reason: string) {
  await admin
    .from('push_tokens')
    .update({ disabled_at: new Date().toISOString(), disabled_reason: reason })
    .eq('token', token);
}

async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MAIL_FROM');
  if (!key || !from) return `mock:${crypto.randomUUID()}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) throw new Error(`resend ${res.status} ${body?.name ?? ''}`.trim());
  return String(body.id);
}

async function sendSms(to: string, message: string): Promise<string> {
  const username = Deno.env.get('AT_USERNAME');
  const apiKey = Deno.env.get('AT_API_KEY');
  if (!username || !apiKey) return `mock:${crypto.randomUUID()}`;
  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const res = await fetch(`https://${host}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, to, message }),
  });
  const body = await res.json().catch(() => ({}));
  const recipient = body?.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !recipient || !['Success', 'Sent'].includes(recipient.status)) {
    throw new Error(`africastalking ${res.status} ${recipient?.status ?? ''}`.trim());
  }
  return String(recipient.messageId);
}

// ------------------------------------------------------------------- outbox

async function drainMail(admin: SupabaseClient) {
  const { data: rows, error } = await admin.rpc('claim_mail', { p_limit: 50 });
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as Row[]) {
    try {
      const id = await sendEmail(row.to_email, row.payload?.subject ?? 'Digital Madrasa', row.payload?.text ?? '');
      await admin.from('mail_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: id, error: null })
        .eq('id', row.id);
      sent += 1;
    } catch (e) {
      await admin.from('mail_outbox')
        .update({ status: row.attempts >= 5 ? 'failed' : 'queued', error: e instanceof Error ? e.message.slice(0, 300) : 'error' })
        .eq('id', row.id);
      failed += 1;
    }
  }
  return { sent, failed };
}

async function drainSms(admin: SupabaseClient) {
  const { data: rows, error } = await admin.rpc('claim_sms', { p_limit: 50 });
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as Row[]) {
    try {
      const id = await sendSms(row.to_phone, row.body);
      await admin.from('sms_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: id, error: null })
        .eq('id', row.id);
      sent += 1;
    } catch (e) {
      await admin.from('sms_outbox')
        .update({ status: row.attempts >= 5 ? 'failed' : 'queued', error: e instanceof Error ? e.message.slice(0, 300) : 'error' })
        .eq('id', row.id);
      failed += 1;
    }
  }
  return { sent, failed };
}

// --------------------------------------------------------------------- run

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST required.' }, 405);
  const expected = Deno.env.get('DISPATCH_SECRET') ?? '';
  if (!expected || !sameSecret(req.headers.get('x-dispatch-key') ?? '', expected)) {
    return json({ error: 'Forbidden.' }, 403);
  }

  const admin = adminClient();
  try {
    const { data: claimed, error } = await admin.rpc('claim_notifications', { p_limit: 100 });
    if (error) throw error;
    const notifications = (claimed ?? []) as Row[];

    const userIds = [...new Set(notifications.map((n) => n.user_id))];
    const [profiles, prefs, tokens] = userIds.length
      ? await Promise.all([
          admin.from('profiles').select('id, email, phone, is_active').in('id', userIds),
          admin.from('notification_preferences').select('user_id, preferences').in('user_id', userIds),
          admin.from('push_tokens').select('user_id, token').in('user_id', userIds).is('disabled_at', null),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const profileOf = new Map((profiles.data ?? []).map((p: Row) => [p.id, p]));
    const prefsOf = new Map((prefs.data ?? []).map((p: Row) => [p.user_id, p.preferences as Prefs]));
    const tokensOf = new Map<string, string[]>();
    for (const t of (tokens.data ?? []) as Row[]) tokensOf.set(t.user_id, [...(tokensOf.get(t.user_id) ?? []), t.token]);

    const pushes: { token: string; title: string; body: string; data: Row }[] = [];
    const mail: Row[] = [];
    const sms: Row[] = [];

    for (const n of notifications) {
      const profile = profileOf.get(n.user_id);
      if (!profile || profile.is_active === false) continue;
      for (const channel of channelsFor(n, prefsOf.get(n.user_id) ?? null)) {
        if (channel === 'push') {
          for (const token of tokensOf.get(n.user_id) ?? []) {
            pushes.push({
              token,
              title: n.title,
              body: String(n.body).slice(0, 180),
              data: { notificationId: n.id, type: n.type, ...(n.payload ?? {}) },
            });
          }
        } else if (channel === 'email' && profile.email) {
          mail.push({
            madrasa_id: n.madrasa_id,
            notification_id: n.id,
            to_email: profile.email,
            template: n.type,
            payload: { subject: n.title, text: `${n.body}${FOOTER}` },
          });
        } else if (channel === 'sms') {
          const to = toE164(profile.phone);
          if (to) {
            sms.push({
              madrasa_id: n.madrasa_id,
              notification_id: n.id,
              to_phone: to,
              body: `${n.title}: ${n.body}`.slice(0, 300),
            });
          }
        }
      }
    }

    // Queued before anything is sent, so a crash part-way loses no email/SMS:
    // the sweep sends whatever is still queued.
    if (mail.length) {
      const { error: e } = await admin.from('mail_outbox').upsert(mail, { onConflict: 'notification_id', ignoreDuplicates: true });
      if (e) console.error('[dispatch] mail queue', e.message);
    }
    if (sms.length) {
      const { error: e } = await admin.from('sms_outbox').upsert(sms, { onConflict: 'notification_id', ignoreDuplicates: true });
      if (e) console.error('[dispatch] sms queue', e.message);
    }

    const push = pushes.length ? await sendPush(admin, pushes) : { sent: 0, failed: 0 };
    const email = await drainMail(admin);
    const text = await drainSms(admin);

    return json({ notifications: notifications.length, push, email, sms: text });
  } catch (error) {
    console.error('[dispatch]', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Dispatch failed.' }, 500);
  }
});
