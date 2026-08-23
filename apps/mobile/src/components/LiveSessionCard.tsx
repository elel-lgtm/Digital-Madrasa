import {
  MEETING_PROVIDER_LABEL,
  isSessionHost,
  liveSessionState,
  meetingProvider,
  minutesUntil,
  type Lesson,
  type LiveSessionState,
} from '@digital-madrasa/shared';
import { VideoCamera } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, View } from 'react-native';
import { AppText, Badge, Button, Card } from '@/components/ui';
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

  // Hoisted so the narrowing survives into the onPress closure.
  const meetingUrl = lesson.meetingUrl;
  if (!meetingUrl || state === 'ended') return null;

  const provider = meetingProvider(meetingUrl);
  const providerLabel = provider ? MEETING_PROVIDER_LABEL[provider] : t('live.externalMeeting');
  const isOpen = state === 'live' || state === 'starting_soon';

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

        {isOpen ? (
          <Button
            label={isHost ? t('live.startSession') : t('live.joinSession')}
            icon={<VideoCamera size={20} color={theme.colors.textOnAccent} weight="fill" />}
            onPress={() => void openMeeting(meetingUrl, t)}
            accessibilityHint={t('live.opensExternalApp', { provider: providerLabel })}
          />
        ) : null}

        <AppText variant="caption" color="textSubtle">
          {t('live.opensExternalApp', { provider: providerLabel })}
        </AppText>
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
