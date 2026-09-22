import { useQuery } from '@tanstack/react-query';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play, ArrowCounterClockwise } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api } from '@/api';
import { AppText } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

interface Props {
  /** The storage path held in `recitations.audio_url`, not a URL. */
  storagePath: string;
  /** Duration recorded at submission, used before the file reports its own. */
  fallbackMs: number;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Plays a recitation from the private bucket.
 *
 * Deliberately small: a teacher reviewing a recitation needs to hear it,
 * scrub back and hear it again, and nothing else. There is no queue, no
 * background playback and no seek bar.
 *
 * The signed URL is fetched when the screen opens rather than stored on the
 * row, so the bucket stays private and no permanent link exists. It is
 * requested through the caller's own session, so Storage's read policy decides
 * whether it is issued at all — an unauthorised viewer never receives a
 * playable URL, not merely a hidden button.
 */
export function RecitationPlayer({ storagePath, fallbackMs }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const describeError = useApiError();
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const signed = useQuery({
    queryKey: ['recitation-audio', storagePath],
    queryFn: () => api.getRecitationAudioUrl(storagePath),
    // The URL outlives a review but not a session; refetching on focus would
    // restart playback, so it is left alone once obtained.
    staleTime: Infinity,
    retry: false,
  });

  const player = useAudioPlayer(signed.data ?? null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    // Without this the recorder's mode can leave playback routed to the
    // earpiece, which sounds like nothing is happening.
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, []);

  const duration = status.duration > 0 ? status.duration : fallbackMs / 1000;
  const position = Math.min(status.currentTime, duration);
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  if (signed.isPending) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <ActivityIndicator color={theme.colors.accent} />
        <AppText variant="caption" color="textMuted">
          {t('common.loading')}
        </AppText>
      </View>
    );
  }

  if (signed.isError) {
    return (
      <AppText variant="caption" color="danger">
        {describeError(signed.error).body}
      </AppText>
    );
  }

  const toggle = () => {
    try {
      setPlaybackFailed(false);
      if (status.playing) {
        player.pause();
        return;
      }
      // Starting again after the end would otherwise resume from the end and
      // appear to do nothing.
      if (status.didJustFinish || position >= duration - 0.25) {
        void player.seekTo(0);
      }
      player.play();
    } catch {
      setPlaybackFailed(true);
    }
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? t('common.pause') : t('common.play')}
          onPress={toggle}
          disabled={!status.isLoaded}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            borderRadius: MIN_TOUCH_TARGET / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: status.isLoaded ? theme.colors.accent : theme.colors.surfaceAlt,
          }}
        >
          {status.isBuffering && !status.isLoaded ? (
            <ActivityIndicator color={theme.colors.textOnAccent} />
          ) : status.playing ? (
            <Pause size={22} color={theme.colors.textOnAccent} weight="fill" />
          ) : (
            <Play size={22} color={theme.colors.textOnAccent} weight="fill" />
          )}
        </Pressable>

        <View style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${progress * 100}%`,
                height: '100%',
                backgroundColor: theme.colors.accent,
              }}
            />
          </View>
          <AppText variant="caption" color="textMuted">
            {clock(position)} / {clock(duration)}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.replay')}
          onPress={() => void player.seekTo(0)}
          disabled={!status.isLoaded}
          hitSlop={8}
          style={{
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowCounterClockwise size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {playbackFailed ? (
        <AppText variant="caption" color="danger">
          {t('errors.genericBody')}
        </AppText>
      ) : null}
    </View>
  );
}
