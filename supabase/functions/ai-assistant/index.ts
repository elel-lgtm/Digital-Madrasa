import { authenticate } from '../_shared/auth.ts';
import { GeminiError, geminiGenerateAny, modelChain } from '../_shared/gemini.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';
import { analyseAll, renderAnalysis } from '../../../services/ai-gateway/src/analysis.ts';
import { buildContext, restoreNames } from '../../../services/ai-gateway/src/context.ts';
import {
  AI_DISCLAIMER, buildSystemPrompt, SUGGESTED_PROMPTS,
} from '../../../services/ai-gateway/src/prompt.ts';
import { deterministicFallback, verifyNumbers } from '../../../services/ai-gateway/src/verify.ts';

/**
 * The assistant, hosted.
 *
 * The same pipeline as services/ai-gateway, and the same modules, so the
 * assistant no longer needs a computer on the user's own network:
 *
 *   POST { message, context? }  an answer from the caller's own records
 *   GET                         suggested questions for the caller's role
 *
 * What keeps it safe is unchanged. Records are read with `caller.db`, as the
 * signed-in user, so RLS decides what any question can see; the privileged
 * client is used for the rate-limit counter and nothing else. Pupils reach
 * the model as "Student A", never by name. Every figure in the reply must be
 * one we supplied, or the plain summary is served instead.
 */

interface Body {
  message?: unknown;
  context?: { selectedChildId?: unknown };
}

Deno.serve(handler(async (req) => {
  const caller = await authenticate(req);

  if (req.method === 'GET') {
    return json({ prompts: SUGGESTED_PROMPTS[caller.role] ?? [] });
  }
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  await rateLimit(caller.admin, `ai:${caller.userId}`, LIMITS.aiChat);

  const body = await readJson<Body>(req);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) throw new PublicError(400, 'validation', 'A message is required.');
  if (message.length > 2000) throw new PublicError(400, 'validation', 'That question is too long.');

  // The only thing taken from the body is a narrowing hint. It cannot widen
  // access: an id outside what RLS returned simply matches nothing.
  const selectedStudentId =
    typeof body.context?.selectedChildId === 'string' ? body.context.selectedChildId : undefined;

  const context = await buildContext(caller, { selectedStudentId });
  const findings = renderAnalysis(analyseAll(context.students));

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const models = modelChain(Deno.env.get('GEMINI_MODEL'), Deno.env.get('GEMINI_FALLBACK_MODELS'));
  let model = 'summary';

  let answer = deterministicFallback(findings);
  let provider = 'summary';
  let verified = true;

  if (apiKey) {
    try {
      const { text: raw, model: answeredBy } = await geminiGenerateAny({
        apiKey,
        system: buildSystemPrompt(context),
        parts: [{ text: message }],
        temperature: 0.3,
        // Generous: the model's reasoning is counted against it. The prompt asks for brevity.
        maxOutputTokens: 4096,
        timeoutMs: 20_000,
      }, models);

      // Every figure in the reply must trace back to the data we supplied.
      const check = context.students.length > 0 ? verifyNumbers(raw, findings) : { ok: true, invented: [] };
      verified = check.ok;
      if (check.ok) {
        answer = raw;
        provider = 'gemini';
        model = answeredBy;
      } else {
        console.warn(`[ai-assistant] invented figures ${check.invented.join(', ')}; serving the summary`);
      }
    } catch (error) {
      if (!(error instanceof GeminiError)) throw error;
      // The free tier runs out of requests. The user's own records, plainly
      // summarised, are a better answer than an error.
      console.error(`[ai-assistant] model ${error.kind}: ${error.message}`);
    }
  }

  if (provider === 'summary' && context.students.length === 0) {
    answer = 'I do not have any student records available for your account yet.';
  }

  return json({
    // Aliases are swapped back only now, after generation.
    reply: restoreNames(answer, context.aliasMap),
    disclaimer: AI_DISCLAIMER,
    meta: {
      role: caller.role,
      studentsInScope: context.students.length,
      provider,
      model,
      /** False when the model stated a figure we could not verify. */
      verified,
    },
  });
}));
