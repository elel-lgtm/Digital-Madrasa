import { authenticate } from '../_shared/auth.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';
import { getSurah } from '../../../packages/shared/src/quran.ts';
import {
  VOICE_LANGS, voiceReportText, type VoiceLang, type VoiceReportFacts,
} from '../../../packages/shared/src/voiceReport.ts';

/**
 * A child's report, spoken, in the parent's language.
 *
 *   POST { studentId, lang }  ->  { text, audio (base64 WAV) | null, mime }
 *
 * The text is built here from the child's records, never taken from the
 * request, so this cannot be used to make the voice say anything else. The
 * records are read with `caller.db`, as the signed-in user: RLS decides
 * whether the caller may see this child at all, exactly as on the child
 * screen. If speech cannot be made, the text still comes back and the app
 * reads it with the phone's own voice.
 */

const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(handler(async (req) => {
  const caller = await authenticate(req);
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const body = await readJson<{ studentId?: unknown; lang?: unknown }>(req);
  const studentId = typeof body.studentId === 'string' && UUID.test(body.studentId) ? body.studentId : null;
  if (!studentId) throw new PublicError(400, 'validation', 'Choose a child.');
  const lang: VoiceLang = VOICE_LANGS.includes(body.lang as VoiceLang) ? (body.lang as VoiceLang) : 'en';

  await rateLimit(caller.admin, `voice:${caller.userId}`, LIMITS.voiceReport);

  const db = caller.db;
  const { data: student } = await db
    .from('students')
    .select('id, profiles!students_profile_id_fkey(full_name)')
    .eq('id', studentId)
    .maybeSingle();
  // Not linked (or not in the teacher's madrasa): RLS shows no row.
  if (!student) throw new PublicError(404, 'not_found', 'That child is not linked to your account.');

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [attendance, hifz, recitations, invoices] = await Promise.all([
    db.from('attendance').select('status').eq('student_id', studentId).gte('session_date', since).is('deleted_at', null),
    db.from('hifz_progress').select('surah_no, ayah_no, status, updated_at').eq('student_id', studentId).is('deleted_at', null),
    db.from('recitations')
      .select('created_at, tajweed_feedback(overall_score, assessment, teacher_override)')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('invoices').select('amount_due, amount_paid').eq('student_id', studentId).is('deleted_at', null),
  ]);

  const att = attendance.data ?? [];
  const learningRow = (hifz.data ?? [])
    .filter((h) => h.status === 'learning')
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  const surah = learningRow ? getSurah(learningRow.surah_no) : undefined;

  let lastScore: number | null = null;
  let teacherRemark: string | null = null;
  for (const r of recitations.data ?? []) {
    const raw = (r as { tajweed_feedback: unknown }).tajweed_feedback;
    const f = (Array.isArray(raw) ? raw[0] : raw) as
      | { overall_score: number | null; assessment: string; teacher_override: { overallScore?: number; remarks?: string } | null }
      | null;
    if (!f) continue;
    const score = f.teacher_override?.overallScore ?? (f.assessment === 'assessed' ? f.overall_score : null);
    if (score === null || score === undefined) continue;
    lastScore = Number(score);
    teacherRemark = f.teacher_override?.remarks?.trim() || null;
    break;
  }

  const facts: VoiceReportFacts = {
    childName: (student as { profiles?: { full_name?: string } }).profiles?.full_name ?? '',
    attended: att.filter((a) => a.status === 'present' || a.status === 'late').length,
    sessions: att.filter((a) => a.status !== 'excused').length,
    memorisedSurahs: (hifz.data ?? []).filter((h) => ['memorised', 'mastered', 'revising'].includes(h.status)).length,
    learning: learningRow && surah
      ? { surahName: lang === 'ar' ? surah.arabicName : surah.name, ayah: learningRow.ayah_no }
      : null,
    lastScore,
    teacherRemark,
    balance: (invoices.data ?? []).reduce((sum, i) => sum + (Number(i.amount_due) - Number(i.amount_paid)), 0),
  };
  const text = voiceReportText(facts, lang);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  let audio: string | null = null;
  let model: string | null = null;
  if (apiKey) {
    for (const candidate of TTS_MODELS) {
      audio = await speak(apiKey, candidate, text).catch(() => null);
      if (audio) {
        model = candidate;
        break;
      }
    }
  }

  return json({ text, lang, audio, mime: 'audio/wav', model });
}));

/** One Gemini speech request; the WAV comes back base64-encoded. */
async function speak(apiKey: string, model: string, text: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      // The key goes in a header, never in the URL, so it cannot end up in a log line.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Read this aloud warmly and clearly, at a calm pace:\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const part = body.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData)?.inlineData;
    if (!part?.data) return null;
    // Older models answer with raw 24 kHz PCM; give the phone a playable WAV either way.
    return /wav/i.test(part.mimeType ?? '') ? part.data : pcmToWavBase64(part.data, 24_000);
  } finally {
    clearTimeout(timer);
  }
}

function pcmToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
  const header = new DataView(new ArrayBuffer(44));
  const write = (offset: number, s: string) => [...s].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  header.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  write(36, 'data');
  header.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header.buffer), 0);
  wav.set(pcm, 44);
  let binary = '';
  for (let i = 0; i < wav.length; i += 0x8000) binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  return btoa(binary);
}
