/**
 * Recitation assessment with a multimodal model.
 *
 * The model hears the recording and is given the text the student was meant
 * to recite. Everything here is pure: choosing the text, wording the request
 * and, above all, checking what comes back. The model's reply is treated as
 * untrusted input: a score outside 0 to 100, an ayah the student never
 * recited or a rule the app does not know is dropped, not stored.
 *
 * The result is still provisional. A general model is not a validated tajweed
 * assessor, so `model_version` names it and the teacher's review stays final.
 */

/** Keep in step with TAJWEED_RULES in packages/shared/src/constants.ts. */
export const RULES = [
  'madd', 'ghunnah', 'qalqalah', 'ikhfa', 'idgham', 'iqlab', 'izhar', 'tafkhim', 'tarqiq', 'waqf',
] as const;
export const SEVERITIES = ['minor', 'moderate', 'major'] as const;
const HEARD = ['passage', 'other_recitation', 'not_recitation', 'silence'] as const;

export interface Finding {
  ayah: number;
  word_index: number;
  rule: (typeof RULES)[number];
  severity: (typeof SEVERITIES)[number];
  note: string;
}

export interface Assessment {
  overall: number;
  findings: Finding[];
}

/** Keep in step with JUZ_START in packages/shared/src/hifz.ts. */
const JUZ_START: readonly (readonly [number, number])[] = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 83], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

export function juzForAyah(surahNo: number, ayahNo: number): number {
  let juz = 1;
  JUZ_START.forEach(([s, a], i) => {
    if (surahNo > s || (surahNo === s && ayahNo >= a)) juz = i + 1;
  });
  return juz;
}

/** The juz files that hold a passage (a long surah can cross a boundary). */
export function juzForPassage(surahNo: number, ayahFrom: number, ayahTo: number): number[] {
  const first = juzForAyah(surahNo, ayahFrom);
  const last = juzForAyah(surahNo, ayahTo);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** One file of the offline library (supabase/seed/quran/juz-NN.json). */
export interface JuzFile {
  juz: number;
  surahs: { number: number; ayahs: { n: number; text: string }[] }[];
}

/** The text the student was asked to recite, or null if any ayah is missing. */
export function passageText(
  files: JuzFile[],
  surahNo: number,
  ayahFrom: number,
  ayahTo: number,
): { n: number; text: string }[] | null {
  const ayahs = files
    .flatMap((file) => file.surahs.filter((s) => s.number === surahNo).flatMap((s) => s.ayahs))
    .filter((a) => a.n >= ayahFrom && a.n <= ayahTo)
    .sort((a, b) => a.n - b.n);
  return ayahs.length === ayahTo - ayahFrom + 1 ? ayahs : null;
}

export const ASSESSMENT_SYSTEM = `
You are assisting a Quran teacher by giving a first, provisional assessment of a
student's recitation. The student is usually a child. You are given the audio
and the exact text they were asked to recite (Hafs 'an 'Asim).

Listen to the whole recording and compare it with the text.

Score (0-100) on three things together: whether the words recited match the
text (missed, added or wrong words lower the score most), fluency (long
hesitations and restarts), and the tajweed rules you can clearly hear.

Findings: report a tajweed mistake ONLY when you clearly hear it. Do not guess,
and do not invent a mistake to seem thorough; an empty list is a good answer
for a good recitation. Give the ayah number, the position of the word in that
ayah counting from 0, the rule, how serious it is, and one short, kind,
practical sentence in English that a child can act on.

First say what you heard: "passage" if the student recited the passage given
(even with mistakes), "other_recitation" if it is Quran but a different
passage, "not_recitation" for speech or sound that is not Quran, or "silence"
if there is no voice. For anything but "passage" there is nothing to assess.

You are not issuing a religious ruling. The teacher will review your result.
`.trim();

export function assessmentPrompt(
  surahNo: number,
  ayahs: { n: number; text: string }[],
): string {
  return [
    `Surah ${surahNo}, ayah ${ayahs[0].n} to ${ayahs[ayahs.length - 1].n}.`,
    'Text the student was asked to recite:',
    ...ayahs.map((a) => `(${a.n}) ${a.text}`),
  ].join('\n');
}

export const ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    heard: { type: 'string', enum: [...HEARD], description: 'What the recording contains.' },
    overall_score: { type: 'integer', description: 'Overall score from 0 to 100.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ayah: { type: 'integer' },
          word_index: { type: 'integer' },
          rule: { type: 'string', enum: [...RULES] },
          severity: { type: 'string', enum: [...SEVERITIES] },
          note: { type: 'string' },
        },
        required: ['ayah', 'word_index', 'rule', 'severity', 'note'],
      },
    },
  },
  required: ['heard', 'overall_score', 'findings'],
};

const MAX_FINDINGS = 12;

/**
 * Turns the model's reply into something safe to store. Throws if there is no
 * usable score, so the caller can fall back instead of saving nonsense.
 */
export function parseAssessment(reply: string, ayahFrom: number, ayahTo: number): Assessment {
  // Some models wrap JSON in a code fence even when asked not to.
  const json = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const raw = JSON.parse(json) as { heard?: unknown; overall_score?: unknown; findings?: unknown };

  // Decided here, not left to the model's arithmetic: asked to score silence
  // as 0, it gave 25. A recording that is not the passage earns nothing.
  if (typeof raw.heard === 'string' && raw.heard !== 'passage') return { overall: 0, findings: [] };

  const score = Number(raw.overall_score);
  if (!Number.isFinite(score)) throw new Error('The model gave no score.');

  const findings: Finding[] = [];
  for (const item of Array.isArray(raw.findings) ? raw.findings : []) {
    const f = item as Record<string, unknown>;
    const ayah = Number(f.ayah);
    const wordIndex = Number(f.word_index);
    const rule = String(f.rule ?? '').toLowerCase() as Finding['rule'];
    const severity = String(f.severity ?? '').toLowerCase() as Finding['severity'];
    const note = typeof f.note === 'string' ? f.note.trim().slice(0, 240) : '';

    if (!Number.isInteger(ayah) || ayah < ayahFrom || ayah > ayahTo) continue;
    if (!RULES.includes(rule) || !SEVERITIES.includes(severity) || !note) continue;

    findings.push({
      ayah,
      word_index: Number.isInteger(wordIndex) && wordIndex >= 0 ? wordIndex : 0,
      rule,
      severity,
      note,
    });
    if (findings.length === MAX_FINDINGS) break;
  }

  return { overall: Math.min(100, Math.max(0, Math.round(score))), findings };
}

/** The content types Gemini accepts for the formats the app records in. */
export function audioMimeType(contentType: string | undefined): string {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'audio/mp3';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'audio/wav';
  if (type === 'audio/aac') return 'audio/aac';
  // expo-audio records AAC in an MP4 container (.m4a).
  return 'audio/m4a';
}

// ------------------------------------------------------------ what was heard
//
// A model that is shown the expected text will say it heard it: given two
// seconds of silence and the text of Al-Ikhlas, one model scored the
// "recitation" 100. So the audio is first transcribed blind, with no text to
// copy from, and the comparison is done here in code.

export const TRANSCRIPT_SYSTEM = `
Transcribe exactly the Arabic words spoken in this audio, in Arabic script
without diacritics. Write only what you actually hear. Do not complete,
correct or continue the text from memory. If there is no speech, or no Arabic,
return an empty transcript.
`.trim();

export const TRANSCRIPT_SCHEMA = {
  type: 'object',
  properties: { transcript: { type: 'string' } },
  required: ['transcript'],
};

export function parseTranscript(reply: string): string {
  const json = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const raw = JSON.parse(json) as { transcript?: unknown };
  return typeof raw.transcript === 'string' ? raw.transcript : '';
}

/**
 * Reduces Arabic to a consonant skeleton so that the Uthmani text of the
 * mushaf and ordinary spelling compare equal: no diacritics or Quranic marks,
 * one form of each letter, and no alef at all, since the Uthmani script
 * writes many of them as a mark above the line.
 */
export function arabicWords(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[آأإٱا]/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^؀-ۿ\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** The share of the passage's words that appear in the transcript, 0 to 1. */
export function passageCoverage(ayahs: { text: string }[], transcript: string): number {
  const expected = ayahs.flatMap((a) => arabicWords(a.text));
  if (expected.length === 0) return 0;

  const heard = new Map<string, number>();
  for (const word of arabicWords(transcript)) heard.set(word, (heard.get(word) ?? 0) + 1);

  let found = 0;
  for (const word of expected) {
    const left = heard.get(word) ?? 0;
    if (left > 0) {
      found += 1;
      heard.set(word, left - 1);
    }
  }
  return found / expected.length;
}

/** Below this share of the passage, the recording is not a recitation of it. */
export const MIN_COVERAGE = 0.5;

/**
 * The model's score can never exceed what the transcript supports. The margin
 * allows for spelling differences between the transcript and the mushaf.
 */
export function capByCoverage(assessment: Assessment, coverage: number): Assessment {
  if (coverage < MIN_COVERAGE) return { overall: 0, findings: [] };
  return { ...assessment, overall: Math.min(assessment.overall, Math.min(100, Math.round(coverage * 100) + 20)) };
}
