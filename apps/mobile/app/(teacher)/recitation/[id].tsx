import { teacherOverrideSchema } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { RecitationPlayer } from '@/components/RecitationPlayer';
import { qk } from '@/api/keys';
import { AiDisclaimer, FindingList, ScoreRing } from '@/components/TajweedFeedback';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDuration, longDate } from '@/utils/dates';

/**
 * Teacher review of a recitation.
 *
 * The model's score is a starting point. Whatever the teacher saves here is
 * what appears on the report card, and findings they strike off disappear from
 * the student's view entirely.
 */
export default function ReviewRecitation() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [score, setScore] = useState('');
  const [remarks, setRemarks] = useState('');
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const recitation = useQuery({
    queryKey: qk.recitation(id ?? ''),
    queryFn: () => api.getRecitation(id ?? ''),
    enabled: Boolean(id),
  });

  // Seed the override with the model's score so a teacher who agrees can just
  // add remarks and save.
  useEffect(() => {
    const feedback = recitation.data?.feedback;
    if (!feedback) return;
    setScore((current) =>
      current === ''
        ? String(Math.round(feedback.teacherOverride?.overallScore ?? feedback.overallScore))
        : current,
    );
    setRemarks((current) => (current === '' ? (feedback.teacherOverride?.remarks ?? '') : current));
  }, [recitation.data]);

  const save = useMutation({
    mutationFn: api.saveTeacherOverride,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      router.back();
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const submit = () => {
    setFormError(null);
    const parsed = teacherOverrideSchema.safeParse({
      recitationId: id,
      overallScore: Number(score),
      remarks,
      dismissedErrorIndexes: dismissed,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  if (recitation.isPending) {
    return (
      <Screen>
        <PageHeader title={t('teacher.reviewRecitation')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  if (recitation.isError) {
    return (
      <Screen>
        <PageHeader title={t('teacher.reviewRecitation')} showBack />
        <ErrorState
          {...describeError(recitation.error)}
          retryLabel={t('common.retry')}
          onRetry={() => void recitation.refetch()}
        />
      </Screen>
    );
  }

  const data = recitation.data;
  const feedback = data.feedback;

  return (
    <Screen
      footer={
        <Button
          label={t('teacher.saveReview')}
          size="lg"
          loading={save.isPending}
          onPress={submit}
        />
      }
    >
      <PageHeader
        title={data.studentName}
        subtitle={`${data.surahName} · ${data.ayahFrom}–${data.ayahTo}`}
        showBack
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <Badge label={data.qiraahStyle} tone="accent" />
              <Badge label={formatDuration(data.durationMs)} />
              <Badge label={longDate(data.createdAt)} />
            </View>
            <RecitationPlayer storagePath={data.audioUrl} fallbackMs={data.durationMs} />
          </View>
        </Card>

        {feedback ? (
          <>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <ScoreRing score={feedback.overallScore} size={112} />
              <AppText variant="label" color="textMuted" uppercase>
                {t('teacher.aiFindings')}
              </AppText>
              <AppText variant="caption" color="textSubtle">
                {feedback.modelVersion}
              </AppText>
            </View>

            <View>
              <SectionHeader
                title={t('student.findings', { count: feedback.errors.length })}
                subtitle={t('common.select')}
              />
              <FindingList
                findings={feedback.errors}
                dismissed={dismissed}
                onToggleDismiss={(index) =>
                  setDismissed((current) =>
                    current.includes(index)
                      ? current.filter((value) => value !== index)
                      : [...current, index],
                  )
                }
              />
            </View>

            <AiDisclaimer />

            <View style={{ gap: theme.spacing.lg }}>
              <SectionHeader
                title={t('teacher.overrideScore')}
                subtitle={t('teacher.overrideBody')}
              />
              <TextField
                label={t('teacher.score')}
                value={score}
                onChangeText={setScore}
                error={fieldError(errors['overallScore'])}
                keyboardType="number-pad"
                maxLength={3}
                required
              />
              <TextField
                label={t('teacher.teacherRemarks')}
                value={remarks}
                onChangeText={setRemarks}
                error={fieldError(errors['remarks'])}
                multiline
                numberOfLines={4}
              />
              {formError ? (
                <AppText variant="caption" color="danger">
                  {formError}
                </AppText>
              ) : null}
            </View>
          </>
        ) : (
          <Card>
            <AppText variant="body" color="textMuted">
              {t('student.processing')}
            </AppText>
          </Card>
        )}
      </View>
    </Screen>
  );
}
