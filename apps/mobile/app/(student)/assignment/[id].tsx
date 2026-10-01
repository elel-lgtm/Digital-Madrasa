import { submitAssignmentSchema } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Screen,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDueLabel } from '@/utils/dates';

const STATUS_TONE = { pending: 'warning', graded: 'success', returned: 'info' } as const;

/**
 * One assignment from the student's side. Written work is typed and handed in
 * here; it can be revised until it is marked, or after the teacher returns
 * it. Recitation work is answered on the Recite tab instead.
 */
export default function StudentAssignment() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const { id = '' } = useLocalSearchParams<{ id: string }>();

  const assignments = useQuery({
    queryKey: qk.assignments(null),
    queryFn: () => api.listAssignments({}),
  });
  const assignment = (assignments.data ?? []).find((a) => a.id === id);

  const mine = useQuery({
    queryKey: qk.mySubmission(id),
    queryFn: () => api.getMySubmission(id),
    enabled: Boolean(id),
  });

  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (mine.data?.textBody) setAnswer(mine.data.textBody);
  }, [mine.data?.textBody]);

  const submit = useMutation({
    mutationFn: api.submitAssignment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.mySubmission(id) });
      void queryClient.invalidateQueries({ queryKey: qk.assignments(null) });
      void queryClient.invalidateQueries({ queryKey: qk.studentDashboard() });
    },
    onError: (e) => setError(describeError(e).body),
  });

  const handIn = () => {
    setError(null);
    const parsed = submitAssignmentSchema.safeParse({ assignmentId: id, textBody: answer });
    if (!parsed.success) {
      setError(t('validation.body_required'));
      return;
    }
    submit.mutate(parsed.data);
  };

  if (assignments.isPending || mine.isPending) {
    return (
      <Screen>
        <PageHeader title={t('student.assignments')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  if (!assignment || assignments.isError) {
    return (
      <Screen>
        <PageHeader title={t('student.assignments')} showBack />
        <ErrorState
          {...describeError(assignments.error ?? new Error('not found'))}
          retryLabel={t('common.retry')}
          onRetry={() => void assignments.refetch()}
        />
      </Screen>
    );
  }

  const submission = mine.data ?? null;
  const locked = submission?.status === 'graded';
  const written = assignment.assignmentType === 'written' || assignment.assignmentType === 'tajweed';
  const due = formatDueLabel(assignment.dueAt, t);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          written && !locked ? (
            <Button
              label={submission ? t('learning.revise') : t('learning.handIn')}
              size="lg"
              loading={submit.isPending}
              onPress={handIn}
            />
          ) : undefined
        }
      >
        <PageHeader title={assignment.title} subtitle={assignment.className} showBack />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="label" color="textMuted" uppercase>
                  {t('learning.instructions')}
                </AppText>
                <Badge label={due.label} tone={due.tone} />
              </View>
              <AppText variant="body">{assignment.instructions}</AppText>
            </View>
          </Card>

          {submission ? (
            <Card accent={locked ? 'success' : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{t(`learning.status_${submission.status}`)}</AppText>
                  {submission.score !== null ? (
                    <AppText variant="caption" color="textMuted">
                      {t('learning.markedScore', { score: submission.score })}
                    </AppText>
                  ) : null}
                </View>
                <Badge
                  label={t(`learning.status_${submission.status}`)}
                  tone={STATUS_TONE[submission.status]}
                />
              </View>
            </Card>
          ) : null}

          {written ? (
            locked ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="label" color="textMuted" uppercase>
                  {t('learning.yourAnswer')}
                </AppText>
                <AppText variant="body">{submission?.textBody}</AppText>
                <AppText variant="caption" color="textSubtle">
                  {t('learning.lockedMarked')}
                </AppText>
              </View>
            ) : (
              <TextField
                label={t('learning.yourAnswer')}
                value={answer}
                onChangeText={setAnswer}
                placeholder={t('learning.answerPlaceholder')}
                multiline
                numberOfLines={8}
                error={error ?? undefined}
              />
            )
          ) : (
            <Card>
              <View style={{ gap: theme.spacing.md }}>
                <AppText variant="body">{t('learning.recordInstead')}</AppText>
                <Button
                  label={t('learning.goRecite')}
                  variant="secondary"
                  onPress={() => router.push('/(student)/(tabs)/recite')}
                />
              </View>
            </Card>
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
