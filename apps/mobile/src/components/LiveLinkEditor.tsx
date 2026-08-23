import {
  MEETING_PROVIDER_LABEL,
  canManageMeetingLink,
  meetingProvider,
  meetingUrlSchema,
  type Lesson,
} from '@digital-madrasa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinkSimple, VideoCamera } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { api } from '@/api';
import { AppText, Badge, Button, Divider, TextField } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Teacher-side control for a lesson's live session link.
 *
 * The link is validated against the shared host allowlist before it is sent,
 * so a mistyped or untrusted URL never reaches storage — students tap this
 * button without inspecting where it goes.
 */
export function LiveLinkEditor({ lesson }: { lesson: Lesson }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const describeError = useApiError();
  const session = useRequiredSession();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lesson.meetingUrl ?? '');
  const [error, setError] = useState<string | undefined>(undefined);

  const save = useMutation({
    mutationFn: api.setLessonMeetingUrl,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      setEditing(false);
      setError(undefined);
    },
    onError: (err) => setError(describeError(err).body),
  });

  const provider = lesson.meetingUrl ? meetingProvider(lesson.meetingUrl) : null;

  // The server enforces this too; hiding the control just stops a teacher
  // being offered an action that would be refused.
  const canManage = canManageMeetingLink(lesson.teacherId, session.teacher);
  if (!canManage) {
    // Someone else's class: show the provider so staff know a session exists,
    // but offer no way to change where it points.
    if (!provider) return null;
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VideoCamera size={18} color={theme.colors.info} weight="duotone" />
          <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
            {MEETING_PROVIDER_LABEL[provider]}
          </AppText>
        </View>
      </View>
    );
  }

  const submit = () => {
    const parsed = meetingUrlSchema.safeParse(value);
    if (!parsed.success) {
      // The Zod message is an i18n key, so it localises like everything else.
      setError(t(parsed.error.issues[0]?.message ?? 'validation.meeting_url_invalid'));
      return;
    }
    setError(undefined);
    save.mutate({ lessonId: lesson.id, meetingUrl: parsed.data });
  };

  const confirmRemove = () => {
    Alert.alert(t('live.removeLink'), t('live.manageTitle'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => {
          setValue('');
          save.mutate({ lessonId: lesson.id, meetingUrl: null });
        },
      },
    ]);
  };

  if (!editing) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <Divider />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            flexWrap: 'wrap',
          }}
        >
          {provider ? (
            <>
              <VideoCamera size={18} color={theme.colors.info} weight="duotone" />
              <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                {MEETING_PROVIDER_LABEL[provider]}
              </AppText>
            </>
          ) : (
            <>
              <LinkSimple size={18} color={theme.colors.textSubtle} />
              <AppText variant="caption" color="textSubtle" style={{ flex: 1 }}>
                {t('live.manageBody')}
              </AppText>
            </>
          )}
          <Button
            label={lesson.meetingUrl ? t('live.editLink') : t('live.addLink')}
            variant="ghost"
            fullWidth={false}
            onPress={() => {
              setValue(lesson.meetingUrl ?? '');
              setEditing(true);
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Divider />
      <View style={{ gap: 2 }}>
        <AppText variant="bodyStrong">{t('live.manageTitle')}</AppText>
        <AppText variant="caption" color="textSubtle">
          {t('live.manageBody')}
        </AppText>
      </View>

      <TextField
        label={t('live.linkLabel')}
        placeholder={t('live.linkPlaceholder')}
        value={value}
        onChangeText={(next) => {
          setValue(next);
          if (error) setError(undefined);
        }}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
      />

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <Badge label="Google Meet" tone="neutral" />
        <Badge label="Teams" tone="neutral" />
        <Badge label="Zoom" tone="neutral" />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Button
          label={t('common.cancel')}
          variant="secondary"
          fullWidth={false}
          style={{ flex: 1 }}
          onPress={() => {
            setEditing(false);
            setError(undefined);
          }}
        />
        <Button
          label={t('live.saveLink')}
          fullWidth={false}
          style={{ flex: 1 }}
          loading={save.isPending}
          onPress={submit}
        />
      </View>

      {lesson.meetingUrl ? (
        <Button label={t('live.removeLink')} variant="danger" onPress={confirmRemove} />
      ) : null}
    </View>
  );
}
