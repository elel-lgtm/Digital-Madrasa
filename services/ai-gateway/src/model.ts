import { config } from './config.ts';

/**
 * The model provider.
 *
 * Deliberately one small interface with two implementations. Swapping Qwen3
 * for a different local model, or for a hosted free tier if you ever need the
 * app testable away from your laptop, is a change to this file and nothing
 * else. No screen, route or prompt knows which model answered.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ModelError extends Error {
  kind: 'unavailable' | 'timeout' | 'failed';

  constructor(kind: 'unavailable' | 'timeout' | 'failed', message: string) {
    super(message);
    this.kind = kind;
  }
}

async function ollamaChat(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.modelTimeoutMs);

  try {
    const res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages,
        stream: false,
        // Qwen3 reasons before answering by default. On CPU that cost ~60s of
        // tokens we then discarded — measured 65.7s with it on versus a few
        // seconds off. The task is summarising supplied facts, not solving
        // puzzles, so the reasoning pass buys nothing here.
        think: false,
        options: {
          // Low temperature: this assistant reports on real data. Invention is
          // the failure mode we care about, not dullness.
          temperature: 0.3,
          // 500 truncated a four-student summary mid-sentence.
          num_predict: 800,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) {
        throw new ModelError(
          'unavailable',
          `Model "${config.ollamaModel}" is not pulled. Run: ollama pull ${config.ollamaModel}`,
        );
      }
      throw new ModelError('failed', `Ollama returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { message?: { content?: string } };
    const content = json.message?.content?.trim();
    if (!content) throw new ModelError('failed', 'The model returned an empty response.');

    // Qwen3 emits its chain of thought in <think> tags. It is not for the
    // parent reading this on a phone.
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ModelError('timeout', 'The model took too long to respond.');
    }
    throw new ModelError(
      'unavailable',
      `Could not reach Ollama at ${config.ollamaUrl}. Is it running?`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stub provider: summarises the retrieved facts without a model.
 *
 * This is not a toy. It lets the entire chain — auth, RLS scoping, retrieval,
 * pseudonymisation, transport — be tested and CI-verified with no model
 * installed, which is how you find out that a permission bug is a permission
 * bug rather than a prompting problem.
 */
function stubChat(messages: ChatMessage[]): string {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const question = messages.findLast((m) => m.role === 'user')?.content ?? '';
  const dataBlock = system.split('Data available to you:')[1]?.trim() ?? '';

  if (!dataBlock || dataBlock.startsWith('No student records')) {
    return 'I do not have any student records available for your account yet.';
  }

  return [
    `[stub model] You asked: "${question}"`,
    '',
    'Based only on the data available to you:',
    '',
    dataBlock,
    '',
    'Set MODEL_PROVIDER=ollama for a real answer.',
  ].join('\n');
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  return config.modelProvider === 'ollama' ? ollamaChat(messages) : stubChat(messages);
}

/** Reports whether the configured model is actually usable, for /health. */
export async function modelHealth(): Promise<{ ok: boolean; detail: string }> {
  if (config.modelProvider === 'stub') return { ok: true, detail: 'stub provider' };

  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, detail: `Ollama returned ${res.status}` };

    const json = (await res.json()) as { models?: { name: string }[] };
    const names = (json.models ?? []).map((m) => m.name);
    const pulled = names.some((n) => n === config.ollamaModel || n.startsWith(`${config.ollamaModel}:`));

    return pulled
      ? { ok: true, detail: `${config.ollamaModel} ready` }
      : { ok: false, detail: `${config.ollamaModel} not pulled. Available: ${names.join(', ') || 'none'}` };
  } catch {
    return { ok: false, detail: `Ollama unreachable at ${config.ollamaUrl}` };
  }
}
