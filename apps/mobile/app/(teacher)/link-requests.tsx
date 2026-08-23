import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  Segmented,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/dates';

type Filter = 'pending' | 'approved';

/**
 * The approval queue that stands between a link request and a parent seeing a
 * child's records. Nothing is visible to the parent until a decision is made
 * here, which is what makes the admission number safe to hand out.
 */
export default function LinkRequests() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('pending');

  const requests = useQuery({
    queryKey: qk.linkRequests(filter),
    queryFn: () => api.listLinkRequests(filter),
  });

  const decide = useMutation({
    mutationFn: api.decideLinkRequest,
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  const revoke = useMutation({
    mutationFn: api.revokeLink,
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  const confirmRevoke = (linkId: string, parentName: string) => {
    Alert.alert(t('teacher.revoke'), parentName, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('teacher.revoke'),
        style: 'destructive',
        onPress: () => revoke.mutate(linkId),
      },
    ]);
  };

  return (
    <Screen refreshing={requests.isFetching} onRefresh={() => void requests.refetch()}>
      <PageHeader title={t('teacher.linkRequests')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Segmented
          options={[
            { value: 'pending', label: t('parent.requestPending') },
            { value: 'approved', label: t('teacher.approved') },
          ]}
          value={filter}
          onChange={setFilter}
        />

        {requests.isPending ? (
          <SkeletonList count={3} />
        ) : requests.isError ? (
          <ErrorState
            {...describeError(requests.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void requests.refetch()}
          />
        ) : (requests.data ?? []).length === 0 ? (
          <EmptyState
            icon={<UserPlus size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noRequests')}
            body={t('empty.noRequestsBody')}
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {(requests.data ?? []).map((request) => (
              <Card key={request.id} accent={request.status === 'pending' ? 'info' : undefined}>
                <View style={{ gap: theme.spacing.md }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                  >
                    <Avatar name={request.parentName} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyStrong">{request.parentName}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {request.parentPhone ?? ''}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="textSubtle">
                      {relativeTime(request.requestedAt, t)}
                    </AppText>
                  </View>

                  <AppText variant="body" color="textMuted">
                    {t('teacher.linkRequestBody', {
                      parent: request.parentName,
                      relationship: t(`parent.${request.relationship}`).toLowerCase(),
                      student: request.studentName,
                    })}
                  </AppText>

                  <Badge label={request.admissionNo} tone="accent" />

                  {request.status === 'pending' ? (
                    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                      <View style={{ flex: 1 }}>
                        <Button
                          label={t('teacher.reject')}
                          variant="secondary"
                          loading={decide.isPending}
                          onPress={() =>
                            decide.mutate({ linkId: request.id, decision: 'rejected' })
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          label={t('teacher.approve')}
                          loading={decide.isPending}
                          onPress={() =>
                            decide.mutate({ linkId: request.id, decision: 'approved' })
                          }
                        />
                      </View>
                    </View>
                  ) : (
                    <Button
                      label={t('teacher.revoke')}
                      variant="danger"
                      loading={revoke.isPending}
                      onPress={() => confirmRevoke(request.id, request.parentName)}
                    />
                  )}
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
