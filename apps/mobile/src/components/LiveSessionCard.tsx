import {
  MEETING_PROVIDER_LABEL,
  isSessionHost,
  liveSessionState,
  meetingProvider,
  minutesUntil,
  type Lesson,
  type LiveSessionState,
} from '@digital-madrasa/shared';
import { useRouter } from 'expo-router';
import { BookOpenText, VideoCamera } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, View } from 'react-native';
import { AppText, Badge, Button, Card } from '@/components/ui';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/** How often the countdown re-evaluates, so the card flips to "live" on its own. */
const TICK_MS = 30_000;

interface LiveSessionCardProps {
  lesson: Lesson;
  /**
   * Omit for students. For staff, pass the viewer's teacher record: the
   * lesson's own teacher gets "Start", anyone else — including an owner
   * dropping into another teacher's class — gets "Join".
   */
  viewer?: { id: string } | null;
}

/**
 * The link-out live session.
 *
 * We deliberately do not embed a video stack: madrasas already run their
 * classes on Meet, Teams or Zoom, and a WebRTC SDK would cost a custom dev
 * build plus far more bandwidth than these connections carry. This card just
 * hands off to the app the school already uses.
 *
 * The Join button only appears inside the session window (15 minutes before
 * the start until 90 minutes after) so nobody taps into an empty room.
 */
export function LiveSessionCard({ lesson, viewer = null }: LiveSessionCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const state = useLiveState(lesson.scheduledFor);
  const isHost = isSessionHost(lesson.teacherId, viewer);
  const router = useRouter();
  const role = useRequiredSession().user.role;

  // Hoisted so the narrowing survives into the onPress closure.
  const meetingUrl = lesson.meetingUrl;
  const isOpen = state === 'live' || state === 'starting_soon';
  // The in-app reading room needs no link: any lesson in its live window has one.
  if (state === 'ended' || (!meetingUrl && !isOpen)) return null;

  const provider = meetingUrl ? meetingProvider(meetingUrl) : null;
  const providerLabel = provider ? MEETING_PROVIDER_LABEL[provider] : meetingUrl ? t('live.externalMeeting') : 'ILMORA';

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="subheading">{lesson.title}</AppText>
            <AppText variant="caption" color="textMuted">
              {lesson.className} · {providerLabel}
            </AppText>
          </View>
          <Badge
            label={state === 'live' ? t('live.liveNow') : t('live.scheduled')}
            tone={state === 'live' ? 'danger' : 'info'}
          />
        </View>

        <AppText variant="caption" color="textSubtle">
          {describeTiming(state, lesson.scheduledFor, t)}
        </AppText>

        {isOpen && (role === 'teacher' || role === 'student') ? (
          <Button
            label={isHost ? t('halaqa.openRoomHost') : t('halaqa.openRoom')}
            icon={<BookOpenText size={20} color={theme.colors.textOnAccent} weight="fill" />}
            onPress={() =>
              router.push({
                pathname: role === 'teacher' ? '/(teacher)/halaqa/[id]' : '/(student)/halaqa/[id]',
                params: { id: lesson.id },
              })
            }
          />
        ) : null}

        {isOpen && meetingUrl ? (
          <Button
            label={isHost ? t('live.startSession') : t('live.joinSession')}
            variant="secondary"
            icon={<VideoCamera size={20} color={theme.colors.text} weight="fill" />}
            onPress={() => void openMeeting(meetingUrl, t)}
            accessibilityHint={t('live.opensExternalApp', { provider: providerLabel })}
          />
        ) : null}

        {meetingUrl ? (
          <AppText variant="caption" color="textSubtle">
            {t('live.opensExternalApp', { provider: providerLabel })}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Inside the live reading room: the session's Google Meet / Zoom link, for
 * video and sound beside the room. Says so plainly when there is none.
 */
export function MeetingLinkCard({ lesson }: { lesson: Lesson }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const url = lesson.meetingUrl;
  const provider = url ? meetingProvider(url) : null;
  const label = provider ? MEETING_PROVIDER_LABEL[provider] : t('live.externalMeeting');
  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VideoCamera size={22} color={theme.colors.accent} weight="duotone" />
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            {url ? t('session.videoOn', { provider: label }) : t('session.noVideoLink')}
          </AppText>
        </View>
        {url ? (
          <Button
            label={t('session.joinOn', { provider: label })}
            variant="secondary"
            icon={<VideoCamera size={18} color={theme.colors.text} weight="fill" />}
            onPress={() => void openMeeting(url, t)}
          />
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Compact row for lesson lists — same rules, no card chrome.
 */
export function LiveSessionRow({ lesson, viewer = null }: LiveSessionCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const state = useLiveState(lesson.scheduledFor);
  const isHost = isSessionHost(lesson.teacherId, viewer);

  const meetingUrl = lesson.meetingUrl;
  if (!meetingUrl) return null;

  const isOpen = state === 'live' || state === 'starting_soon';
  if (!isOpen) {
    // Outside the window we still say a live class exists, so students know
    // to come back rather than assuming the lesson is in-person only.
    return (
      <Badge
        label={state === 'ended' ? t('live.sessionEnded') : t('live.hasLiveSession')}
        tone={state === 'ended' ? 'neutral' : 'info'}
      />
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Button
        label={isHost ? t('live.startSession') : t('live.joinSession')}
        size="md"
        fullWidth={false}
        icon={<VideoCamera size={18} color={theme.colors.textOnAccent} weight="fill" />}
        onPress={() => void openMeeting(meetingUrl, t)}
      />
      {state === 'live' ? <Badge label={t('live.liveNow')} tone="danger" /> : null}
    </View>
  );
}

/** Re-renders on a timer so a scheduled card becomes a live one unattended. */
function useLiveState(scheduledFor: string | null): LiveSessionState {
  const [state, setState] = useState<LiveSessionState>(() => liveSessionState(scheduledFor));

  useEffect(() => {
    setState(liveSessionState(scheduledFor));
    const timer = setInterval(() => setState(liveSessionState(scheduledFor)), TICK_MS);
    return () => clearInterval(timer);
  }, [scheduledFor]);

  return state;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function describeTiming(
  state: LiveSessionState,
  scheduledFor: string | null,
  t: Translate,
): string {
  if (!scheduledFor) return t('live.noSchedule');
  if (state === 'live') return t('live.inProgress');
  if (state === 'starting_soon') {
    return t('live.startsInMinutes', { count: minutesUntil(scheduledFor) });
  }
  return t('live.startsAt', {
    time: new Date(scheduledFor).toLocaleString(undefined, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

async function openMeeting(url: string, t: Translate): Promise<void> {
  // A link that no longer parses as a known provider is never opened — the
  // stored value could have been written before the allowlist tightened.
  if (!meetingProvider(url)) {
    Alert.alert(t('live.cannotOpenTitle'), t('live.unsupportedLink'));
    return;
  }

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert(t('live.cannotOpenTitle'), t('live.cannotOpenBody'));
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert(t('live.cannotOpenTitle'), t('live.cannotOpenBody'));
  }
}
