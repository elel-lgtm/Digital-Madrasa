/**
 * HTTP helpers shared by every Edge Function.
 *
 * The app calls these from a mobile client, so CORS has to be handled, and
 * errors must never echo internal detail — a Postgres message can carry row
 * data, and these endpoints sit in front of children's records.
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

/** A failure the caller is allowed to see. Anything else becomes a generic 500. */
export class PublicError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: CORS_HEADERS }) : null;
}

/**
 * Wraps a handler so every function reports failures identically and nothing
 * internal leaks. Unexpected errors are logged server-side and reduced to a
 * generic message for the client.
 */
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const pre = preflight(req);
    if (pre) return pre;

    try {
      return await fn(req);
    } catch (error) {
      if (error instanceof PublicError) {
        const headers = error.code === 'rate_limited' ? { 'Retry-After': '60' } : {};
        return json({ error: error.message, code: error.code }, error.status, headers);
      }
      console.error('[edge]', error);
      return json({ error: 'Something went wrong. Please try again.', code: 'internal' }, 500);
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new PublicError(400, 'validation', 'Expected a JSON body.');
  }
}
