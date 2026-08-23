// URL and URLSearchParams are missing from the Hermes runtime, and supabase-js
// builds request URLs with them. Must be imported before the client.
import 'react-native-url-polyfill/auto';

import type { Database } from '@digital-madrasa/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from '@/config/env';
import { secureStorageAdapter } from './storage-adapter';

/**
 * The Supabase client.
 *
 * Ships with the anon key only. Every request it makes is still judged by RLS,
 * so this key grants nothing on its own — the privileged key exists solely in
 * Edge Function secrets and must never appear in this bundle.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl ?? '',
  env.supabaseAnonKey ?? '',
  {
    auth: {
      storage: secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar for a callback to land in, so the client
      // must not try to read one.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-client-info': 'digital-madrasa-mobile' },
    },
  },
);

/**
 * Refresh only while the app is in the foreground.
 *
 * Left running in the background, the timer fires on a device that may have no
 * connectivity, burning retries and battery for a token nobody is using.
 */
let appStateBound = false;

export function bindAuthRefreshToAppState(): void {
  if (appStateBound) return;
  appStateBound = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
