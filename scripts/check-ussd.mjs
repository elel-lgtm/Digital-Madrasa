// Drives the deployed `ussd` function the way Africa's Talking does, with the
// demo parent's phone, and checks every screen. The secret is read from
// supabase/.env and never printed.
//
//   npm run check:ussd

import { readFileSync } from 'node:fs';

const read = (path) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]),
  );
const app = read('apps/mobile/.env');
const secret = read('supabase/.env').USSD_SECRET;
if (!secret) {
  console.error('USSD_SECRET missing from supabase/.env');
  process.exit(1);
}
const endpoint = `${app.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ussd`;
const PARENT = '+254712000103';

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail.replace(/\n/g, ' | ')}` : ''}`);
  if (!ok) failures += 1;
};

async function dial(text, { phone = PARENT, key = secret } = {}) {
  const res = await fetch(`${endpoint}${key ? `?key=${key}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ sessionId: 'check-' + Date.now(), serviceCode: '*384*123#', phoneNumber: phone, text }),
  });
  return { status: res.status, body: await res.text() };
}

console.log('USSD\n');
let r = await dial('', { key: null });
check(r.status === 404, 'no secret refused', `HTTP ${r.status}`);
r = await dial('', { key: 'x'.repeat(secret.length) });
check(r.status === 404, 'wrong secret refused', `HTTP ${r.status}`);

r = await dial('');
check(r.body.startsWith('CON') && r.body.includes('Kiswahili'), 'language menu', r.body);
r = await dial('1');
check(r.body.startsWith('CON') && /1\. \S+/.test(r.body), 'children listed', r.body);
r = await dial('1*1');
check(r.body.startsWith('CON') && r.body.includes('Attendance'), 'child menu', r.body);
r = await dial('1*1*1');
check(r.body.startsWith('END') && /came to|no classes/.test(r.body), 'attendance', r.body);
r = await dial('2*1*3');
check(r.body.startsWith('END') && /Ada|KES/.test(r.body), 'fees in Kiswahili', r.body);
r = await dial('3*2*2');
check(r.body.startsWith('END') && /xifdiyey/.test(r.body), 'hifz in Somali', r.body);
r = await dial('1*1*4');
check(r.body.startsWith('END'), 'teacher remark', r.body);
r = await dial('1*9');
check(r.body.startsWith('END') && r.body.includes('Invalid'), 'invalid child', r.body);
r = await dial('1', { phone: '+254700000999' });
check(r.body.startsWith('END') && r.body.includes('not linked'), 'unknown number gets nothing', r.body);
r = await dial('1*1*1', { phone: '0712000103' });
check(r.body.startsWith('END') && /came to|no classes/.test(r.body), 'local number format', r.body);
check([r.body].every((b) => b.length <= 175), 'fits a feature-phone screen');

console.log(failures ? `\n✗ ${failures} check(s) failed.` : '\n✓ USSD works end to end.');
process.exit(failures ? 1 : 0);
