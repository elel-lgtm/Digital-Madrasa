import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChatCircleDots } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  Avatar,
  Badge,
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

export default function ParentMessages() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const threads = useQuery({ queryKey: qk.threads(), queryFn: () => api.listThreads() });

  return (
    <Screen refreshing={threads.isFetching} onRefresh={() => void threads.refetch()}>
      <PageHeader title={t('nav.messages')} />

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
                  subtitle={thread.lastMessage}
                  meta={relativeTime(thread.lastMessageAt, t)}
                  left={<Avatar name={thread.counterpartName} />}
                  right={
                    thread.unreadCount > 0 ? (
                      <Badge label={String(thread.unreadCount)} tone="accent" />
                    ) : null
                  }
                  onPress={() =>
                    router.push({
                      pathname: '/(parent)/thread/[id]',
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
