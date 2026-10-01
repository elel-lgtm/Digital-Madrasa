import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { WaveTriangle } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Avatar,
  Badge,
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
import { formatDuration, relativeTime } from '@/utils/dates';

type Filter = 'pending' | 'all';

export default function ReviewQueue() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const [filter, setFilter] = useState<Filter>('pending');

  const recitations = useQuery({
    queryKey: qk.recitations({ pendingReviewOnly: filter === 'pending' }),
    queryFn: () => api.listRecitations({ pendingReviewOnly: filter === 'pending' }),
  });

  return (
    <Screen refreshing={recitations.isFetching} onRefresh={() => void recitations.refetch()}>
      <PageHeader title={t('teacher.gradingQueue')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Segmented
          options={[
            { value: 'pending', label: t('teacher.pendingReviews') },
            { value: 'all', label: t('common.all') },
          ]}
          value={filter}
          onChange={setFilter}
        />

        {recitations.isPending ? (
          <SkeletonList count={4} />
        ) : recitations.isError ? (
          <ErrorState
            {...describeError(recitations.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void recitations.refetch()}
          />
        ) : (recitations.data ?? []).length === 0 ? (
          <EmptyState
            icon={<WaveTriangle size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noRecitations')}
            body={t('empty.noRecitationsBody')}
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {(recitations.data ?? []).map((recitation) => {
              const reviewed = recitation.feedback?.reviewedByTeacherId !== null;
              const score =
                recitation.feedback?.teacherOverride?.overallScore ??
                recitation.feedback?.overallScore ??
                null;
              return (
                <Card
                  key={recitation.id}
                  accent={reviewed ? 'success' : 'accent'}
                  onPress={() =>
                    router.push({
                      pathname: '/(teacher)/recitation/[id]',
                      params: { id: recitation.id },
                    })
                  }
                >
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                  >
                    <Avatar name={recitation.studentName} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyStrong">{recitation.studentName}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {recitation.surahName} · {recitation.ayahFrom}–{recitation.ayahTo}
                      </AppText>
                      <AppText variant="caption" color="textSubtle">
                        {formatDuration(recitation.durationMs)} ·{' '}
                        {relativeTime(recitation.createdAt, t)}
                      </AppText>
                    </View>
                    {score !== null ? (
                      <Badge
                        label={String(Math.round(score))}
                        tone={score >= 85 ? 'success' : score >= 65 ? 'accent' : 'danger'}
                      />
                    ) : (
                      // No score: still being processed, or not assessed by the AI
                      // (no consent, or it was unavailable) and waiting for the teacher.
                      <Badge
                        label={
                          recitation.feedback
                            ? t('aiFeedback.awaitingTeacher')
                            : t('student.processing')
                        }
                      />
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
