import { sendMessageSchema } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PaperPlaneTilt } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  ErrorState,
  PageHeader,
  Screen,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/dates';

/**
 * One conversation. `id` is a thread, or 'new' with `to` (and the pupil it is
 * about) when writing to someone for the first time; the first message opens
 * the thread and the screen moves onto it.
 */
export function ThreadScreen({ group }: { group: 'parent' | 'teacher' }) {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string; to?: string; student?: string; name?: string }>();
  const isNew = params.id === 'new';
  const id = isNew ? '' : params.id;

  const [draft, setDraft] = useState('');

  const threads = useQuery({ queryKey: qk.threads(), queryFn: () => api.listThreads() });
  const messages = useQuery({
    queryKey: qk.messages(id ?? ''),
    queryFn: () => api.listMessages(id ?? ''),
    enabled: Boolean(id) && !isNew,
  });

  const thread = (threads.data ?? []).find((entry) => entry.id === id);

  const send = useMutation({
    mutationFn: api.sendMessage,
    onSuccess: (sent) => {
      setDraft('');
      if (isNew && sent.threadId) {
        void queryClient.invalidateQueries({ queryKey: qk.threads() });
        router.replace({
          pathname: group === 'teacher' ? '/(teacher)/thread/[id]' : '/(parent)/thread/[id]',
          params: { id: sent.threadId },
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: qk.messages(id ?? '') });
      void queryClient.invalidateQueries({ queryKey: qk.threads() });
    },
  });

  const recipientId = isNew ? params.to : thread?.counterpartId;
  const submit = () => {
    if (!recipientId) return;
    const parsed = sendMessageSchema.safeParse({
      threadId: isNew ? null : id,
      recipientId,
      studentId: isNew ? (params.student ?? null) : undefined,
      body: draft,
    });
    if (!parsed.success) return;
    send.mutate(parsed.data);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        footer={
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('messages.write')}
                value={draft}
                onChangeText={setDraft}
                multiline
                placeholder={t('empty.noMessagesBody')}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('messages.send')}
              disabled={draft.trim().length === 0 || send.isPending}
              onPress={submit}
              style={{
                width: 48,
                height: 48,
                borderRadius: theme.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  draft.trim().length === 0 ? theme.colors.surfaceAlt : theme.colors.accent,
              }}
            >
              <PaperPlaneTilt
                size={20}
                weight="fill"
                color={
                  draft.trim().length === 0 ? theme.colors.textSubtle : theme.colors.textOnAccent
                }
              />
            </Pressable>
          </View>
        }
      >
        <PageHeader
          title={thread?.counterpartName ?? params.name ?? t('nav.messages')}
          subtitle={thread?.subjectName}
          showBack
        />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
          {isNew ? (
            <AppText variant="body" color="textMuted">
              {t('messages.firstMessage')}
            </AppText>
          ) : messages.isPending ? (
            <SkeletonList count={3} />
          ) : messages.isError ? (
            <ErrorState
              {...describeError(messages.error)}
              retryLabel={t('common.retry')}
              onRetry={() => void messages.refetch()}
            />
          ) : (
            (messages.data ?? []).map((message) => {
              const mine = message.senderId === session.user.id;
              return (
                <View
                  key={message.id}
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: theme.spacing.md,
                    borderRadius: theme.radius.lg,
                    backgroundColor: mine ? theme.colors.accentSoft : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: mine ? theme.colors.accent : theme.colors.border,
                    gap: 4,
                  }}
                >
                  <AppText variant="body">{message.body}</AppText>
                  <AppText variant="caption" color="textSubtle" align={mine ? 'right' : 'left'}>
                    {relativeTime(message.createdAt, t)}
                  </AppText>
                </View>
              );
            })
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
