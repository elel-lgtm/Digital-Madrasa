import type { HalaqaMark, HalaqaParticipant, HalaqaState } from '@digital-madrasa/shared';
import { env } from '@/config/env';

/**
 * The live room's wire. On the real backend it is a private Supabase
 * Realtime channel ('halaqa:<lesson id>'), which migration 0037 opens only to
 * the lesson's own madrasa: presence says who is in the room and whose hand
 * is up; broadcasts carry the teacher's state and the reader's "next ayah".
 * In demo mode a few classmates are simulated so the room can be shown on
 * one device.
 */

export type HalaqaEvent =
  | { type: 'state'; state: HalaqaState }
  | { type: 'hello' }
  | { type: 'advance'; by: number; fromUserId: string }
  | { type: 'marked'; studentName: string; mark: HalaqaMark };

export interface HalaqaChannel {
  onPeople(cb: (people: HalaqaParticipant[]) => void): void;
  onEvent(cb: (event: HalaqaEvent) => void): void;
  send(event: HalaqaEvent): void;
  updateMe(patch: Partial<HalaqaParticipant>): void;
  close(): void;
}

export async function openHalaqaChannel(
  lessonId: string,
  me: HalaqaParticipant,
  classmates: { userId: string; name: string; studentId: string }[],
): Promise<HalaqaChannel> {
  if (env.apiMode === 'supabase') return openRealtime(lessonId, me);
  return openSimulated(me, classmates);
}

async function openRealtime(lessonId: string, me: HalaqaParticipant): Promise<HalaqaChannel> {
  const { supabase } = await import('@/api/supabase/client');
  // Private channels authorise with the signed-in user's token (0037's policies).
  await supabase.realtime.setAuth();
  const channel = supabase.channel(`halaqa:${lessonId}`, {
    config: { private: true, broadcast: { self: false, ack: false }, presence: { key: me.userId } },
  });
  let peopleCb: (p: HalaqaParticipant[]) => void = () => {};
  let eventCb: (e: HalaqaEvent) => void = () => {};
  let mine: HalaqaParticipant = { ...me };

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<HalaqaParticipant>();
    const people = Object.values(state)
      .map((entries) => entries[entries.length - 1])
      .filter(Boolean) as unknown as HalaqaParticipant[];
    peopleCb(people);
  });
  channel.on('broadcast', { event: 'halaqa' }, ({ payload }) => eventCb(payload as HalaqaEvent));

  await new Promise<void>((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(mine);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(status));
      }
    });
  });

  return {
    onPeople: (cb) => (peopleCb = cb),
    onEvent: (cb) => (eventCb = cb),
    send: (event) => void channel.send({ type: 'broadcast', event: 'halaqa', payload: event }),
    updateMe: (patch) => {
      mine = { ...mine, ...patch };
      void channel.track(mine);
    },
    close: () => void supabase.removeChannel(channel),
  };
}

/** Demo mode: classmates join, raise hands now and then, and read when chosen. */
function openSimulated(
  me: HalaqaParticipant,
  classmates: { userId: string; name: string; studentId: string }[],
): HalaqaChannel {
  let peopleCb: (p: HalaqaParticipant[]) => void = () => {};
  let eventCb: (e: HalaqaEvent) => void = () => {};
  let mine: HalaqaParticipant = { ...me };
  let state: HalaqaState | null = null;
  const others: HalaqaParticipant[] = classmates
    .filter((c) => c.userId !== me.userId)
    .slice(0, 4)
    .map((c) => ({ userId: c.userId, name: c.name, role: 'student', studentId: c.studentId, handRaisedAt: null }));
  const emit = () => peopleCb([mine, ...others]);
  const timers: ReturnType<typeof setTimeout>[] = [];

  // Two classmates put their hands up shortly after the room opens.
  others.slice(0, 2).forEach((p, i) => {
    timers.push(setTimeout(() => {
      p.handRaisedAt = Date.now();
      emit();
    }, 2500 + i * 2000));
  });

  // A simulated reader reads on, one ayah every few seconds.
  const reading = setInterval(() => {
    if (state?.readerUserId && others.some((o) => o.userId === state!.readerUserId)) {
      eventCb({ type: 'advance', by: 1, fromUserId: state.readerUserId });
    }
  }, 4000);

  return {
    onPeople: (cb) => {
      peopleCb = cb;
      setTimeout(emit, 300);
    },
    onEvent: (cb) => (eventCb = cb),
    send: (event) => {
      if (event.type === 'state') {
        state = event.state;
        // Whoever was chosen lowers their hand.
        const reader = others.find((o) => o.userId === event.state.readerUserId);
        if (reader && reader.handRaisedAt) {
          reader.handRaisedAt = null;
          emit();
        }
      }
    },
    updateMe: (patch) => {
      mine = { ...mine, ...patch };
      emit();
    },
    close: () => {
      timers.forEach(clearTimeout);
      clearInterval(reading);
    },
  };
}
