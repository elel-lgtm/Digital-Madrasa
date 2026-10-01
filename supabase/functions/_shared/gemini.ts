/**
 * Minimal client for the Gemini API (models.generateContent).
 *
 * Plain fetch and no runtime globals, so the same file serves the Edge
 * Functions (Deno) and the local AI gateway (Node). The key is always passed
 * in by the caller: it lives in a server secret, never in the app.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
/** Tried in order when the model before is overloaded or out of quota. */
export const DEFAULT_GEMINI_FALLBACKS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export interface GeminiRequest {
  apiKey: string;
  model?: string;
  system?: string;
  parts: GeminiPart[];
  /** A JSON schema makes the model answer in JSON of that shape. */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export class GeminiError extends Error {
  kind: 'unavailable' | 'timeout' | 'rate_limited' | 'blocked' | 'failed';

  constructor(kind: GeminiError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    finish_reason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  prompt_feedback?: { block_reason?: string };
  error?: { message?: string; status?: string };
}

export async function geminiGenerate(request: GeminiRequest): Promise<string> {
  const model = request.model ?? DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 45_000);

  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      // The key goes in a header, never in the URL, so it cannot end up in a log line.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': request.apiKey },
      body: JSON.stringify({
        ...(request.system ? { system_instruction: { parts: [{ text: request.system }] } } : {}),
        contents: [{ role: 'user', parts: request.parts }],
        generation_config: {
          temperature: request.temperature ?? 0.2,
          max_output_tokens: request.maxOutputTokens ?? 4096,
          ...(request.schema
            ? { response_mime_type: 'application/json', response_schema: request.schema }
            : {}),
        },
      }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (!res.ok) {
      // Google's message names the model and the limit, never the key.
      const detail = (body.error?.message ?? `HTTP ${res.status}`).slice(0, 200);
      if (res.status === 429) throw new GeminiError('rate_limited', detail);
      if (res.status >= 500) throw new GeminiError('unavailable', detail);
      throw new GeminiError('failed', detail);
    }

    const blocked = body.promptFeedback?.blockReason ?? body.prompt_feedback?.block_reason;
    if (blocked) throw new GeminiError('blocked', `Blocked by the model: ${blocked}`);

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    const reason = body.candidates?.[0]?.finishReason ?? body.candidates?.[0]?.finish_reason;
    if (!text) {
      throw new GeminiError('failed', `The model returned no text (${reason ?? 'no reason given'}).`);
    }
    // The model's own reasoning counts against the limit, so a reply can stop
    // mid-sentence. Half an answer is not an answer.
    if (reason === 'MAX_TOKENS') throw new GeminiError('failed', 'The reply was cut off at the output limit.');
    return text;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeminiError('timeout', 'The model took too long to respond.');
    }
    throw new GeminiError('unavailable', 'Could not reach the Gemini API.');
  } finally {
    clearTimeout(timer);
  }
}

/** The models to try, in order: the configured one, then the fallbacks. */
export function modelChain(model: string | undefined, fallbacks: string | undefined): string[] {
  const rest = fallbacks === undefined
    ? DEFAULT_GEMINI_FALLBACKS
    : fallbacks.split(',').map((m) => m.trim()).filter(Boolean);
  return [...new Set([model || DEFAULT_GEMINI_MODEL, ...rest])];
}

/**
 * Asks each model in turn until one answers.
 *
 * Only a busy model moves on to the next: "high demand" and an exhausted free
 * quota are both temporary and specific to one model. A request the API
 * rejects outright would be rejected by every model, so it is not retried.
 * Returns the model that answered, so the caller can record it.
 */
export async function geminiGenerateAny(
  request: Omit<GeminiRequest, 'model'>,
  models: string[],
): Promise<{ text: string; model: string }> {
  let last: GeminiError | undefined;
  for (const model of models) {
    try {
      return { text: await geminiGenerate({ ...request, model }), model };
    } catch (error) {
      if (!(error instanceof GeminiError)) throw error;
      last = error;
      if (!['unavailable', 'rate_limited', 'timeout'].includes(error.kind)) throw error;
    }
  }
  throw last ?? new GeminiError('failed', 'No model was configured.');
}
