import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiError, geminiGenerate, geminiGenerateAny, modelChain } from './gemini.ts';
import {
  arabicWords, assessmentPrompt, audioMimeType, capByCoverage, juzForAyah, juzForPassage,
  parseAssessment, parseTranscript, passageCoverage, passageText, type JuzFile,
} from './tajweed.ts';

const juz = (n: number) =>
  JSON.parse(
    readFileSync(new URL(`../../seed/quran/juz-${String(n).padStart(2, '0')}.json`, import.meta.url), 'utf8'),
  ) as JuzFile;

describe('the passage a student was asked to recite', () => {
  it('finds the juz of an ayah, including the first ayah of a juz', () => {
    expect(juzForAyah(1, 1)).toBe(1);
    expect(juzForAyah(2, 141)).toBe(1);
    expect(juzForAyah(2, 142)).toBe(2);
    expect(juzForAyah(67, 1)).toBe(29);
    expect(juzForAyah(114, 6)).toBe(30);
  });

  it('reads a passage from the published Quran text', () => {
    const ayahs = passageText([juz(30)], 112, 1, 4);
    expect(ayahs?.map((a) => a.n)).toEqual([1, 2, 3, 4]);
    expect(ayahs?.[0].text).toContain('قُلۡ');
    expect(assessmentPrompt(112, ayahs!)).toContain('Surah 112, ayah 1 to 4.');
  });

  it('joins a passage that crosses a juz boundary', () => {
    expect(juzForPassage(2, 140, 143)).toEqual([1, 2]);
    const ayahs = passageText([juz(1), juz(2)], 2, 140, 143);
    expect(ayahs?.map((a) => a.n)).toEqual([140, 141, 142, 143]);
  });

  it('refuses a passage that is not all there, rather than assessing against part of it', () => {
    expect(passageText([juz(1)], 2, 140, 143)).toBeNull();
    expect(passageText([juz(30)], 112, 1, 9)).toBeNull();
  });
});

describe('the model’s reply is untrusted', () => {
  const reply = (body: unknown) => JSON.stringify(body);
  const finding = { ayah: 2, word_index: 1, rule: 'madd', severity: 'minor', note: 'Hold it for two counts.' };

  it('keeps a well-formed assessment', () => {
    expect(parseAssessment(reply({ overall_score: 84, findings: [finding] }), 1, 4)).toEqual({
      overall: 84,
      findings: [finding],
    });
  });

  it('gives nothing for silence, other speech or another passage, whatever score the model attached', () => {
    for (const heard of ['silence', 'not_recitation', 'other_recitation']) {
      expect(parseAssessment(reply({ heard, overall_score: 25, findings: [finding] }), 1, 4)).toEqual({ overall: 0, findings: [] });
    }
    expect(parseAssessment(reply({ heard: 'passage', overall_score: 84, findings: [] }), 1, 4).overall).toBe(84);
  });

  it('clamps the score to 0–100 and rounds it', () => {
    expect(parseAssessment(reply({ overall_score: 140, findings: [] }), 1, 4).overall).toBe(100);
    expect(parseAssessment(reply({ overall_score: -3, findings: [] }), 1, 4).overall).toBe(0);
    expect(parseAssessment(reply({ overall_score: 77.6, findings: [] }), 1, 4).overall).toBe(78);
  });

  it('drops findings about an ayah that was not recited, an unknown rule or severity, or no note', () => {
    const { findings } = parseAssessment(reply({
      overall_score: 70,
      findings: [
        { ...finding, ayah: 9 },
        { ...finding, rule: 'makhraj' },
        { ...finding, severity: 'catastrophic' },
        { ...finding, note: '   ' },
        { ...finding, rule: 'GHUNNAH', word_index: -4 },
      ],
    }), 1, 4);
    expect(findings).toEqual([{ ...finding, rule: 'ghunnah', word_index: 0 }]);
  });

  it('caps the number of findings and the length of a note', () => {
    const many = Array.from({ length: 40 }, () => ({ ...finding, note: 'x'.repeat(900) }));
    const { findings } = parseAssessment(reply({ overall_score: 50, findings: many }), 1, 4);
    expect(findings).toHaveLength(12);
    expect(findings[0].note).toHaveLength(240);
  });

  it('reads JSON wrapped in a code fence', () => {
    expect(parseAssessment('```json\n{"overall_score": 61, "findings": []}\n```', 1, 4).overall).toBe(61);
  });

  it('throws when there is no usable score, so the caller falls back', () => {
    expect(() => parseAssessment(reply({ findings: [] }), 1, 4)).toThrow();
    expect(() => parseAssessment('The recitation was lovely.', 1, 4)).toThrow();
  });

  it('names the audio format the way the model expects it', () => {
    expect(audioMimeType('audio/mp4')).toBe('audio/m4a');
    expect(audioMimeType('audio/x-m4a; codecs=aac')).toBe('audio/m4a');
    expect(audioMimeType('audio/mpeg')).toBe('audio/mp3');
    expect(audioMimeType(undefined)).toBe('audio/m4a');
  });
});

describe('Gemini client', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it('sends the key in a header, never in the URL, and returns the text', async () => {
    respond(200, { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: ' hello ' }] } }] });
    const text = await geminiGenerate({ apiKey: 'test-key', model: 'm', system: 's', parts: [{ text: 'q' }] });
    expect(text).toBe('hello');

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string).system_instruction.parts[0].text).toBe('s');
  });

  it('asks for JSON of the given shape when a schema is supplied', async () => {
    respond(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] });
    await geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }], schema: { type: 'object' } });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.generation_config.response_mime_type).toBe('application/json');
    expect(body.generation_config.response_schema).toEqual({ type: 'object' });
  });

  it('tells a used-up free tier apart from other failures', async () => {
    respond(429, { error: { message: 'Quota exceeded' } });
    await expect(geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }] })).rejects.toMatchObject({ kind: 'rate_limited' });
    respond(503, {});
    await expect(geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }] })).rejects.toMatchObject({ kind: 'unavailable' });
    respond(400, { error: { message: 'Bad audio' } });
    await expect(geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }] })).rejects.toMatchObject({ kind: 'failed' });
  });

  it('reports a blocked or empty reply as a failure, not as an answer', async () => {
    respond(200, { promptFeedback: { blockReason: 'SAFETY' } });
    await expect(geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }] })).rejects.toMatchObject({ kind: 'blocked' });
    respond(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] });
    await expect(geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }] })).rejects.toBeInstanceOf(GeminiError);
    respond(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Overall, one of your' }] } }] });
    await expect(geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }] })).rejects.toMatchObject({ kind: 'failed' });
  });

  it('reports an unreachable network as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(geminiGenerate({ apiKey: 'k', parts: [{ text: 'q' }] })).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('falling back between models', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('moves to the next model when one is overloaded, and says which answered', async () => {
    const replies = [
      new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 }),
      new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 }),
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => replies.shift()!));
    const chain = modelChain('a', 'b, c');
    expect(chain).toEqual(['a', 'b', 'c']);
    await expect(geminiGenerateAny({ apiKey: 'k', parts: [{ text: 'q' }] }, chain)).resolves.toEqual({ text: 'ok', model: 'c' });
  });

  it('does not retry a request the API rejects outright', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 400 })));
    await expect(geminiGenerateAny({ apiKey: 'k', parts: [{ text: 'q' }] }, ['a', 'b'])).rejects.toMatchObject({ kind: 'failed' });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('uses the default fallbacks unless they are set, and drops duplicates', () => {
    expect(modelChain(undefined, undefined)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    expect(modelChain('x', '')).toEqual(['x']);
    expect(modelChain('x', 'x,y')).toEqual(['x', 'y']);
  });
});

describe('whether the passage was actually recited is decided from a blind transcript', () => {
  const ikhlas = passageText([juz(30)], 112, 1, 4)!;
  const fatiha = passageText([juz(1)], 1, 1, 7)!;

  it('matches ordinary spelling against the Uthmani text of the mushaf', () => {
    expect(arabicWords(fatiha[3].text)).toEqual(arabicWords('مالك يوم الدين'));
    expect(passageCoverage(ikhlas, 'قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد')).toBe(1);
    expect(passageCoverage(fatiha,
      'بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين '
      + 'اهدنا الصراط المستقيم صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين')).toBeGreaterThan(0.9);
  });

  it('finds nothing of the passage in silence, other speech or another surah', () => {
    expect(passageCoverage(ikhlas, '')).toBe(0);
    expect(passageCoverage(ikhlas, 'السلام عليكم كيف حالك اليوم')).toBe(0);
    expect(passageCoverage(ikhlas, 'قل أعوذ برب الفلق من شر ما خلق')).toBeLessThan(0.5);
  });

  it('does not count a repeated word more often than it was said', () => {
    expect(passageCoverage(ikhlas, 'الله')).toBeCloseTo(1 / 15, 5);
  });

  it('gives 0 below half the passage, and otherwise caps the score by what was heard', () => {
    const judged = { overall: 100, findings: [{ ayah: 1, word_index: 0, rule: 'madd' as const, severity: 'minor' as const, note: 'n' }] };
    expect(capByCoverage(judged, 0.2)).toEqual({ overall: 0, findings: [] });
    expect(capByCoverage(judged, 0.6).overall).toBe(80);
    expect(capByCoverage(judged, 1)).toEqual(judged);
    expect(capByCoverage({ overall: 55, findings: [] }, 1).overall).toBe(55);
  });

  it('reads the transcript, and treats a missing one as nothing heard', () => {
    expect(parseTranscript('{"transcript":"قل هو الله احد"}')).toBe('قل هو الله احد');
    expect(parseTranscript('{}')).toBe('');
  });
});
