import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChatCircleDots, PencilSimple } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  PageHeader,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/dates';

/**
 * Conversations, for parents and teachers alike. "New message" lists only the
 * people the server says this user may write to: a parent sees their
 * children's teachers, a teacher sees the parents of their pupils.
 */
export function MessagesScreen({ group }: { group: 'parent' | 'teacher' }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const threads = useQuery({ queryKey: qk.threads(), queryFn: () => api.listThreads() });
  const [picking, setPicking] = useState(false);
  const contacts = useQuery({ queryKey: ['message-contacts'], queryFn: () => api.listContacts(), enabled: picking });
  const threadPath = group === 'teacher' ? '/(teacher)/thread/[id]' : '/(parent)/thread/[id]';

  return (
    <Screen refreshing={threads.isFetching} onRefresh={() => void threads.refetch()}>
      <PageHeader title={t('nav.messages')} showBack={group === 'teacher'} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        <Button
          label={picking ? t('common.cancel') : t('messages.new')}
          variant={picking ? 'secondary' : 'primary'}
          icon={picking ? undefined : <PencilSimple size={18} color={theme.colors.textOnAccent} />}
          onPress={() => setPicking(!picking)}
        />
        {picking ? (
          <Card padded={false}>
            {contacts.isPending ? (
              <View style={{ padding: theme.spacing.lg }}>
                <SkeletonList count={2} />
              </View>
            ) : (contacts.data ?? []).length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('messages.noContacts')}
                </AppText>
              </View>
            ) : (
              (contacts.data ?? []).map((c, index) => (
                <View key={`${c.profileId}-${c.studentId}`} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={c.fullName}
                    subtitle={t(c.role === 'teacher' ? 'messages.teacherOf' : 'messages.parentOf', { name: c.studentName })}
                    left={<Avatar name={c.fullName} />}
                    onPress={() => {
                      setPicking(false);
                      const existing = (threads.data ?? []).find((th) => th.counterpartId === c.profileId);
                      router.push({
                        pathname: threadPath,
                        params: existing
                          ? { id: existing.id }
                          : { id: 'new', to: c.profileId, student: c.studentId, name: c.fullName },
                      });
                    }}
                  />
                </View>
              ))
            )}
          </Card>
        ) : null}
      </View>

      <View style={{ marginTop: theme.spacing.lg }}>
        {threads.isPending ? (
          <SkeletonList count={3} />
        ) : threads.isError ? (
          <ErrorState
            {...describeError(threads.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void threads.refetch()}
          />
        ) : (threads.data ?? []).length === 0 ? (
          <EmptyState
            icon={<ChatCircleDots size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noMessages')}
            body={t('empty.noMessagesBody')}
          />
        ) : (
          <Card padded={false}>
            {(threads.data ?? []).map((thread, index) => (
              <View key={thread.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  title={thread.counterpartName}
                  subtitle={thread.studentName ? `${thread.studentName} · ${thread.lastMessage}` : thread.lastMessage}
                  meta={relativeTime(thread.lastMessageAt, t)}
                  left={<Avatar name={thread.counterpartName} />}
                  right={
                    thread.unreadCount > 0 ? (
                      <Badge label={String(thread.unreadCount)} tone="accent" />
                    ) : null
                  }
                  onPress={() =>
                    router.push({
                      pathname: threadPath,
                      params: { id: thread.id },
                    })
                  }
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
