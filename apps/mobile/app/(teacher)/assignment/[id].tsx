import { gradeSubmissionSchema, type Submission } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ClipboardText } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/dates';

const STATUS_TONE = { pending: 'warning', graded: 'success', returned: 'info' } as const;

/** One assignment's hand-ins, marked here by staff. */
export default function AssignmentSubmissions() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const { id = '' } = useLocalSearchParams<{ id: string }>();

  const assignments = useQuery({
    queryKey: qk.assignments(null),
    queryFn: () => api.listAssignments({}),
  });
  const assignment = (assignments.data ?? []).find((a) => a.id === id);

  const submissions = useQuery({
    queryKey: qk.submissions(id),
    queryFn: () => api.listSubmissions(id),
    enabled: Boolean(id),
  });

  return (
    <Screen refreshing={submissions.isFetching} onRefresh={() => void submissions.refetch()}>
      <PageHeader
        title={assignment?.title ?? t('learning.submissions')}
        subtitle={assignment ? `${assignment.className} · ${assignment.assignmentType}` : undefined}
        showBack
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        {assignment ? (
          <Card>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('learning.instructions')}
              </AppText>
              <AppText variant="body">{assignment.instructions}</AppText>
            </View>
          </Card>
        ) : null}

        <SectionHeader title={t('learning.submissions')} />
        {submissions.isPending ? (
          <SkeletonList count={3} />
        ) : submissions.isError ? (
          <ErrorState
            {...describeError(submissions.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void submissions.refetch()}
          />
        ) : (submissions.data ?? []).length === 0 ? (
          <EmptyState
            icon={<ClipboardText size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('learning.noSubmissions')}
            body=""
          />
        ) : (
          (submissions.data ?? []).map((submission) => (
            <SubmissionCard key={submission.id} submission={submission} assignmentId={id} />
          ))
        )}
      </View>
    </Screen>
  );
}

function SubmissionCard({ submission, assignmentId }: { submission: Submission; assignmentId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const [score, setScore] = useState(submission.score !== null ? String(submission.score) : '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<'graded' | 'returned' | null>(null);

  const grade = useMutation({
    mutationFn: api.gradeSubmission,
    onSuccess: (_, input) => {
      setSaved(input.status);
      void queryClient.invalidateQueries({ queryKey: qk.submissions(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: qk.assignments(null) });
    },
    onError: (e) => setError(describeError(e).body),
  });

  const save = (status: 'graded' | 'returned') => {
    setError(null);
    setSaved(null);
    const parsed = gradeSubmissionSchema.safeParse({
      submissionId: submission.id,
      score: Number(score),
      status,
    });
    if (!parsed.success || score.trim() === '') {
      setError(t('validation.amount_invalid'));
      return;
    }
    grade.mutate(parsed.data);
  };

  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{submission.studentName}</AppText>
            <AppText variant="caption" color="textSubtle">
              {t('learning.handedIn')} {relativeTime(submission.submittedAt, t)}
            </AppText>
          </View>
          <Badge label={t(`learning.status_${submission.status}`)} tone={STATUS_TONE[submission.status]} />
        </View>
        {submission.textBody ? <AppText variant="body">{submission.textBody}</AppText> : null}
        <TextField
          label={t('learning.score')}
          value={score}
          onChangeText={(value) => {
            setScore(value);
            setSaved(null);
          }}
          keyboardType="number-pad"
          error={error ?? undefined}
        />
        {saved ? (
          <AppText variant="caption" color="success">
            {saved === 'graded' ? t('learning.markSaved') : t('learning.status_returned')}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('learning.saveMark')}
              loading={grade.isPending && grade.variables?.status === 'graded'}
              onPress={() => save('graded')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('learning.returnWork')}
              variant="secondary"
              loading={grade.isPending && grade.variables?.status === 'returned'}
              onPress={() => save('returned')}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}
