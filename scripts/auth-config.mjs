#!/usr/bin/env node
/**
 * Applies the project's Supabase Auth configuration.
 *
 *   node scripts/auth-config.mjs          # show the diff, change nothing
 *   node scripts/auth-config.mjs --apply  # write it
 *
 * Auth settings are as much a part of the security posture as the RLS
 * policies, but they live in a dashboard rather than a migration — so they
 * drift silently. Keeping them here makes them reviewable and repeatable.
 *
 * Credentials come from supabase/.env and are never printed.
 */
import { readFileSync } from 'node:fs';

const ENV_PATH = 'supabase/.env';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error(`SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set in ${ENV_PATH}`);
  process.exit(1);
}

const RECOVERY_EMAIL = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f3ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2119;">
    <div style="max-width:480px;margin:0 auto;background:#fffdf9;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 8px;font-size:20px;">Reset your password</h1>
      <p style="margin:0 0 24px;color:#6b5d50;font-size:14px;">
        Enter this code in the Digital Madrasa app to choose a new password.
      </p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;
                  padding:16px;background:#f2ece3;border-radius:8px;margin-bottom:24px;">
        {{ .Token }}
      </div>
      <p style="margin:0 0 8px;color:#6b5d50;font-size:13px;">
        The code expires in 30 minutes and can be used once.
      </p>
      <p style="margin:0;color:#6b5d50;font-size:13px;">
        If you didn't ask to reset your password, ignore this email — your
        account is unchanged. Never share this code with anyone, including
        someone claiming to be from your madrasa.
      </p>
    </div>
  </body>
</html>`;

const CONFIRM_EMAIL = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f3ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2119;">
    <div style="max-width:480px;margin:0 auto;background:#fffdf9;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 8px;font-size:20px;">Confirm your email</h1>
      <p style="margin:0 0 24px;color:#6b5d50;font-size:14px;">
        Enter this code in the app to finish creating your account.
      </p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;
                  padding:16px;background:#f2ece3;border-radius:8px;">
        {{ .Token }}
      </div>
    </div>
  </body>
</html>`;

/**
 * Every value here is deliberate; the comment says why, because a bare number
 * in a dashboard is impossible to review later.
 */
const CONFIG = {
  // --- one-time codes -------------------------------------------------
  // Six digits is what the OtpInput component renders and what
  // otpCodeSchema validates. Changing one without the other breaks reset.
  mailer_otp_length: 6,
  // 30 minutes. This value governs signup confirmation as well as recovery,
  // and 10 minutes is tight when email reaches a phone on intermittent data
  // in Mandera or Wajir. Kept in step with the copy in the email template,
  // auth.enterCodeBody in every locale, and OTP_TTL_MS in the mock.
  mailer_otp_exp: 1800,

  // --- password policy (spec 10.5) ------------------------------------
  password_min_length: 10,
  // Lowercase + uppercase + digit, mirroring the shared passwordSchema.
  password_required_characters:
    'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
  // Rejects passwords found in known breach corpora. Pro plan only — the
  // script drops it with a warning on Free rather than failing outright.
  password_hibp_enabled: true,

  // --- rate limits ----------------------------------------------------
  //
  // Sized to be generous for a real madrasa — an owner enrolling a class of
  // thirty will not notice — while still closing the door on credential
  // stuffing. They were briefly raised to 200-500 for signup testing; that is
  //
  // fine on a laptop and not on a system holding children's records, where
  // these limits ARE the brute-force protection required by section 10.4.
  //
  //
  rate_limit_anonymous_users: 30,
  rate_limit_verify: 30,
  rate_limit_token_refresh: 150,
  rate_limit_otp: 30,
  rate_limit_email_sent: 100,

  // --- sessions (spec 10.5) -------------------------------------------
  jwt_exp: 3600,
  refresh_token_rotation_enabled: true,
  security_refresh_token_reuse_interval: 10,

  // Email confirmation stays required. Turning this on would let anyone
  // register an address they do not control.
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,

  // --- templates ------------------------------------------------------
  // The default recovery template sends {{ .ConfirmationURL }} — a magic
  // link. The app's reset flow asks for a typed code, so it needs
  // {{ .Token }} instead. This is the change that makes OTP work at all.
  mailer_templates_recovery_content: RECOVERY_EMAIL,
  mailer_templates_recovery_subject: 'Your Digital Madrasa password reset code',
  mailer_templates_confirmation_content: CONFIRM_EMAIL,
  mailer_templates_confirmation_subject: 'Confirm your Digital Madrasa email',
};

// SMTP is only sent if credentials exist, so running this without them
// configured does not wipe an existing mail setup.
if (env.SMTP_GMAIL_ADDRESS && env.SMTP_GMAIL_APP_PASSWORD) {
  Object.assign(CONFIG, {
    smtp_host: 'smtp.gmail.com',
    // The API rejects a number here; it wants the port as a string.
    smtp_port: '465',
    smtp_user: env.SMTP_GMAIL_ADDRESS,
    smtp_pass: env.SMTP_GMAIL_APP_PASSWORD,
    smtp_admin_email: env.SMTP_GMAIL_ADDRESS,
    smtp_sender_name: 'Digital Madrasa',
  });
}

const base = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const current = await (await fetch(base, { headers })).json();

const SECRET_KEYS = new Set(['smtp_pass']);
let changes = 0;

console.log(`Project ${ref} — auth configuration\n`);
for (const [key, want] of Object.entries(CONFIG)) {
  const have = current[key];
  const same = JSON.stringify(have) === JSON.stringify(want);
  if (same) continue;
  changes += 1;
  const show = (v) =>
    SECRET_KEYS.has(key)
      ? '[redacted]'
      : typeof v === 'string' && v.length > 60
        ? `${v.slice(0, 57).replace(/\n/g, ' ')}…`
        : JSON.stringify(v);
  console.log(`  ${key}`);
  console.log(`    from ${show(have)}`);
  console.log(`    to   ${show(want)}`);
}

if (changes === 0) {
  console.log('  Already matches. Nothing to do.');
  process.exit(0);
}

if (!process.argv.includes('--apply')) {
  console.log(`\n${changes} change(s) pending. Re-run with --apply to write them.`);
  process.exit(0);
}

/** Settings that need a paid plan, and what it costs you to go without. */
const PAID_PLAN_ONLY = {
  password_hibp_enabled:
    'Leaked-password protection (HaveIBeenPwned) needs a Pro plan. Until then, ' +
    'a password that appears in a known breach will still be accepted. The ' +
    'length and character rules above still apply.',
};

async function patch(body) {
  const res = await fetch(base, { method: 'PATCH', headers, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, text: res.ok ? '' : await res.text() };
}

let payload = { ...CONFIG };
let result = await patch(payload);

// Retry once without whatever the plan does not cover, so a Free project
// still gets every other hardening step rather than none of them.
if (!result.ok && result.status === 402) {
  const dropped = Object.keys(PAID_PLAN_ONLY).filter((k) => k in payload);
  for (const key of dropped) delete payload[key];
  if (dropped.length > 0) {
    result = await patch(payload);
    if (result.ok) {
      console.log('\n⚠ Skipped (needs a paid plan):');
      for (const key of dropped) console.log(`  ${key} — ${PAID_PLAN_ONLY[key]}`);
    }
  }
}

if (!result.ok) {
  console.error(`\nFailed (${result.status}): ${result.text}`);
  process.exit(1);
}
console.log(`\n✓ Applied ${Object.keys(payload).length} setting(s).`);
