import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { api } from '@/api';
import { RecitationPlayer } from '@/components/RecitationPlayer';
import { qk } from '@/api/keys';
import { AssessmentNote, praiseAllowed, recitationScore } from '@/components/AiFeedback';
import { AiDisclaimer, FindingList, ScoreRing } from '@/components/TajweedFeedback';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDuration } from '@/utils/dates';

export default function RecitationFeedback() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const { id } = useLocalSearchParams<{ id: string }>();

  // The evaluation job runs server-side; this resolves when it finishes.
  const feedback = useQuery({
    queryKey: qk.recitation(id ?? ''),
    queryFn: () => api.awaitTajweedFeedback(id ?? ''),
    enabled: Boolean(id),
    staleTime: Infinity,
  });

  if (feedback.isPending) {
    return (
      <Screen>
        <PageHeader title={t('student.feedbackTitle')} showBack />
        <View
          style={{
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingTop: theme.spacing.xxxl,
          }}
        >
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <AppText variant="heading" align="center">
            {t('student.processing')}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            {t('student.processingBody')}
          </AppText>
        </View>
      </Screen>
    );
  }

  if (feedback.isError || !feedback.data.feedback) {
    return (
      <Screen>
        <PageHeader title={t('student.feedbackTitle')} showBack />
        <ErrorState
          {...describeError(feedback.error)}
          retryLabel={t('common.retry')}
          onRetry={() => void feedback.refetch()}
        />
      </Screen>
    );
  }

  const recitation = feedback.data;
  const result = recitation.feedback!;
  const { score: displayScore } = recitationScore(result);

  return (
    <Screen>
      <PageHeader
        title={t('student.feedbackTitle')}
        subtitle={`${recitation.surahName} · ${recitation.ayahFrom}–${recitation.ayahTo}`}
        showBack
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <ScoreRing score={displayScore} />
          <AppText variant="label" color="textMuted" uppercase>
            {t('student.overallScore')}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            {formatDuration(recitation.durationMs)} · {recitation.qiraahStyle}
          </AppText>
        </View>

        <AssessmentNote feedback={result} />

        {/* Hearing the recording back is most of what makes a correction
            useful. The same player the teacher uses, on the same short-lived
            signed URL — the bucket stays private for both. */}
        <Card>
          <RecitationPlayer
            storagePath={recitation.audioUrl}
            fallbackMs={recitation.durationMs}
          />
        </Card>

        {result.teacherOverride ? (
          <Card accent="success">
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <CheckCircle size={20} color={theme.colors.success} weight="fill" />
                <AppText variant="bodyStrong">{t('teacher.teacherRemarks')}</AppText>
              </View>
              <AppText variant="body" color="textMuted">
                {result.teacherOverride.remarks}
              </AppText>
            </View>
          </Card>
        ) : null}

        {/* With no findings, the heading is itself praise ("No tajweed issues
            found"), so the section is left out when nobody listened. */}
        {result.errors.length > 0 || praiseAllowed(result) ? (
          <View>
            <SectionHeader
              title={
                result.errors.length === 0
                  ? t('student.noFindings')
                  : t('student.findings', { count: result.errors.length })
              }
            />
            <FindingList findings={result.errors} assessed={praiseAllowed(result)} />
          </View>
        ) : null}

        <AiDisclaimer />

        <View style={{ gap: theme.spacing.md }}>
          <Button
            label={t('student.recordAgain')}
            variant="secondary"
            onPress={() => router.replace('/(student)/recite')}
          />
          <Button label={t('common.done')} onPress={() => router.replace('/(student)/dashboard')} />
        </View>

        <AppText variant="caption" color="textSubtle" align="center">
          {result.modelVersion}
        </AppText>
      </View>
    </Screen>
  );
}
