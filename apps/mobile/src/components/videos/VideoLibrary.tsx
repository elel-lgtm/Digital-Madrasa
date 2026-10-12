import { youtubeId, youtubeThumbnail, type ClassVideo } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { PlayCircle, Trash, YoutubeLogo } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { YouTubePlayer } from '@/components/videos/YouTubePlayer';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  OptionGroup,
  PageHeader,
  Screen,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

const VIDEOS_KEY = ['class-videos'] as const;

/** YouTube's public oEmbed gives the title without any API key. */
async function fetchTitle(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!res.ok) return null;
    const body = (await res.json()) as { title?: string };
    return body.title?.slice(0, 140) ?? null;
  } catch {
    return null;
  }
}

/**
 * The madrasa's Qur'an video library: videos a teacher chose, played in
 * YouTube's own player inside the app. Staff can add and remove; pupils and
 * parents watch. A pupil sees their class's videos and those for everyone.
 */
export function VideoLibraryScreen({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const [playing, setPlaying] = useState<string | null>(null);

  const videos = useQuery({ queryKey: VIDEOS_KEY, queryFn: () => api.listVideos() });
  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses(), enabled: canManage });
  const myClass = session.student?.classId ?? null;
  const shown = (videos.data ?? []).filter((v) => canManage || !v.classId || !myClass || v.classId === myClass);

  const remove = useMutation({
    mutationFn: (id: string) => api.removeVideo(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: VIDEOS_KEY }),
  });

  return (
    <Screen>
      <PageHeader title={t('videos.title')} subtitle={t('videos.subtitle')} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        {canManage ? <AddVideo classes={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /> : null}

        {videos.isPending ? (
          <SkeletonList count={3} />
        ) : videos.isError ? (
          <ErrorState
            title={describeError(videos.error).title}
            body={describeError(videos.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void videos.refetch()}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<YoutubeLogo size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('videos.emptyTitle')}
            body={canManage ? t('videos.emptyStaff') : t('videos.emptyBody')}
          />
        ) : (
          shown.map((v: ClassVideo) => (
            <Card key={v.id} padded={false}>
              {playing === v.id ? (
                <YouTubePlayer videoId={v.youtubeId} title={v.title} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('videos.play', { title: v.title })}
                  onPress={() => setPlaying(v.id)}
                  style={{ width: '100%', aspectRatio: 16 / 9, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, overflow: 'hidden' }}
                >
                  <Image source={{ uri: youtubeThumbnail(v.youtubeId) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                    <PlayCircle size={64} color="#FFFFFF" weight="fill" />
                  </View>
                </Pressable>
              )}
              <View style={{ padding: theme.spacing.lg, gap: theme.spacing.xs }}>
                <AppText variant="subheading">{v.title}</AppText>
                {v.note ? (
                  <AppText variant="body" color="textMuted">
                    {v.note}
                  </AppText>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Badge label={v.className ?? t('videos.everyone')} tone="neutral" />
                  {canManage ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('videos.remove')}
                      hitSlop={10}
                      onPress={() =>
                        Alert.alert(t('videos.removeConfirm'), v.title, [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('videos.remove'), style: 'destructive', onPress: () => remove.mutate(v.id) },
                        ])
                      }
                      style={{ marginLeft: 'auto' }}
                    >
                      <Trash size={20} color={theme.colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

function AddVideo({ classes }: { classes: { value: string; label: string }[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [classId, setClassId] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const id = youtubeId(url);

  const add = useMutation({
    mutationFn: () => api.addVideo({ url, title, note: note || null, classId: classId === 'all' ? null : classId }),
    onSuccess: () => {
      setUrl('');
      setTitle('');
      setNote('');
      void queryClient.invalidateQueries({ queryKey: VIDEOS_KEY });
    },
    onError: (err) => setError(describeError(err).body),
  });

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <AppText variant="subheading">{t('videos.addTitle')}</AppText>
        <TextField
          label={t('videos.link')}
          value={url}
          onChangeText={async (value) => {
            setUrl(value);
            setError(null);
            const found = youtubeId(value);
            if (found && !title) {
              const fetched = await fetchTitle(found);
              if (fetched) setTitle(fetched);
            }
          }}
          placeholder="https://youtu.be/…"
          autoCapitalize="none"
          error={url && !id ? t('videos.notYouTube') : undefined}
        />
        {id ? <Image source={{ uri: youtubeThumbnail(id) }} style={{ width: 160, aspectRatio: 16 / 9, borderRadius: 8 }} /> : null}
        <TextField label={t('videos.videoTitle')} value={title} onChangeText={setTitle} maxLength={140} />
        <TextField label={t('videos.note')} value={note} onChangeText={setNote} maxLength={300} hint={t('videos.noteHint')} />
        <OptionGroup
          label={t('videos.forClass')}
          options={[{ value: 'all', label: t('videos.everyone') }, ...classes]}
          value={classId}
          onChange={setClassId}
        />
        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}
        <Button
          label={t('videos.add')}
          disabled={!id || title.trim().length < 3}
          loading={add.isPending}
          onPress={() => add.mutate()}
        />
      </View>
    </Card>
  );
}
