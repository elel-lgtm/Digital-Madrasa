import type { Recitation } from '@digital-madrasa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AppText, Card, ToggleRow } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Feedback = NonNullable<Recitation['feedback']>;

/**
 * The score to show for a recitation, and whose it is.
 *
 * The teacher's score wins. Otherwise the model's, if the audio was assessed.
 * A recitation that was not assessed has no score at all, never a stand-in.
 */
export function recitationScore(feedback: Feedback | null | undefined): {
  score: number | null;
  badge: 'teacher.reviewed' | 'student.aiOnly' | 'aiFeedback.awaitingTeacher';
  reviewed: boolean;
} {
  const override = feedback?.teacherOverride ?? null;
  if (override) return { score: override.overallScore, badge: 'teacher.reviewed', reviewed: true };
  if (feedback && feedback.overallScore !== null) {
    return { score: feedback.overallScore, badge: 'student.aiOnly', reviewed: false };
  }
  return { score: null, badge: 'aiFeedback.awaitingTeacher', reviewed: false };
}

/**
 * Whether "no issues found" may be said. Only of a recording that was
 * assessed and in which the passage was heard: a score of 0 means the model
 * heard silence, other speech or another passage, and that is not praise.
 */
export function praiseAllowed(feedback: Feedback): boolean {
  return feedback.assessment === 'assessed' && feedback.overallScore !== null && feedback.overallScore > 0;
}

/** Says why there is no AI score, or why it is 0, where a score would otherwise be. */
export function AssessmentNote({ feedback }: { feedback: Feedback }) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (feedback.teacherOverride) return null;
  const notHeard = feedback.assessment === 'assessed' && feedback.overallScore === 0;
  if (feedback.assessment === 'assessed' && !notHeard) return null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
        <Info size={20} color={theme.colors.textMuted} />
        <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
          {notHeard
            ? t('aiFeedback.notHeard')
            : feedback.assessment === 'not_consented'
              ? t('aiFeedback.notConsented')
              : t('aiFeedback.unavailable')}
        </AppText>
      </View>
    </Card>
  );
}

/**
 * The switch that allows a pupil's recordings to be sent for AI feedback.
 *
 * Parents and madrasa staff see the same switch with different wording: staff
 * should only turn it on with the parent's written consent. The database
 * checks who may change it and records who did (migration 0028).
 */
export function AiConsentCard({
  studentId,
  allowed,
  audience,
}: {
  studentId: string;
  allowed: boolean;
  audience: 'parent' | 'staff';
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();

  const change = useMutation({
    mutationFn: (value: boolean) => api.setAiFeedbackConsent(studentId, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.childOverview(studentId) });
      void queryClient.invalidateQueries({ queryKey: qk.student(studentId) });
    },
  });

  return (
    <Card>
      <ToggleRow
        label={t('aiFeedback.consentTitle')}
        description={audience === 'parent' ? t('aiFeedback.consentBodyParent') : t('aiFeedback.consentBodyStaff')}
        value={change.isPending ? Boolean(change.variables) : allowed}
        onChange={(value) => change.mutate(value)}
      />
      {change.isError ? (
        <AppText variant="caption" color="danger" style={{ marginTop: theme.spacing.xs }}>
          {describeError(change.error).body}
        </AppText>
      ) : null}
    </Card>
  );
}
