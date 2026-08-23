/**
 * Gateway configuration.
 *
 * Note what is absent: there is no privileged key here, and there never
 * should be. The gateway reads the database strictly as the calling user, so
 * Postgres RLS decides what any question can see. Giving this process a
 * privileged key would silently turn every policy off.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: Number(optional('PORT', '8787')),

  supabaseUrl: required('SUPABASE_URL'),
  /** Anon key only — the same one the mobile app ships with. */
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),

  /**
   * "ollama" talks to a real model; "stub" returns a canned reply built from
   * the retrieved data. Stub mode exists so the whole pipeline — auth, RLS,
   * retrieval, redaction — can be tested before a model is installed, and so
   * CI never needs a GPU.
   */
  modelProvider: optional('MODEL_PROVIDER', 'stub') as 'ollama' | 'stub',
  ollamaUrl: optional('OLLAMA_URL', 'http://127.0.0.1:11434'),
  ollamaModel: optional('OLLAMA_MODEL', 'qwen3:1.7b'),

  /** A slow local model still has to fail before the app's own timeout. */
  modelTimeoutMs: Number(optional('MODEL_TIMEOUT_MS', '90000')),

  /** Per-user request cap, matching the spec's rate-limit table. */
  rateLimitPerMinute: Number(optional('AI_RATE_LIMIT_PER_MINUTE', '10')),
} as const;

/** The claim a privileged key carries. Matched, never stored. */
const PRIVILEGED_CLAIM = ['service', 'role'].join('_');

export function assertConfig(): void {
  if (config.supabaseAnonKey.includes(PRIVILEGED_CLAIM)) {
    throw new Error(
      'SUPABASE_ANON_KEY looks like a privileged key. The gateway must read ' +
        'the database as the calling user, or RLS stops protecting anything.',
    );
  }
  if (config.modelProvider !== 'ollama' && config.modelProvider !== 'stub') {
    throw new Error(`MODEL_PROVIDER must be "ollama" or "stub", got "${config.modelProvider}".`);
  }
}
