import { sendMessageSchema } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
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

export default function Thread() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [draft, setDraft] = useState('');

  const threads = useQuery({ queryKey: qk.threads(), queryFn: () => api.listThreads() });
  const messages = useQuery({
    queryKey: qk.messages(id ?? ''),
    queryFn: () => api.listMessages(id ?? ''),
    enabled: Boolean(id),
  });

  const thread = (threads.data ?? []).find((entry) => entry.id === id);

  const send = useMutation({
    mutationFn: api.sendMessage,
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: qk.messages(id ?? '') });
      void queryClient.invalidateQueries({ queryKey: qk.threads() });
    },
  });

  const submit = () => {
    if (!thread) return;
    const parsed = sendMessageSchema.safeParse({
      threadId: id,
      recipientId: thread.counterpartId,
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
                label={t('parent.messageTeacher')}
                value={draft}
                onChangeText={setDraft}
                multiline
                placeholder={t('empty.noMessagesBody')}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('parent.messageTeacher')}
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
          title={thread?.counterpartName ?? t('nav.messages')}
          subtitle={thread?.subjectName}
          showBack
        />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
          {messages.isPending ? (
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
