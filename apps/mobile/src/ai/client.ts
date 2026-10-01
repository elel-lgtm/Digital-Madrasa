import type { Role } from '@digital-madrasa/shared';
import { apiMode } from '@/api';
import { supabase } from '@/api/supabase';
import { env } from '@/config/env';

/**
 * Talks to the assistant.
 *
 * By default that is the hosted `ai-assistant` Edge Function, so the assistant
 * works wherever the app does. Setting EXPO_PUBLIC_AI_GATEWAY_URL points it at
 * a self-hosted gateway (services/ai-gateway) instead, for running against a
 * local model. Both speak the same request and reply.
 *
 * Deliberately not part of `ApiClient`: an assistant that is down must not
 * make every Supabase-mode screen appear broken.
 *
 * The request carries the user's Supabase access token and nothing else. No
 * role, no madrasa id, no user id — the server derives all of that from the
 * token, and anything this client claimed would be ignored.
 */

export interface AiReply {
  reply: string;
  disclaimer: string;
  meta: {
    role: Role;
    studentsInScope: number;
    provider: string;
    model: string;
  };
}

export type AiErrorKind =
  | 'not_configured'
  | 'unauthenticated'
  | 'unreachable'
  | 'model_unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'failed';

export class AiError extends Error {
  kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface AskOptions {
  message: string;
  /** Narrows to one child. Cannot widen access — the gateway re-checks. */
  selectedChildId?: string | null;
  signal?: AbortSignal;
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError('unauthenticated', 'Sign in again to use the assistant.');
  return token;
}

async function httpAsk({ message, selectedChildId, signal }: AskOptions): Promise<AiReply> {
  const url = env.aiGatewayUrl
    ? `${env.aiGatewayUrl}/api/ai/chat`
    : env.supabaseUrl
      ? `${env.supabaseUrl}/functions/v1/ai-assistant`
      : null;
  if (!url) throw new AiError('not_configured', 'The assistant is not configured.');

  const token = await accessToken();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // The Edge Function gateway wants the project's public key as well.
        ...(env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {}),
      },
      body: JSON.stringify({
        message,
        context: selectedChildId ? { selectedChildId } : undefined,
      }),
      signal,
    });
  } catch {
    throw new AiError('unreachable', 'Could not reach the assistant. Check your connection.');
  }

  if (res.status === 401) throw new AiError('unauthenticated', 'Sign in again to continue.');
  if (res.status === 429) {
    throw new AiError('rate_limited', 'You have asked a lot of questions. Wait a moment.');
  }
  if (res.status === 504) {
    throw new AiError('timeout', 'The assistant took too long. Try a shorter question.');
  }
  if (res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AiError('model_unavailable', body.error ?? 'The assistant is unavailable.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AiError('failed', body.error ?? 'The assistant could not answer that.');
  }

  return (await res.json()) as AiReply;
}

/**
 * Mock client, used when the app runs on mock data.
 *
 * Without it the whole assistant UI would be undevelopable in mock mode, since
 * the real gateway needs a genuine Supabase session to authenticate.
 */
async function mockAsk({ message }: AskOptions): Promise<AiReply> {
  await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 900));

  if (/error|fail/i.test(message)) {
    throw new AiError('failed', 'The assistant could not answer that.');
  }

  return {
    reply:
      `[demo] You asked: "${message}"\n\n` +
      'Running on demo data, so this is a canned reply. Switch ' +
      'EXPO_PUBLIC_API_MODE to "supabase" and start the AI gateway for a real answer.',
    disclaimer: 'AI guidance assists study; your teacher’s assessment is final.',
    meta: { role: 'student', studentsInScope: 1, provider: 'mock', model: 'mock' },
  };
}

export const ai = {
  ask: apiMode === 'supabase' ? httpAsk : mockAsk,
  isConfigured: apiMode !== 'supabase' || Boolean(env.aiGatewayUrl || env.supabaseUrl),
};
