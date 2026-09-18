#!/usr/bin/env node
/**
 * Fails if a release build profile would ship demo data.
 *
 *   npm run check:build-config
 *
 * This is not hypothetical: an APK was built and shared with
 * EXPO_PUBLIC_API_MODE=mock baked in, because eas.json was generated from a
 * .env that happened to say mock at the time. The build succeeded, the app
 * ran, and nothing anywhere said it was showing seeded records.
 *
 * `development` may use mock deliberately. `preview` and `production` may not.
 */
import { readFileSync } from 'node:fs';

const eas = JSON.parse(readFileSync('apps/mobile/eas.json', 'utf8'));

/** Profiles that can reach a real user's device. */
const RELEASE_PROFILES = ['preview', 'production'];

const problems = [];

for (const name of RELEASE_PROFILES) {
  const profile = eas.build?.[name];
  if (!profile) {
    problems.push(`${name}: profile missing from eas.json`);
    continue;
  }

  const mode = profile.env?.EXPO_PUBLIC_API_MODE;
  if (mode !== 'supabase') {
    problems.push(`${name}: EXPO_PUBLIC_API_MODE is "${mode ?? 'unset'}", expected "supabase"`);
  }

  if (!profile.env?.EXPO_PUBLIC_SUPABASE_URL) {
    problems.push(`${name}: EXPO_PUBLIC_SUPABASE_URL is not set — the app cannot reach a backend`);
  }

  if (!profile.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    problems.push(`${name}: EXPO_PUBLIC_SUPABASE_ANON_KEY is not set`);
  }

  // A privileged key in a build profile ends up in the shipped bundle.
  for (const [key, value] of Object.entries(profile.env ?? {})) {
    if (typeof value === 'string' && value.includes(['service', 'role'].join('_'))) {
      problems.push(`${name}: ${key} looks like a privileged key — it would ship in the bundle`);
    }
  }
}

// A LAN address in a release profile is unreachable from any other device.
for (const name of RELEASE_PROFILES) {
  const url = eas.build?.[name]?.env?.EXPO_PUBLIC_AI_GATEWAY_URL;
  if (url && /^https?:\/\/(127\.|localhost|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url)) {
    problems.push(`${name}: EXPO_PUBLIC_AI_GATEWAY_URL is a LAN address (${url})`);
  }
}

if (problems.length > 0) {
  console.error('\n✖ Build configuration would ship the wrong backend:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log('✓ Release build profiles point at the real backend.');
for (const name of RELEASE_PROFILES) {
  console.log(`  ${name.padEnd(12)} ${eas.build[name].env.EXPO_PUBLIC_API_MODE}`);
}
