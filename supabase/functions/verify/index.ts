import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * The page a certificate's QR code opens: anyone can check a certificate with
 * the phone camera, with no app and no account.
 *
 *   GET /functions/v1/verify?code=ABCDE23456
 *
 * It calls verify_certificate as an anonymous visitor, so it can show exactly
 * what that function shows (title, pupil, madrasa, date and whether it is
 * still valid) and nothing else. Answered as plain text: the hosting platform
 * does not serve HTML from functions, and plain text reads well on any phone.
 */

const KINDS: Record<string, string> = {
  juz_completion: 'Juz completion',
  quran_completion: 'Completion of the Holy Quran',
  tajweed_level: 'Tajweed level',
  ijazah: 'Ijazah',
};

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return text('Method not allowed.', 405);

  const code = (new URL(req.url).searchParams.get('code') ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (code.length !== 10) {
    return text('DIGITAL MADRASA — CERTIFICATE CHECK\n\nThat is not a valid certificate code.\nA code has 10 letters and numbers.', 400);
  }

  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.rpc('verify_certificate', { p_code: code });
  if (error) {
    console.error('[verify]', error.message);
    return text('DIGITAL MADRASA — CERTIFICATE CHECK\n\nThe check could not be completed. Please try again.', 500);
  }

  const row = (data ?? [])[0];
  if (!row) {
    return text(`DIGITAL MADRASA — CERTIFICATE CHECK\n\n✗ NOT FOUND\n\nNo certificate has the code ${code}.\nIt may have been mistyped, or it was never issued.`, 404);
  }

  const issued = new Date(row.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [
    'DIGITAL MADRASA — CERTIFICATE CHECK',
    '',
    row.valid ? '✓ VALID CERTIFICATE' : '✗ WITHDRAWN — THIS CERTIFICATE IS NO LONGER VALID',
    '',
    `Title:     ${row.title}`,
    `Type:      ${KINDS[row.kind] ?? row.kind}`,
    `Awarded to: ${row.student_name}`,
    `Madrasa:   ${row.madrasa_name}`,
    `Issued:    ${issued}`,
    `Code:      ${code}`,
  ];
  if (row.sanad) lines.push('', 'Chain of transmission (sanad):', ...String(row.sanad).split('\n').map((l) => `  ${l}`));
  lines.push('', 'Checked live against the madrasa’s records.');
  return text(lines.join('\n'));
});
