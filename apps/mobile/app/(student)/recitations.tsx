import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Microphone } from 'phosphor-react-native';
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
  ListRow,
  PageHeader,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate } from '@/utils/dates';

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Everything the student has recited, newest first.
 *
 * Until now the feedback screen was reachable only in the moment after
 * submitting, so a teacher's assessment — the part that actually matters —
 * could never be read again once the screen was dismissed. This is the way
 * back to it.
 *
 * `listRecitations` is scoped by RLS to the caller, so a student sees their own
 * and nothing else; no filter here is doing that work.
 */
export default function StudentRecitations() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const recitations = useQuery({
    queryKey: qk.recitations({}),
    queryFn: () => api.listRecitations({}),
  });

  return (
    <Screen
      refreshing={recitations.isFetching}
      onRefresh={() => void recitations.refetch()}
    >
      <PageHeader title={t('student.myRecitations')} showBack />

      <View style={{ marginTop: theme.spacing.lg }}>
        {recitations.isPending ? (
          <SkeletonList count={3} />
        ) : recitations.isError ? (
          <ErrorState
            {...describeError(recitations.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void recitations.refetch()}
          />
        ) : (recitations.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Microphone size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noRecitations')}
            body={t('empty.noRecitationsBody')}
          />
        ) : (
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              {(recitations.data ?? []).map((recitation) => {
                const feedback = recitation.feedback;
                // The teacher's score is the one that counts; the model's is
                // shown only until a teacher has spoken.
                const reviewed = Boolean(feedback?.teacherOverride);
                const score = feedback?.teacherOverride?.overallScore ?? feedback?.overallScore;

                return (
                  <ListRow
                    key={recitation.id}
                    title={`${recitation.surahName} · ${recitation.ayahFrom}–${recitation.ayahTo}`}
                    subtitle={`${longDate(recitation.createdAt)} · ${duration(recitation.durationMs)} · ${recitation.qiraahStyle}`}
                    right={
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {score !== undefined ? (
                          <AppText variant="bodyStrong">{Math.round(score)}</AppText>
                        ) : null}
                        <Badge
                          label={reviewed ? t('teacher.reviewed') : t('student.aiOnly')}
                          tone={reviewed ? 'success' : undefined}
                        />
                      </View>
                    }
                    onPress={() =>
                      router.push({
                        pathname: '/(student)/feedback/[id]',
                        params: { id: recitation.id },
                      })
                    }
                  />
                );
              })}
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}
