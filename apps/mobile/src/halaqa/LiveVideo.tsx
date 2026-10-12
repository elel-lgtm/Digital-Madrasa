import { useMutation } from '@tanstack/react-query';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { Camera } from 'expo-camera';
import { VideoCamera, X } from 'phosphor-react-native';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { api } from '@/api';
import { AppText, Button, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The live lesson's video and sound, inside the app. The server hands out a
 * short-lived token for the lesson's private room (live-room function), so
 * only the lesson's madrasa can join. Pupils start with camera and
 * microphone off.
 */
export function LiveVideo({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [room, setRoom] = useState<{ url: string; token: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: async () => {
      if (Platform.OS !== 'web') {
        // The call needs these before the page inside asks for them.
        await Camera.requestCameraPermissionsAsync();
        await requestRecordingPermissionsAsync();
      }
      return api.getLiveRoom(lessonId);
    },
    onSuccess: (r) => {
      if (r) setRoom(r);
      else setNotice(t('halaqa.videoNotSetUp'));
    },
    onError: () => setNotice(t('halaqa.videoUnavailable')),
  });

  if (!room) {
    return (
      <Card>
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <VideoCamera size={24} color={theme.colors.accent} weight="duotone" />
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              {t('halaqa.videoTitle')}
            </AppText>
          </View>
          {notice ? (
            <AppText variant="caption" color="textMuted">
              {notice}
            </AppText>
          ) : null}
          <Button label={t('halaqa.joinVideo')} loading={join.isPending} onPress={() => join.mutate()} />
        </View>
      </Card>
    );
  }

  const src = `${room.url}?t=${encodeURIComponent(room.token)}`;
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ height: 300, borderRadius: theme.radius.lg, overflow: 'hidden', backgroundColor: '#000000' }}>
        {Platform.OS === 'web'
          ? createElement('iframe', {
              src,
              title: t('halaqa.videoTitle'),
              allow: 'camera; microphone; fullscreen; display-capture; autoplay',
              style: { width: '100%', height: '100%', border: 0 },
            })
          : (
            <WebView
              source={{ uri: src }}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              mediaCapturePermissionGrantType="grant"
              style={{ flex: 1, backgroundColor: '#000000' }}
            />
          )}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setRoom(null)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }}
      >
        <X size={14} color={theme.colors.textMuted} />
        <AppText variant="caption" color="textMuted">
          {t('halaqa.leaveVideo')}
        </AppText>
      </Pressable>
    </View>
  );
}
