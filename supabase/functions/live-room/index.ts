import { authenticate } from '../_shared/auth.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Video and sound for a live lesson, inside the app (Daily.co).
 *
 *   POST { lessonId }  ->  { url, token }
 *
 * The lesson is read as the caller, so RLS decides whether they belong to
 * its madrasa; nobody else gets a token. Each lesson has one private room,
 * made on first use and expiring after the day. The token names the caller
 * (so the teacher sees who is who) and makes the teacher the room's owner,
 * able to mute and remove; pupils join with camera and microphone off and
 * switch them on themselves. The Daily key stays in the server's secrets.
 */

const DAILY = 'https://api.daily.co/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(handler(async (req) => {
  const caller = await authenticate(req);
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');
  if (caller.role !== 'teacher' && caller.role !== 'student') {
    throw new PublicError(403, 'forbidden', 'Live lessons are for teachers and pupils.');
  }

  const body = await readJson<{ lessonId?: unknown }>(req);
  const lessonId = typeof body.lessonId === 'string' && UUID.test(body.lessonId) ? body.lessonId : null;
  if (!lessonId) throw new PublicError(400, 'validation', 'Choose a lesson.');

  await rateLimit(caller.admin, `live:${caller.userId}`, LIMITS.generic);

  const { data: lesson } = await caller.db.from('lessons').select('id, title').eq('id', lessonId).maybeSingle();
  if (!lesson) throw new PublicError(404, 'not_found', 'That lesson was not found.');

  // Off unless deliberately switched on: no paid service is called otherwise.
  const key = Deno.env.get('LIVE_VIDEO_ENABLED') === 'true' ? Deno.env.get('DAILY_API_KEY') : undefined;
  if (!key) throw new PublicError(503, 'video_not_configured', 'Video is not set up for this madrasa yet.');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const name = `ilmora-${lessonId.replace(/-/g, '').slice(0, 24)}`;
  const now = Math.floor(Date.now() / 1000);

  let room = await fetch(`${DAILY}/rooms/${name}`, { headers });
  if (room.status === 404) {
    room = await fetch(`${DAILY}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        privacy: 'private',
        properties: {
          exp: now + 12 * 3600,
          eject_at_room_exp: true,
          enable_chat: false,
          enable_knocking: false,
          enable_prejoin_ui: false,
          lang: 'en',
        },
      }),
    });
  }
  if (!room.ok) {
    console.error('[live-room] room', room.status, (await room.text()).slice(0, 200));
    throw new PublicError(502, 'video_unavailable', 'The video service did not answer. Please try again.');
  }
  const { url } = await room.json() as { url: string };

  const teacher = caller.role === 'teacher';
  const token = await fetch(`${DAILY}/meeting-tokens`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      properties: {
        room_name: name,
        user_name: caller.fullName || (teacher ? 'Teacher' : 'Pupil'),
        user_id: caller.userId,
        is_owner: teacher,
        exp: now + 4 * 3600,
        start_video_off: !teacher,
        start_audio_off: !teacher,
        enable_screenshare: teacher,
      },
    }),
  });
  if (!token.ok) {
    console.error('[live-room] token', token.status, (await token.text()).slice(0, 200));
    throw new PublicError(502, 'video_unavailable', 'The video service did not answer. Please try again.');
  }
  const { token: meetingToken } = await token.json() as { token: string };

  return json({ url, token: meetingToken });
}));
