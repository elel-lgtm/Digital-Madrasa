#!/usr/bin/env node
/**
 * End-to-end check of notification delivery (migration 0025 and the
 * `dispatch-notifications` Edge Function) on the live project.
 *
 *   dispatcher refuses callers without its key
 *   → the seeded parent registers a device token through the app's RPC
 *   → a fee notice is inserted; the database's own pg_net kick runs the
 *     dispatcher, which claims it, queues and sends the email (mock provider
 *     unless RESEND_API_KEY is set) and the SMS (mock unless AT_* is set), and
 *     pushes through Expo's real push service
 *   → the token is a well-formed but unregistered one, so Expo reports
 *     DeviceNotRegistered and the dispatcher disables it
 *   → with fees email switched off in the parent's preferences, the next
 *     notice queues no email
 *   → an announcement to parents reaches the parent
 *
 * Everything created is recorded by id and removed in `finally` with the
 * service-role key, outbox rows before their notifications.
 *
 *   npm run check:notifications
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const app = loadEnv('apps/mobile/.env');
const env = loadEnv('supabase/.env');
const URL = app.EXPO_PUBLIC_SUPABASE_URL;
const ANON = app.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'Madrasa2026!';

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { db: c, userId: data.user.id };
}

async function rest(method, path, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} ${res.status} ${text.slice(0, 120)}`);
  return text ? JSON.parse(text) : null;
}

async function dispatch(key) {
  const res = await fetch(`${URL}/functions/v1/dispatch-notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key === null ? {} : { 'x-dispatch-key': key }) },
    body: '{}',
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function waitFor(fn, ms = 25_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const created = { notifications: [], announcement: null, token: null, prefsUser: null };

try {
  const parent = await signIn('parent@example.com');
  const owner = await signIn('owner@annur.example');
  const [{ madrasa_id: madrasaId }] = await rest('GET', `profiles?id=eq.${owner.userId}&select=madrasa_id`);
  const [prefsBefore] = await rest('GET', `notification_preferences?user_id=eq.${parent.userId}&select=user_id`);
  if (prefsBefore) throw new Error('the parent already has saved preferences; this check would overwrite them');

  console.log('\ndispatcher');
  let r = await dispatch(null);
  check('no key: refused', r.status === 403, `${r.status}`);
  r = await dispatch('wrong');
  check('wrong key: refused', r.status === 403, `${r.status}`);
  r = await dispatch(env.DISPATCH_SECRET);
  check('right key: runs', r.status === 200 && typeof r.body.notifications === 'number', JSON.stringify(r.body));

  console.log('\ndevice registration');
  const token = `ExponentPushToken[check-${Date.now().toString(36)}-notreal]`;
  created.token = token;
  const { error: regError } = await parent.db.rpc('register_push_token', { p_token: token, p_platform: 'android' });
  const { data: mine } = await parent.db.from('push_tokens').select('token, disabled_at');
  check('parent registers the device', !regError && mine?.some((t) => t.token === token), regError?.message);
  const { data: theirs } = await owner.db.from('push_tokens').select('token').eq('token', token);
  check('another account cannot see it', (theirs ?? []).length === 0);

  console.log('\ndelivery (kicked by the database, not by this script)');
  const [notice] = await rest('POST', 'notifications', {
    user_id: parent.userId,
    madrasa_id: madrasaId,
    type: 'fee_due',
    title: 'Check: fee reminder',
    body: 'Delivery check — please ignore.',
    payload: { check: 'notifications' },
    channel: ['in_app', 'push', 'email', 'sms'],
  });
  created.notifications.push(notice.id);

  const dispatched = await waitFor(async () => {
    const [row] = await rest('GET', `notifications?id=eq.${notice.id}&select=sent_at`);
    return row.sent_at ? row : null;
  });
  check('pg_net kick ran the dispatcher', Boolean(dispatched), dispatched?.sent_at ?? 'not dispatched in 25 s');

  const mail = await waitFor(async () => {
    const [row] = await rest('GET', `mail_outbox?notification_id=eq.${notice.id}&select=status,provider_id,to_email,attempts`);
    return row?.status === 'sent' ? row : null;
  });
  check('email queued and sent', Boolean(mail), mail ? `${mail.provider_id.startsWith('mock:') ? 'mock provider' : 'real provider'}, attempt ${mail.attempts}` : 'not sent');

  const sms = await waitFor(async () => {
    const [row] = await rest('GET', `sms_outbox?notification_id=eq.${notice.id}&select=status,provider_id,to_phone`);
    return row?.status === 'sent' ? row : null;
  });
  check('SMS queued and sent', Boolean(sms), sms ? (sms.provider_id.startsWith('mock:') ? 'mock provider' : 'real provider') : 'not sent');

  const disabled = await waitFor(async () => {
    const [row] = await rest('GET', `push_tokens?token=eq.${encodeURIComponent(token)}&select=disabled_at,disabled_reason`);
    return row?.disabled_at ? row : null;
  });
  check('Expo push attempted; unregistered token disabled', Boolean(disabled), disabled?.disabled_reason ?? 'still enabled');

  console.log('\npreferences');
  created.prefsUser = parent.userId;
  const { error: prefError } = await parent.db.from('notification_preferences').upsert({
    user_id: parent.userId,
    preferences: { fees: { push: true, email: false, sms: false } },
  });
  check('parent turns fee email and SMS off', !prefError, prefError?.message);
  const [quiet] = await rest('POST', 'notifications', {
    user_id: parent.userId,
    madrasa_id: madrasaId,
    type: 'fee_due',
    title: 'Check: quiet fee reminder',
    body: 'Delivery check — please ignore.',
    payload: { check: 'notifications' },
    channel: ['in_app', 'push', 'email', 'sms'],
  });
  created.notifications.push(quiet.id);
  await waitFor(async () => {
    const [row] = await rest('GET', `notifications?id=eq.${quiet.id}&select=sent_at`);
    return row.sent_at ? row : null;
  });
  const quietMail = await rest('GET', `mail_outbox?notification_id=eq.${quiet.id}&select=id`);
  const quietSms = await rest('GET', `sms_outbox?notification_id=eq.${quiet.id}&select=id`);
  check('no email or SMS once switched off', quietMail.length === 0 && quietSms.length === 0,
    `${quietMail.length} email, ${quietSms.length} sms`);

  console.log('\nannouncements');
  const { data: ann, error: annError } = await owner.db
    .from('announcements')
    .insert({ madrasa_id: madrasaId, author_id: owner.userId, title: 'Check: announcement', body: 'Delivery check — please ignore.', audience: ['parents'] })
    .select('id')
    .single();
  created.announcement = ann?.id ?? null;
  const got = ann
    ? await rest('GET', `notifications?payload->>announcement_id=eq.${ann.id}&select=id,user_id`)
    : [];
  created.notifications.push(...got.map((n) => n.id));
  check('announcement reaches the approved parent', !annError && got.some((n) => n.user_id === parent.userId),
    annError?.message ?? `${got.length} recipient(s)`);
  check('and not its author', !got.some((n) => n.user_id === owner.userId));
} catch (error) {
  failures += 1;
  console.error('\n  ✗ run aborted:', error instanceof Error ? error.message : error);
} finally {
  console.log('\ncleanup');
  try {
    for (const id of created.notifications) {
      await rest('DELETE', `mail_outbox?notification_id=eq.${id}`);
      await rest('DELETE', `sms_outbox?notification_id=eq.${id}`);
      await rest('DELETE', `notifications?id=eq.${id}`);
    }
    if (created.announcement) await rest('DELETE', `announcements?id=eq.${created.announcement}`);
    if (created.token) await rest('DELETE', `push_tokens?token=eq.${encodeURIComponent(created.token)}`);
    if (created.prefsUser) await rest('DELETE', `notification_preferences?user_id=eq.${created.prefsUser}`);
    console.log(`  removed ${created.notifications.length} notification(s) with their outbox rows, 1 announcement, 1 token`);
  } catch (error) {
    failures += 1;
    console.error('  ✗ cleanup failed:', error instanceof Error ? error.message : error);
  }
}

console.log(failures === 0 ? '\nAll notification checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
