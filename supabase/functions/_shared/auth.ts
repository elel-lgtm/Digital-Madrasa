import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { PublicError } from './http.ts';

/**
 * Identity and the two database clients an Edge Function may hold.
 *
 * The distinction matters more than anything else in this folder:
 *
 *   caller.db    reads as the signed-in user. RLS applies. Use it for every
 *                read, and for any write the user is genuinely allowed to make.
 *
 *   caller.admin bypasses RLS entirely. Use it only for the specific privileged
 *                step a function exists to perform — minting a login, allocating
 *                an invoice number — and never to fetch data on the user's
 *                behalf, or the tenancy model silently stops applying.
 */

export type Role = 'admin' | 'teacher' | 'student' | 'parent';

export interface Caller {
  userId: string;
  role: Role;
  madrasaId: string | null;
  fullName: string;
  email: string;
  isPlatformAdmin: boolean;
  db: SupabaseClient;
  admin: SupabaseClient;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticate(req: Request): Promise<Caller> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new PublicError(401, 'unauthenticated', 'Missing bearer token.');

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    throw new PublicError(401, 'unauthenticated', 'Your session has expired.');
  }

  const { data: profile } = await db
    .from('profiles')
    .select('id, role, madrasa_id, full_name, email, is_platform_admin, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!profile) throw new PublicError(403, 'forbidden', 'No profile for this account.');
  if (profile.is_active === false) {
    throw new PublicError(403, 'forbidden', 'This account is deactivated.');
  }

  return {
    userId: profile.id,
    role: profile.role,
    madrasaId: profile.madrasa_id,
    fullName: profile.full_name ?? '',
    email: profile.email ?? userData.user.email ?? '',
    isPlatformAdmin: Boolean(profile.is_platform_admin),
    db,
    admin: adminClient(),
  };
}

/** Staff of a madrasa, with the teacher row loaded. */
export async function requireStaff(caller: Caller) {
  if (caller.role !== 'teacher') {
    throw new PublicError(403, 'forbidden', 'Only madrasa staff can do that.');
  }
  const { data: teacher } = await caller.db
    .from('teachers')
    .select('id, is_owner, madrasa_id')
    .eq('profile_id', caller.userId)
    .maybeSingle();

  if (!teacher) throw new PublicError(403, 'forbidden', 'No staff record for this account.');
  return teacher;
}

export async function requireOwner(caller: Caller) {
  const teacher = await requireStaff(caller);
  if (!teacher.is_owner) {
    throw new PublicError(403, 'forbidden', 'Only the madrasa owner can do that.');
  }
  return teacher;
}

/**
 * Blocks administrative work once a subscription has lapsed.
 *
 * Mirrors `madrasa_subscription_allows_admin` in migration 0010 — grace still
 * counts as allowed, because locking a school out the moment a card fails
 * punishes children for an adult's billing problem.
 */
export async function requireActiveSubscription(caller: Caller, madrasaId: string) {
  const { data } = await caller.admin
    .from('subscriptions')
    .select('status')
    .eq('madrasa_id', madrasaId)
    .maybeSingle();

  const allowed = ['trialing', 'active', 'past_due', 'grace'];
  if (data && !allowed.includes(data.status)) {
    throw new PublicError(
      403,
      'subscription_lapsed',
      'This madrasa\u2019s subscription has lapsed. Renew to continue.',
    );
  }
}
