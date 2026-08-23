#!/usr/bin/env node
/**
 * Fails the build if a server-side secret appears anywhere that gets bundled
 * into the app.
 *
 * A published bundle cannot be recalled: once a service_role key ships inside
 * an APK, the only remedy is rotation. This check is cheap and runs before
 * every build so that never becomes a question of discipline.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

/**
 * Directories whose contents can end up in the client bundle, plus the AI
 * gateway — which must never hold a privileged key, since it reads the
 * database as the calling user so RLS stays in force.
 */
const SCAN_DIRS = [
  'apps/mobile/app',
  'apps/mobile/src',
  'packages/shared/src',
  'services/ai-gateway/src',
];

/** Env files are scanned too — EXPO_PUBLIC_* values are inlined at build. */
const SCAN_FILES = [
  'apps/mobile/.env',
  'apps/mobile/.env.example',
  'services/ai-gateway/.env',
  'services/ai-gateway/.env.example',
];

const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build', 'coverage']);
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.env', '']);

/**
 * A JWT is only a finding if its payload actually claims a privileged role.
 * The anon key is a JWT too, and it belongs in the client env — flagging it
 * would train everyone to ignore this script.
 */
function isPrivilegedJwt(line) {
  const match = line.match(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})/);
  if (!match) return false;
  try {
    const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

const PATTERNS = [
  { name: 'Supabase service_role reference', re: /service_role/i },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]+/ },
  // A personal access token controls the whole Supabase ACCOUNT, not one
  // project — strictly worse than a leaked service_role key.
  { name: 'Supabase personal access token', re: /\bsbp_[A-Za-z0-9]{16,}/ },
  { name: 'JWT with service_role claim', test: isPrivilegedJwt },
  // Env files only: in TypeScript, `const submitPassword = …` is a variable,
  // not a credential, and flagging it would bury the real findings.
  {
    name: 'Password assignment',
    re: /[A-Z_]*PASS(WORD|WD)?\s*=\s*["']?\S/i,
    envOnly: true,
  },
  { name: 'Database connection string', re: /postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@/ },
  { name: 'M-Pesa consumer secret', re: /MPESA_(CONSUMER_SECRET|PASSKEY)\s*=\s*\S/, envOnly: true },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{16,}/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9-]{16,}/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/**
 * Lines carrying this marker are prose about secrets, not secrets. The
 * .env.example files exist precisely to name these keys.
 */
const ALLOW_MARKER = 'secret-scan-ok';

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
      continue;
    }
    const dot = entry.lastIndexOf('.');
    const ext = dot === -1 ? '' : entry.slice(dot);
    if (SCAN_EXTENSIONS.has(ext) || entry.startsWith('.env')) yield full;
  }
}

const findings = [];

function scanFile(file) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  const isEnvFile = basename(file).startsWith('.env');

  content.split(/\r?\n/).forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const { name, re, test, envOnly } of PATTERNS) {
      if (envOnly && !isEnvFile) continue;
      if (test ? test(line) : re.test(line)) {
        findings.push({
          file: relative(ROOT, file).split(sep).join('/'),
          line: index + 1,
          name,
        });
      }
    }
  });
}

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) scanFile(file);
}
for (const file of SCAN_FILES) scanFile(join(ROOT, file));

if (findings.length > 0) {
  console.error('\n✖ Secret scan failed — these must never reach the app bundle:\n');
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.name}`);
  }
  console.error(
    '\nMove the value to supabase/.env and read it from an Edge Function.\n' +
      'If it has already been committed or built, rotate it now.\n' +
      `If a match is prose rather than a real secret, append "${ALLOW_MARKER}" to that line.\n`,
  );
  process.exit(1);
}

console.log('✓ Secret scan passed — no server-side credentials in bundled paths.');
