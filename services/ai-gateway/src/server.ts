import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AuthError, authenticate } from './auth.ts';
import { assertConfig, config } from './config.ts';
import { buildContext, restoreNames } from './context.ts';
import { chat, ModelError, modelHealth, type ChatMessage } from './model.ts';
import { analyseAll, renderAnalysis } from './analysis.ts';
import { AI_DISCLAIMER, SUGGESTED_PROMPTS, buildSystemPrompt } from './prompt.ts';
import { deterministicFallback, verifyNumbers } from './verify.ts';

assertConfig();

/**
 * Per-user rate limiting, in memory.
 *
 * Adequate for one instance. If the gateway is ever run behind more than one
 * process this has to move to Postgres or Redis — noted here so it is a known
 * limitation rather than a surprise.
 */
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > config.rateLimitPerMinute;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    // A question is a sentence. Anything larger is either a mistake or an
    // attempt to stuff the context window.
    if (size > 16_384) throw new Error('Request body too large.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await authenticate(req.headers.authorization);

  if (rateLimited(caller.userId)) {
    res.setHeader('Retry-After', '60');
    send(res, 429, { error: 'Too many questions. Please wait a moment.' });
    return;
  }

  const body = await readJson(req);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    send(res, 400, { error: 'A message is required.' });
    return;
  }
  if (message.length > 2000) {
    send(res, 400, { error: 'That question is too long.' });
    return;
  }

  // The only thing taken from the body is a narrowing hint. It cannot widen
  // access: an id outside what RLS returned simply matches nothing.
  const ctx = body.context as Record<string, unknown> | undefined;
  const selectedStudentId =
    typeof ctx?.selectedChildId === 'string' ? ctx.selectedChildId : undefined;

  const context = await buildContext(caller, { selectedStudentId });

  const findings = renderAnalysis(analyseAll(context.students));
  const systemPrompt = buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];

  const raw = await chat(messages);

  // Every figure in the reply must trace back to the data we supplied.
  const verification =
    context.students.length > 0 ? verifyNumbers(raw, findings) : { ok: true, invented: [] };

  if (!verification.ok) {
    console.warn(
      `[ai-gateway] invented figures ${verification.invented.join(', ')} — serving fallback`,
    );
  }

  const answer = verification.ok ? raw : deterministicFallback(findings);

  send(res, 200, {
    // Aliases are swapped back only now, after generation.
    reply: restoreNames(answer, context.aliasMap),
    disclaimer: AI_DISCLAIMER,
    meta: {
      role: caller.role,
      studentsInScope: context.students.length,
      provider: config.modelProvider,
      model: config.modelProvider === 'ollama' ? config.ollamaModel : 'stub',
      /** False when the model stated a figure we could not verify. */
      verified: verification.ok,
    },
  });
}

async function handleSuggestions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await authenticate(req.headers.authorization);
  send(res, 200, { prompts: SUGGESTED_PROMPTS[caller.role] ?? [] });
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        const model = await modelHealth();
        send(res, model.ok ? 200 : 503, {
          status: model.ok ? 'ok' : 'degraded',
          provider: config.modelProvider,
          model: model.detail,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/ai/chat') {
        await handleChat(req, res);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/ai/suggestions') {
        await handleSuggestions(req, res);
        return;
      }

      send(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof AuthError) {
        send(res, error.status, { error: error.message });
        return;
      }
      if (error instanceof ModelError) {
        const status = error.kind === 'timeout' ? 504 : 503;
        send(res, status, { error: error.message, kind: error.kind });
        return;
      }
      // Never echo an internal error to the client; it may carry row data.
      console.error('[ai-gateway]', error);
      send(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  })();
});

server.listen(config.port, () => {
  console.log(`ai-gateway listening on http://0.0.0.0:${config.port}`);
  console.log(`  provider: ${config.modelProvider}`);
  if (config.modelProvider === 'ollama') {
    console.log(`  ollama:   ${config.ollamaUrl} (${config.ollamaModel})`);
  }
  console.log(`  supabase: ${config.supabaseUrl}`);
});
