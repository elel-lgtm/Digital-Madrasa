import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.ts';

/**
 * Identity and data access, both derived from the caller's own token.
 *
 * The request body is never consulted for who the user is or what they may
 * see. A client can claim `{"role":"admin"}` all it likes; the only thing that
 * counts is the bearer token, and the only thing that reads the database is a
 * client carrying that same token.
 */

export type Role = 'admin' | 'teacher' | 'student' | 'parent';

export interface Caller {
  userId: string;
  role: Role;
  madrasaId: string | null;
  fullName: string;
  isPlatformAdmin: boolean;
  /** Reads the database as this user. Every query is subject to their RLS. */
  db: SupabaseClient;
}

export class AuthError extends Error {
  // Written out rather than as a parameter property: Node's type-stripping
  // runs without a compiler and does not support that shorthand.
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies the bearer token and loads the caller's profile.
 *
 * Verification is delegated to Supabase rather than done here with a local
 * secret. That costs one round trip and removes a whole class of mistakes:
 * no JWT library to misconfigure, no algorithm confusion, no key rotation to
 * track, and a revoked session stops working immediately rather than at token
 * expiry.
 */
export async function authenticate(authorizationHeader: string | undefined): Promise<Caller> {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new AuthError(401, 'Missing bearer token.');

  // Every request builds its own client bound to the caller's token, so two
  // concurrent requests can never borrow each other's permissions.
  const db = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new AuthError(401, 'Your session has expired.');

  // The profile is read through the same RLS-bound client, so this doubles as
  // a check that the account is still readable — a suspended madrasa fails here.
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, role, madrasa_id, full_name, is_platform_admin, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) throw new AuthError(403, 'Could not read your profile.');
  if (!profile) throw new AuthError(403, 'No profile for this account.');
  if (profile.is_active === false) throw new AuthError(403, 'This account is deactivated.');

  return {
    userId: profile.id as string,
    role: profile.role as Role,
    madrasaId: (profile.madrasa_id as string | null) ?? null,
    fullName: (profile.full_name as string) ?? '',
    isPlatformAdmin: Boolean(profile.is_platform_admin),
    db,
  };
}
