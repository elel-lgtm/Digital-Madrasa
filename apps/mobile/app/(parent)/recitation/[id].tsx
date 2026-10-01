import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { RecitationPlayer } from '@/components/RecitationPlayer';
import { AssessmentNote, recitationScore } from '@/components/AiFeedback';
import { AiDisclaimer, FindingList, ScoreRing } from '@/components/TajweedFeedback';
import {
  AppText,
  Badge,
  Card,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDuration, longDate } from '@/utils/dates';

/**
 * One of a child's recitations, for the parent.
 *
 * Nothing here decides who may look. The recitation is fetched with the same
 * `getRecitation` the student and teacher use, and the audio URL with the same
 * `getRecitationAudioUrl`; RLS answers `can_read_student`, which for a parent
 * means an approved link. A parent who opens this route for a child that is
 * not theirs gets a not-found from the database, not a hidden button.
 *
 * The storage path never reaches this screen's output — it is passed to the
 * player, which exchanges it for a short-lived signed URL.
 *
 * The distinction the screen exists to make is whose judgement is on display:
 * a provisional model score, or a teacher's. It says which, every time.
 */
export default function ParentRecitation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();

  const recitation = useQuery({
    queryKey: qk.recitation(id ?? ''),
    queryFn: () => api.getRecitation(id ?? ''),
    enabled: Boolean(id),
  });

  if (recitation.isPending) {
    return (
      <Screen>
        <PageHeader title={t('student.feedbackTitle')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  if (recitation.isError || !recitation.data) {
    return (
      <Screen>
        <PageHeader title={t('student.feedbackTitle')} showBack />
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
  const override = feedback?.teacherOverride ?? null;
  const { score: displayScore, badge } = recitationScore(feedback);

  return (
    <Screen
      refreshing={recitation.isFetching}
      onRefresh={() => void recitation.refetch()}
    >
      <PageHeader
        title={data.studentName}
        subtitle={`${data.surahName} · ${data.ayahFrom}–${data.ayahTo}`}
        showBack
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card>
          <View style={{ gap: theme.spacing.md }}>
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
              <ScoreRing score={displayScore} />
              <AppText variant="label" color="textMuted" uppercase>
                {t('student.overallScore')}
              </AppText>
              {/* Whose score this is, said plainly rather than implied by a
                  colour. A provisional model result and a teacher's assessment
                  must never be mistaken for one another. */}
              <Badge label={t(badge)} tone={override ? 'success' : undefined} />
            </View>

            <AssessmentNote feedback={feedback} />

            {override ? (
              <Card accent="success">
                <View style={{ gap: theme.spacing.sm }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                  >
                    <CheckCircle size={20} color={theme.colors.success} weight="fill" />
                    <AppText variant="bodyStrong">{t('teacher.teacherRemarks')}</AppText>
                  </View>
                  {override.remarks ? (
                    <AppText variant="body" color="textMuted">
                      {override.remarks}
                    </AppText>
                  ) : null}
                </View>
              </Card>
            ) : null}

            <View>
              <SectionHeader
                title={t('student.findings', { count: feedback.errors.length })}
              />
              <FindingList findings={feedback.errors} />
            </View>

            <AiDisclaimer />

            <AppText variant="caption" color="textSubtle" align="center">
              {feedback.modelVersion}
            </AppText>
          </>
        ) : (
          <Card>
            <AppText variant="body" color="textMuted">
              {t('empty.noRecitationsBody')}
            </AppText>
          </Card>
        )}
      </View>
    </Screen>
  );
}
