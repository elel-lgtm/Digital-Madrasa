/**
 * Live session links.
 *
 * A madrasa runs its live classes on whatever it already has — Google Meet,
 * Teams or Zoom — so we store a link rather than embedding a video stack.
 *
 * The host allowlist is a security control, not a convenience: a lesson link
 * is shown to children and tapped without much thought, so an arbitrary URL
 * pasted into that field would be a phishing vector. Anything outside this
 * list is rejected at the schema layer, on both the client and the server.
 */

export const MEETING_PROVIDERS = ['google_meet', 'teams', 'zoom', 'jitsi'] as const;
export type MeetingProvider = (typeof MEETING_PROVIDERS)[number];

export const MEETING_PROVIDER_LABEL: Record<MeetingProvider, string> = {
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  jitsi: 'Jitsi Meet',
};

/**
 * Identifies the provider behind a meeting URL, or `null` if the host is not
 * one we allow. Callers treat `null` as "reject this link".
 */
export function meetingProvider(rawUrl: string): MeetingProvider | null {
  let host: string;
  try {
    const parsed = new URL(rawUrl.trim());
    // Meeting links are always https. An http link would be downgraded and
    // is far more likely to be spoofed than genuine.
    if (parsed.protocol !== 'https:') return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host === 'meet.google.com') return 'google_meet';
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'teams';
  if (host.endsWith('teams.microsoft.com')) return 'teams';
  // Zoom hands out numbered regional subdomains: us02web.zoom.us and friends.
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'zoom';
  if (host === 'meet.jit.si') return 'jitsi';

  return null;
}

export function isMeetingUrl(rawUrl: string): boolean {
  return meetingProvider(rawUrl) !== null;
}

/**
 * Who may attach, change or remove a lesson's live link: the teacher of that
 * lesson's class, or the madrasa owner.
 *
 * Replacing a link is enough to redirect a class of children to a room you
 * control, so this is not a cosmetic check. The same rule has to hold in the
 * RLS policy — this helper exists so the screen and the server express it
 * once rather than drifting apart.
 */
export function canManageMeetingLink(
  lessonTeacherId: string | null,
  viewer: { id: string; isOwner: boolean } | null,
): boolean {
  if (!viewer) return false;
  return viewer.isOwner || (lessonTeacherId !== null && lessonTeacherId === viewer.id);
}

/**
 * Whether the viewer is the one running this session. An owner dropping into
 * another teacher's class is a guest there, and the button should say so.
 */
export function isSessionHost(
  lessonTeacherId: string | null,
  viewer: { id: string } | null,
): boolean {
  return Boolean(viewer && lessonTeacherId && lessonTeacherId === viewer.id);
}

export type LiveSessionState = 'upcoming' | 'starting_soon' | 'live' | 'ended';

/** How early the Join button appears, and how long it stays after the start. */
export const JOIN_OPENS_MINUTES_BEFORE = 15;
export const SESSION_ASSUMED_MINUTES = 90;

/**
 * Where a scheduled lesson sits relative to now. Drives whether the student
 * sees a countdown, a live Join button, or nothing at all — so nobody taps
 * into an empty room an hour after class ended.
 */
export function liveSessionState(
  scheduledFor: string | null,
  now: Date = new Date(),
): LiveSessionState {
  if (!scheduledFor) return 'upcoming';

  const start = new Date(scheduledFor).getTime();
  const current = now.getTime();
  const opensAt = start - JOIN_OPENS_MINUTES_BEFORE * 60_000;
  const endsAt = start + SESSION_ASSUMED_MINUTES * 60_000;

  if (current >= endsAt) return 'ended';
  if (current >= start) return 'live';
  if (current >= opensAt) return 'starting_soon';
  return 'upcoming';
}

export function minutesUntil(scheduledFor: string, now: Date = new Date()): number {
  return Math.max(0, Math.round((new Date(scheduledFor).getTime() - now.getTime()) / 60_000));
}
