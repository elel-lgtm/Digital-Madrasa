/**
 * Typed access to the EXPO_PUBLIC_* environment.
 *
 * Every value here is inlined into the app bundle at build time and is
 * readable by anyone who unzips the APK. Nothing secret may be added — see
 * apps/mobile/.env.example for the list of things that must never appear.
 *
 * Each variable is referenced literally rather than through a lookup, because
 * Expo's Babel transform substitutes the text `process.env.EXPO_PUBLIC_FOO`
 * at build time. A dynamic `process.env[name]` reads undefined on device.
 */

export type ApiMode = 'mock' | 'supabase';
export type AppEnvironment = 'development' | 'staging' | 'production';

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const rawApiMode = optional(process.env.EXPO_PUBLIC_API_MODE) ?? 'mock';
const rawEnvironment = optional(process.env.EXPO_PUBLIC_ENV) ?? 'development';

export const env = {
  apiMode: (rawApiMode === 'supabase' ? 'supabase' : 'mock') satisfies ApiMode as ApiMode,

  environment: (['development', 'staging', 'production'].includes(rawEnvironment)
    ? rawEnvironment
    : 'development') as AppEnvironment,

  supabaseUrl: optional(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: optional(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),

  /**
   * The AI gateway. On a physical handset this must be the LAN address of the
   * machine running the gateway — `localhost` on a phone is the phone.
   */
  aiGatewayUrl: optional(process.env.EXPO_PUBLIC_AI_GATEWAY_URL),

  sentryDsn: optional(process.env.EXPO_PUBLIC_SENTRY_DSN),
  posthogKey: optional(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  posthogHost: optional(process.env.EXPO_PUBLIC_POSTHOG_HOST),
} as const;

export const isProduction = env.environment === 'production';

/**
 * Fails loudly and early when the app is pointed at Supabase without
 * credentials, rather than surfacing as an opaque network error on whichever
 * screen happens to query first.
 */
export function assertApiConfig(): void {
  if (env.apiMode !== 'supabase') return;

  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!env.supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    throw new Error(
      `EXPO_PUBLIC_API_MODE is "supabase" but ${missing.join(' and ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} not set. Add the values to ` +
        `apps/mobile/.env and restart Metro with --clear.`,
    );
  }

  // A privileged key pasted where the anon key belongs would ship a
  // full-privilege credential to every device. Catch it at startup.
  if (env.supabaseAnonKey?.includes('service_role')) {  // secret-scan-ok
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY looks like a privileged key. ' +
        'It would bypass every RLS policy and must never be bundled. ' +
        'Use the anon/publishable key and rotate the exposed one now.',
    );
  }
}
