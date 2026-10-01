import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ClipboardText } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDueLabel } from '@/utils/dates';

export default function Assignments() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const router = useRouter();

  const assignments = useQuery({
    queryKey: qk.assignments(null),
    queryFn: () => api.listAssignments({}),
  });

  return (
    <Screen refreshing={assignments.isFetching} onRefresh={() => void assignments.refetch()}>
      <PageHeader title={t('teacher.assignments')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        {assignments.isPending ? (
          <SkeletonList count={4} />
        ) : assignments.isError ? (
          <ErrorState
            {...describeError(assignments.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void assignments.refetch()}
          />
        ) : (assignments.data ?? []).length === 0 ? (
          <EmptyState
            icon={<ClipboardText size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noAssignments')}
            body={t('empty.noAssignmentsBody')}
          />
        ) : (
          (assignments.data ?? []).map((assignment) => {
            const due = formatDueLabel(assignment.dueAt, t);
            return (
              <Card
                key={assignment.id}
                accent={due.tone === 'danger' ? 'danger' : undefined}
                accessibilityLabel={assignment.title}
                onPress={() => router.push(`/(teacher)/assignment/${assignment.id}`)}
              >
                <View style={{ gap: theme.spacing.md }}>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="subheading">{assignment.title}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {assignment.className} · {assignment.assignmentType}
                      </AppText>
                    </View>
                    <Badge label={due.label} tone={due.tone} />
                  </View>

                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="caption" color="textMuted">
                        {t('teacher.gradingQueue')}
                      </AppText>
                      <AppText variant="caption" color="textSubtle">
                        {assignment.submissionCount} / {assignment.studentCount}
                      </AppText>
                    </View>
                    <ProgressBar
                      value={assignment.submissionCount}
                      max={Math.max(1, assignment.studentCount)}
                      tone={
                        assignment.submissionCount >= assignment.studentCount
                          ? 'success'
                          : 'accent'
                      }
                      height={6}
                      label={t('teacher.gradingQueue')}
                    />
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}
