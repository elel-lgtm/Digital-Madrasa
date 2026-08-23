import { assertApiConfig, env, type ApiMode } from '@/config/env';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';
import type { ApiClient } from './types';

/**
 * The app talks to exactly one object: `api`.
 *
 * Today it resolves to the in-memory mock. When Supabase is wired up, add a
 * `supabase.ts` implementing the same `ApiClient` interface and select it on
 * `apiMode` — no screen, hook or query key has to change.
 */
export type { ApiMode };

export const apiMode: ApiMode = env.apiMode;

// Validates the pairing of mode and credentials before anything queries.
assertApiConfig();

export const api: ApiClient = apiMode === 'supabase' ? supabaseApi : mockApi;

export { ApiError } from './types';
export type {
  ApiClient,
  ApiErrorCode,
  ChildBalance,
  ChildOverview,
  FeesSummary,
  HifzSummary,
  PaymentIntent,
  SearchResults,
  StudentDashboard,
  StudentDetail,
  StudentListParams,
  TeacherDashboard,
} from './types';
export { DEMO_ACCOUNTS } from './seed';
export { resetMockData } from './mock';
