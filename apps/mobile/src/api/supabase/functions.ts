import { ApiError, type ApiErrorCode } from '../types';
import { supabase } from './client';

/**
 * The client boundary for Supabase Edge Functions.
 *
 * Every privileged operation the app cannot perform directly goes through here.
 * It deliberately reuses the single `supabase` client from `./client`, which
 * already holds the signed-in session — so the caller's JWT travels with the
 * request and the function derives identity from it. There is no second client
 * and no credential handling in this file.
 *
 * What this module is responsible for:
 *   - attaching the session (via the shared client)
 *   - turning an Edge Function's `{ error, code }` body into an `ApiError`
 *     that the existing screens already know how to render
 *   - never surfacing raw server detail for unexpected failures
 */

/**
 * Edge Functions report failures with their own vocabulary. This maps them
 * onto the app's error model so screens keep behaving as they already do.
 * Anything unrecognised becomes `unknown` rather than being passed through.
 */
const CODE_MAP: Record<string, ApiErrorCode> = {
  validation: 'validation',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
  rate_limited: 'rate_limited',
  unauthenticated: 'invalid_credentials',
  subscription_lapsed: 'subscription_lapsed',
  // A parent supplying an admission number that does not resolve. The server
  // deliberately returns one generic message for every cause, so the client
  // must not try to be more specific than it was told.
  link_failed: 'not_found',
  // Kept distinct rather than folded into validation/forbidden: "that code has
  // expired, ask for a fresh one" and "that code is for another class" need
  // different actions from the student, and the generic copy for those two
  // codes would tell them neither. The server's own wording cannot be used
  // instead — it is English only, and this app ships in four languages.
  expired_code: 'expired_code',
  wrong_class: 'wrong_class',
  // A fee that belongs to one class or one pupil, asked to bill wider. The
  // generic validation copy would not say which fee or which way it is wrong.
  scope_mismatch: 'scope_mismatch',
  // The typed-back name did not match: a validation problem with the form.
  confirm_mismatch: 'validation',
  purge_failed: 'conflict',
  card_unavailable: 'card_unavailable',
  payment_in_progress: 'payment_in_progress',
  payment_provider: 'payment_provider',
  method: 'unknown',
  internal: 'unknown',
};

interface EdgeErrorBody {
  error?: string;
  code?: string;
}

export interface InvokeOptions {
  /** Appended to the function name as a query string, for GET endpoints. */
  query?: Record<string, string>;
  method?: 'POST' | 'GET';
  body?: Record<string, unknown>;
}

/**
 * Calls an Edge Function and returns its parsed body.
 *
 * `supabase.functions.invoke` surfaces non-2xx responses as an error whose
 * body must be read separately, so the response is unwrapped here and turned
 * into the same `ApiError` the rest of the data layer throws.
 */
export async function invokeFunction<T>(name: string, options: InvokeOptions = {}): Promise<T> {
  // A missing session is worth catching before the round trip: the function
  // would reject it anyway, and this produces the error the app expects.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new ApiError('invalid_credentials', 'Your session has expired. Sign in again.');
  }

  const query = options.query
    ? `?${new URLSearchParams(options.query).toString()}`
    : '';

  const { data, error } = await supabase.functions.invoke<T>(`${name}${query}`, {
    method: options.method ?? 'POST',
    ...(options.body !== undefined ? { body: options.body } : {}),
  });

  if (error) {
    // A request that never reached the server has no response to unwrap.
    // supabase-js reports that as FunctionsFetchError, and it must not become a
    // generic "something went wrong" — the app already has offline copy, and on
    // the networks this is built for the distinction is the whole message.
    if ((error as { name?: string }).name === 'FunctionsFetchError') {
      throw new ApiError('network', 'We could not reach the server.');
    }

    // supabase-js wraps the HTTP response; the function's own JSON body holds
    // the code and the message intended for the user.
    const response = (error as { context?: Response }).context;
    let parsed: EdgeErrorBody = {};

    if (response && typeof response.json === 'function') {
      parsed = await response.json().catch(() => ({}) as EdgeErrorBody);
    }

    const code = CODE_MAP[parsed.code ?? ''] ?? 'unknown';
    const message =
      parsed.error ??
      // Never echo the transport-level message: it can carry internals.
      'That could not be completed. Please try again.';

    throw new ApiError(code, message);
  }

  if (data === null || data === undefined) {
    throw new ApiError('unknown', 'The server returned an empty response.');
  }

  return data;
}
