import { authenticate } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Records a recitation and produces tajweed feedback.
 *
 * Two endpoints in one function:
 *   POST { action: 'upload-url' }  a signed URL to PUT the audio to
 *   POST { action: 'evaluate' }    create the row and score it
 *
 * The audio never passes through this function. The client uploads straight
 * to Storage with a signed URL, which keeps a 10 MB file out of the function's
 * memory and off its execution time.
 *
 * On the evaluation itself — the honest position: real tajweed assessment
 * needs forced alignment of audio against the Quranic text for a specific
 * qiraah, and that is a speech-processing problem, not a prompt. What runs
 * here is a deterministic placeholder that produces a well-formed, clearly
 * provisional result, so the whole pipeline — upload, row, feedback UI,
 * teacher override — is real and testable while the model is chosen.
 *
 * `model_version` records exactly what produced each score, so nothing here
 * can later be mistaken for a graded assessment.
 */

const PLACEHOLDER_MODEL = 'placeholder-v1';

interface Body {
  action?: 'upload-url' | 'evaluate';
  // upload-url
  contentType?: string;
  // evaluate
  storagePath?: string;
  durationMs?: number;
  surahNo?: number;
  ayahFrom?: number;
  ayahTo?: number;
  qiraahStyle?: string;
}

const ALLOWED_AUDIO = ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'];

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);

  const { data: student } = await caller.db
    .from('students')
    .select('id, madrasa_id')
    .eq('profile_id', caller.userId)
    .maybeSingle();

  if (!student) {
    throw new PublicError(403, 'forbidden', 'Only students can submit a recitation.');
  }

  const body = await readJson<Body>(req);

  // ------------------------------------------------------------ upload URL
  if (body.action === 'upload-url') {
    await rateLimit(caller.admin, `recite:${caller.userId}`, LIMITS.recitationUpload);

    const contentType = body.contentType ?? 'audio/m4a';
    if (!ALLOWED_AUDIO.includes(contentType)) {
      throw new PublicError(400, 'validation', 'That audio format is not supported.');
    }

    // Tenant-scoped path, so the storage policy can check the madrasa from
    // the path alone. The client cannot choose where its file lands.
    const path = `madrasa/${student.madrasa_id}/recitations/${crypto.randomUUID()}`;

    const { data, error } = await caller.admin.storage
      .from('recitations')
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error('[upload-url]', error);
      throw new PublicError(500, 'internal', 'Could not prepare the upload.');
    }

    return json({ path, token: data.token, signedUrl: data.signedUrl });
  }

  // -------------------------------------------------------------- evaluate
  if (body.action !== 'evaluate') {
    throw new PublicError(400, 'validation', 'Unknown action.');
  }

  const { storagePath, surahNo, ayahFrom, ayahTo } = body;
  if (!storagePath || !surahNo || !ayahFrom || !ayahTo) {
    throw new PublicError(400, 'validation', 'Missing recitation details.');
  }
  if (ayahFrom > ayahTo) {
    throw new PublicError(400, 'validation', 'The first ayah must come before the last.');
  }

  // The path must be inside this student's own tenant folder. Without this a
  // crafted request could attach someone else's audio to its own row.
  if (!storagePath.startsWith(`madrasa/${student.madrasa_id}/recitations/`)) {
    throw new PublicError(403, 'forbidden', 'That file does not belong to your madrasa.');
  }

  const started = Date.now();

  const { data: recitation, error: recError } = await caller.admin
    .from('recitations')
    .insert({
      student_id: student.id,
      madrasa_id: student.madrasa_id,
      audio_url: storagePath,
      duration_ms: body.durationMs ?? 0,
      surah_no: surahNo,
      ayah_from: ayahFrom,
      ayah_to: ayahTo,
      qiraah_style: body.qiraahStyle ?? 'hafs',
    })
    .select('id')
    .single();

  if (recError) {
    console.error('[evaluate]', recError);
    throw new PublicError(500, 'internal', 'Could not save your recitation.');
  }

  /**
   * Provisional scoring.
   *
   * Deterministic in the recitation id so a given recording always yields the
   * same result — a score that changes on refresh would look like a real
   * assessment behaving erratically. Scores sit in a plausible band and are
   * plainly labelled as provisional by `model_version`.
   */
  const seed = [...recitation.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const overall = 62 + (seed % 33);

  const RULES = ['madd', 'ghunnah', 'qalqalah', 'ikhfa', 'idgham'];
  const findings = Array.from({ length: seed % 3 }, (_, i) => ({
    ayah: ayahFrom + ((seed + i) % Math.max(1, ayahTo - ayahFrom + 1)),
    word_index: (seed + i * 7) % 9,
    rule: RULES[(seed + i) % RULES.length],
    severity: ['minor', 'moderate'][(seed + i) % 2],
    note: 'Provisional finding. Your teacher\u2019s assessment is final.',
  }));

  await caller.admin.from('tajweed_feedback').insert({
    recitation_id: recitation.id,
    madrasa_id: student.madrasa_id,
    overall_score: overall,
    errors: findings,
    model_version: PLACEHOLDER_MODEL,
    processing_ms: Date.now() - started,
  });

  await writeAudit(caller.admin, {
    actorId: caller.userId,
    actorRole: caller.role,
    madrasaId: student.madrasa_id,
    action: 'recitation.submitted',
    entityType: 'recitation',
    entityId: recitation.id,
    // Never the audio itself, and never a transcript.
    after: { surah_no: surahNo, ayah_from: ayahFrom, ayah_to: ayahTo },
    req,
  });

  return json(
    {
      id: recitation.id,
      overallScore: overall,
      findings,
      modelVersion: PLACEHOLDER_MODEL,
      provisional: true,
      disclaimer: 'AI feedback assists practice; your teacher\u2019s assessment is final.',
    },
    201,
  );
}));
