#!/usr/bin/env node
/**
 * Points the app at the AI gateway on this machine's current LAN address.
 *
 *   npm run ai:url
 *
 * The address changes whenever the laptop joins a different network, and a
 * stale one fails as a confusing "could not reach the assistant" rather than
 * as anything that mentions Wi-Fi. Cheaper to re-detect than to remember.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const ENV_PATH = 'apps/mobile/.env';
const PORT = process.env.AI_GATEWAY_PORT ?? '8787';

function lanAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      // Virtual adapters (WSL, Docker, VirtualBox) are reachable from this
      // machine but not from a phone, so prefer a real Wi-Fi/Ethernet one.
      const virtual = /vEthernet|WSL|Docker|VirtualBox|Loopback/i.test(name);
      candidates.push({ name, address: address.address, virtual });
    }
  }

  const real = candidates.find((c) => !c.virtual);
  return real ?? candidates[0] ?? null;
}

const found = lanAddress();
if (!found) {
  console.error('No LAN address found. Are you connected to a network?');
  process.exit(1);
}

const url = `http://${found.address}:${PORT}`;
const env = readFileSync(ENV_PATH, 'utf8');
const previous = env.match(/^EXPO_PUBLIC_AI_GATEWAY_URL=(.*)$/m)?.[1]?.trim() ?? '';

if (previous === url) {
  console.log(`Already correct: ${url} (${found.name})`);
  process.exit(0);
}

writeFileSync(
  ENV_PATH,
  env.replace(/^EXPO_PUBLIC_AI_GATEWAY_URL=.*$/m, `EXPO_PUBLIC_AI_GATEWAY_URL=${url}`),
);

console.log(`Gateway URL updated (${found.name})`);
console.log(`  was: ${previous || '(unset)'}`);
console.log(`  now: ${url}`);
console.log('\nRestart Metro with --clear so the app picks it up.');
