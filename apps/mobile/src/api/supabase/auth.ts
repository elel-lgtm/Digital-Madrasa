import type {
  Madrasa,
  Profile,
  RegisterMadrasaInput,
  RegisterParentInput,
  Session,
  SignInInput,
  Student,
  Teacher,
} from '@digital-madrasa/shared';
import { ApiError } from '../types';
import type { PasswordResetChallenge } from '../types';
import { supabase } from './client';
import { mapMadrasa, mapProfile, mapStudent, mapTeacher } from './mappers';

/**
 * Auth against Supabase.
 *
 * Two rules hold throughout, and both are enforced by the database rather than
 * by anything here:
 *
 *   - `role`, `madrasa_id` and `is_platform_admin` are never sent by the client.
 *     They are set server-side and RLS forbids a user changing their own.
 *   - There is no code path that creates a platform admin. Public signup makes
 *     madrasa owners and parents, nothing else.
 */

function fail(error: { message: string; status?: number } | null, fallback: string): never {
  const message = error?.message ?? fallback;
  if (error?.status === 429 || /rate limit/i.test(message)) {
    throw new ApiError('rate_limited', 'Too many attempts. Please wait and try again.');
  }
  if (/invalid login credentials/i.test(message)) {
    throw new ApiError('invalid_credentials', 'Email or password is incorrect.');
  }
  if (/email not confirmed/i.test(message)) {
    throw new ApiError('forbidden', 'Confirm your email address before signing in.');
  }
  throw new ApiError('unknown', message);
}

/** Assembles the session the app consumes from the signed-in user's rows. */
export async function buildSession(userId: string): Promise<Session> {
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) fail(error, 'Could not load your profile.');
  if (!profileRow) throw new ApiError('not_found', 'No profile for this account.');

  const profile: Profile = mapProfile(profileRow);

  let madrasa: Madrasa | null = null;
  if (profile.madrasaId) {
    const { data } = await supabase
      .from('madrasas')
      .select('*')
      .eq('id', profile.madrasaId)
      .maybeSingle();
    madrasa = data ? mapMadrasa(data) : null;
  }

  let student: Student | null = null;
  let teacher: Teacher | null = null;
  let children: Student[] = [];

  if (profile.role === 'student') {
    const { data } = await supabase
      .from('students')
      .select('*, profiles!students_profile_id_fkey(full_name)')
      .eq('profile_id', userId)
      .maybeSingle();
    student = data ? mapStudent(data) : null;
  }

  if (profile.role === 'teacher') {
    const { data } = await supabase
      .from('teachers')
      .select('*, profiles!teachers_profile_id_fkey(full_name, email, phone, avatar_url)')
      .eq('profile_id', userId)
      .maybeSingle();
    teacher = data ? mapTeacher(data) : null;
  }

  if (profile.role === 'parent') {
    // RLS already restricts this to approved links; the filter is an
    // optimisation, not the security boundary.
    const { data } = await supabase
      .from('students')
      .select('*, profiles!students_profile_id_fkey(full_name)');
    children = (data ?? []).map(mapStudent);
  }

  // The platform admin belongs to no madrasa, so there are no flags to read
  // (an empty id is not a uuid and the request would be refused).
  const { data: flags } = profile.madrasaId
    ? await supabase.from('feature_flags').select('*').eq('madrasa_id', profile.madrasaId).maybeSingle()
    : { data: null };

  return {
    user: profile,
    madrasa,
    children,
    student,
    teacher,
    featureFlags: {
      aiEvaluation: flags?.ai_evaluation ?? true,
      payments: flags?.payments ?? true,
      leaderboard: flags?.leaderboard ?? false,
      offlineMode: flags?.offline_mode ?? true,
      smsFallback: flags?.sms_fallback ?? true,
    },
    issuedAt: new Date().toISOString(),
  };
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) return null;
  try {
    return await buildSession(data.session.user.id);
  } catch {
    // A token that no longer resolves to a profile is not a usable session.
    await supabase.auth.signOut();
    return null;
  }
}

export async function signIn(input: SignInInput): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  if (error) fail(error, 'Could not sign you in.');
  if (!data.user) throw new ApiError('invalid_credentials', 'Email or password is incorrect.');
  return buildSession(data.user.id);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Madrasa owner signup.
 *
 * Creating the auth user, the profile, the madrasa, the teacher record and the
 * trial subscription is a single unit of work that must not half-happen — a
 * user with no madrasa can neither use the app nor sign up again with the same
 * email. It therefore runs in a `SECURITY DEFINER` function behind one RPC,
 * not as a sequence of client-side inserts.
 */
export async function registerMadrasa(input: RegisterMadrasaInput): Promise<Session> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      // These values are read by the `handle_new_auth_user` trigger, which
      // creates the profile, madrasa and teacher rows inside the signup
      // transaction. Doing it here rather than through an RPC is what makes
      // signup work with email confirmation enabled: there is no session
      // until the address is confirmed, so a client call would arrive as
      // `anon` and be refused.
      //
      // Everything here is the user's own particulars. Role, madrasa_id and
      // is_platform_admin are set by the trigger and are not addressable from
      // this payload.
      data: {
        signup_kind: 'madrasa_owner',
        full_name: input.ownerName,
        phone: input.phone,
        madrasa_name: input.madrasaName,
        county: input.county,
        town: input.town,
        locale: input.locale,
      },
    },
  });
  if (error) fail(error, 'Could not create your account.');
  if (!data.user) throw new ApiError('unknown', 'Signup did not return a user.');

  if (!data.session) {
    throw new ApiError('email_confirmation_required', 'Check your email to confirm your account.');
  }
  return buildSession(data.user.id);
}

export async function registerParent(input: RegisterParentInput): Promise<Session> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        signup_kind: 'parent',
        full_name: input.fullName,
        phone: input.phone,
        locale: input.locale,
      },
    },
  });
  if (error) fail(error, 'Could not create your account.');
  if (!data.user) throw new ApiError('unknown', 'Signup did not return a user.');

  if (!data.session) {
    throw new ApiError('email_confirmation_required', 'Check your email to confirm your account.');
  }
  return buildSession(data.user.id);
}

// ------------------------------------------------------------ password reset

/**
 * Sends the 6-digit recovery code.
 *
 * Resolves identically whether or not the address exists — Supabase does the
 * same — so this endpoint cannot be used to enumerate accounts.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetChallenge> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error && error.status === 429) {
    throw new ApiError('rate_limited', 'Too many requests. Try again in a little while.');
  }
  // mailer_otp_exp is 1800s; see scripts/auth-config.mjs.
  return { expiresInSeconds: 1800 };
}

export async function verifyPasswordResetOtp(input: {
  email: string;
  code: string;
}): Promise<{ resetToken: string }> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: input.email.trim(),
    token: input.code,
    type: 'recovery',
  });
  if (error) {
    if (/expired/i.test(error.message)) {
      throw new ApiError('validation', 'That code has expired. Request a new one.');
    }
    throw new ApiError('validation', 'That code is not correct.');
  }
  if (!data.session) throw new ApiError('validation', 'That code is not correct.');

  // Verification returns a real session; the app treats its access token as
  // the short-lived authorisation for the password change that follows.
  return { resetToken: data.session.access_token };
}

export async function resetPassword(input: { password: string }): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) fail(error, 'Could not update your password.');
  // Signing out forces every other device to re-authenticate.
  await supabase.auth.signOut({ scope: 'global' });
}

export async function updateProfile(
  input: Partial<Pick<Profile, 'fullName' | 'phone' | 'locale'>>,
): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new ApiError('forbidden', 'You are not signed in.');

  // Only these three columns. Listing them explicitly is what stops a future
  // edit from letting `role` or `madrasa_id` through — RLS would reject it,
  // but the client should not be trying.
  const patch: { full_name?: string; phone?: string | null; locale?: string } = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.locale !== undefined) patch.locale = input.locale;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', auth.user.id)
    .select()
    .single();

  if (error) fail(error, 'Could not save your profile.');
  return mapProfile(data);
}
