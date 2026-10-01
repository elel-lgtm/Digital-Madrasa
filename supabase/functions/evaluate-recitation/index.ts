import { authenticate } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { geminiGenerateAny, modelChain } from '../_shared/gemini.ts';
import {
  ASSESSMENT_SCHEMA, ASSESSMENT_SYSTEM, assessmentPrompt, audioMimeType, capByCoverage,
  juzForPassage, MIN_COVERAGE, parseAssessment, parseTranscript, passageCoverage, passageText,
  TRANSCRIPT_SCHEMA, TRANSCRIPT_SYSTEM, type Assessment, type Finding, type JuzFile,
} from '../_shared/tajweed.ts';

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
 * On the evaluation itself: when GEMINI_API_KEY is set, the recording and the
 * text the student was asked to recite are sent to Gemini, which hears the
 * audio and returns a score and the tajweed mistakes it can clearly hear
 * (_shared/tajweed.ts). That is a real assessment of the audio, but from a
 * general model, not a validated tajweed assessor, so it stays provisional
 * and the teacher's review is final.
 *
 * The recording is a child's voice, so nothing is sent unless the pupil's
 * parent or madrasa has switched AI feedback on (migration 0028). Without
 * consent, without a key, or when no model can be reached, the recitation is
 * saved as not assessed: no score at all rather than an invented one. The
 * teacher reviews it exactly as before; every recitation has a feedback row.
 *
 * `model_version` records exactly which model produced each score.
 */

/** What produced the result, when it was not a model. */
const NO_MODEL = 'none';

// Gemini takes at most 20 MB per request, and base64 adds a third.
const MAX_AUDIO_BYTES = 14 * 1024 * 1024;

/** The passage from the public Quran text the offline library also uses. */
async function expectedText(surahNo: number, ayahFrom: number, ayahTo: number) {
  const base = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/quran`;
  const files = await Promise.all(
    juzForPassage(surahNo, ayahFrom, ayahTo).map(async (juz) => {
      const res = await fetch(`${base}/juz-${String(juz).padStart(2, '0')}.json`);
      if (!res.ok) throw new Error(`Quran text for juz ${juz} is not published.`);
      return (await res.json()) as JuzFile;
    }),
  );
  const ayahs = passageText(files, surahNo, ayahFrom, ayahTo);
  if (!ayahs) throw new Error('That passage is not in the published Quran text.');
  return ayahs;
}

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
    .select('id, madrasa_id, ai_feedback_consent')
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

  // The model hears the recording only with consent. Any failure leaves the
  // recitation unassessed: a submission is never lost because a third party
  // is down, and never given a score that did not come from the audio.
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const consented = student.ai_feedback_consent === true;
  // The lightest models are left out: one heard a perfect recitation in silence.
  const models = modelChain(Deno.env.get('GEMINI_MODEL'), Deno.env.get('GEMINI_FALLBACK_MODELS'))
    .filter((m) => !m.includes('lite'));
  let assessment: Assessment | null = null;
  let modelVersion = NO_MODEL;

  if (apiKey && consented) {
    try {
      const [ayahs, audio] = await Promise.all([
        expectedText(surahNo, ayahFrom, ayahTo),
        caller.admin.storage.from('recitations').download(storagePath),
      ]);
      if (audio.error || !audio.data) throw new Error('The recording could not be read.');
      if (audio.data.size === 0 || audio.data.size > MAX_AUDIO_BYTES) {
        throw new Error(`Recording of ${audio.data.size} bytes cannot be assessed.`);
      }

      const audioPart = {
        inline_data: {
          mime_type: audioMimeType(audio.data.type),
          data: encodeBase64(new Uint8Array(await audio.data.arrayBuffer())),
        },
      };

      // 1. What was actually said, heard blind: the model is not shown the
      //    passage, so it cannot simply report it back.
      const heard = await geminiGenerateAny({
        apiKey,
        system: TRANSCRIPT_SYSTEM,
        parts: [audioPart],
        schema: TRANSCRIPT_SCHEMA,
        temperature: 0,
        timeoutMs: 30_000,
      }, models);
      const coverage = passageCoverage(ayahs, parseTranscript(heard.text));
      modelVersion = heard.model;

      if (coverage < MIN_COVERAGE) {
        // Silence, other speech or another passage. Nothing to assess.
        assessment = { overall: 0, findings: [] };
      } else {
        // 2. How well it was recited. No name, admission number or madrasa
        //    goes with the audio.
        const judged = await geminiGenerateAny({
          apiKey,
          system: ASSESSMENT_SYSTEM,
          parts: [{ text: assessmentPrompt(surahNo, ayahs) }, audioPart],
          schema: ASSESSMENT_SCHEMA,
          temperature: 0.1,
          timeoutMs: 30_000,
        }, models);
        assessment = capByCoverage(parseAssessment(judged.text, ayahFrom, ayahTo), coverage);
        modelVersion = judged.model;
      }
    } catch (error) {
      console.error('[evaluate] model assessment failed:', error instanceof Error ? error.message : error);
    }
  }

  // A model that answered the first step but not the second assessed nothing.
  if (!assessment) modelVersion = NO_MODEL;
  const status = assessment ? 'assessed' : consented ? 'unavailable' : 'not_consented';
  const overall = assessment ? assessment.overall : null;
  const findings: Finding[] = assessment ? assessment.findings : [];

  await caller.admin.from('tajweed_feedback').insert({
    recitation_id: recitation.id,
    madrasa_id: student.madrasa_id,
    overall_score: overall,
    assessment: status,
    errors: findings,
    model_version: modelVersion,
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
      assessment: status,
      findings,
      modelVersion,
      provisional: true,
      disclaimer: 'AI feedback assists practice; your teacher\u2019s assessment is final.',
    },
    201,
  );
}));
