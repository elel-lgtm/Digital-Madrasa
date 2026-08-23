import { formatMoney, percent } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Certificate as CertificateIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { ScoreRing } from '@/components/TajweedFeedback';
import {
  AppText,
  Badge,
  Card,
  Divider,
  ErrorState,
  ListRow,
  PageHeader,
  ProgressBar,
  Screen,
  SectionHeader,
  Segmented,
  SkeletonList,
  StatTile,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate, shortDate } from '@/utils/dates';

type Tab = 'progress' | 'attendance' | 'grades';

export default function ChildDetail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('progress');

  const overview = useQuery({
    queryKey: qk.childOverview(id ?? ''),
    queryFn: () => api.getChildOverview(id ?? ''),
    enabled: Boolean(id),
  });

  if (overview.isPending) {
    return (
      <Screen>
        <PageHeader title={t('parent.progress')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      </Screen>
    );
  }

  if (overview.isError) {
    return (
      <Screen>
        <PageHeader title={t('parent.progress')} showBack />
        <ErrorState
          {...describeError(overview.error)}
          retryLabel={t('common.retry')}
          onRetry={() => void overview.refetch()}
        />
      </Screen>
    );
  }

  const data = overview.data;

  return (
    <Screen refreshing={overview.isFetching} onRefresh={() => void overview.refetch()}>
      <PageHeader
        title={data.student.fullName}
        subtitle={`${data.student.className ?? ''} · ${data.student.admissionNo}`}
        showBack
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <StatTile
            label={t('parent.attendance')}
            value={`${data.attendanceRate}%`}
            tone={data.attendanceRate >= 85 ? 'success' : 'warning'}
          />
          <StatTile
            label={t('parent.balance')}
            value={formatMoney(data.outstandingBalance)}
            tone={data.outstandingBalance > 0 ? 'danger' : 'success'}
          />
        </View>

        <Segmented
          options={[
            { value: 'progress', label: t('parent.progress') },
            { value: 'attendance', label: t('parent.attendance') },
            { value: 'grades', label: t('parent.grades') },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'progress' ? (
          <View style={{ gap: theme.spacing.xl }}>
            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="bodyStrong">{t('student.memorised')}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {t('student.juzComplete', { count: data.hifzSummary.juzCompleted })}
                  </AppText>
                </View>
                <ProgressBar
                  value={percent(data.hifzSummary.memorisedAyahs, data.hifzSummary.totalAyahs)}
                  tone="accent"
                  label={t('parent.progress')}
                />
                <AppText variant="caption" color="textSubtle">
                  {t('student.ayahsMemorised', { count: data.hifzSummary.memorisedAyahs })}
                </AppText>
              </View>
            </Card>

            <View>
              <SectionHeader title={t('student.feedbackTitle')} />
              {data.recentRecitations.length === 0 ? (
                <Card>
                  <AppText variant="body" color="textMuted">
                    {t('empty.noRecitationsBody')}
                  </AppText>
                </Card>
              ) : (
                <View style={{ gap: theme.spacing.md }}>
                  {data.recentRecitations.map((recitation) => {
                    const score =
                      recitation.feedback?.teacherOverride?.overallScore ??
                      recitation.feedback?.overallScore;
                    return (
                      <Card key={recitation.id}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: theme.spacing.lg,
                          }}
                        >
                          {score !== undefined ? <ScoreRing score={score} size={72} /> : null}
                          <View style={{ flex: 1, gap: 2 }}>
                            <AppText variant="bodyStrong">
                              {recitation.surahName} · {recitation.ayahFrom}–{recitation.ayahTo}
                            </AppText>
                            <AppText variant="caption" color="textMuted">
                              {shortDate(recitation.createdAt)}
                            </AppText>
                            {recitation.feedback?.teacherOverride ? (
                              <AppText variant="caption" color="textSubtle" numberOfLines={2}>
                                {recitation.feedback.teacherOverride.remarks}
                              </AppText>
                            ) : null}
                          </View>
                        </View>
                      </Card>
                    );
                  })}
                </View>
              )}
            </View>

            {data.certificates.length > 0 ? (
              <View>
                <SectionHeader title={t('parent.reportCard')} />
                <Card padded={false}>
                  {data.certificates.map((certificate, index) => (
                    <View key={certificate.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                      {index > 0 ? <Divider /> : null}
                      <ListRow
                        title={certificate.title}
                        subtitle={longDate(certificate.issuedAt)}
                        left={
                          <CertificateIcon
                            size={22}
                            color={theme.colors.accent}
                            weight="duotone"
                          />
                        }
                        right={<Badge label={certificate.verificationCode} />}
                        showChevron={false}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'attendance' ? (
          <Card padded={false}>
            {data.recentAttendance.map((record, index) => (
              <View key={record.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  title={longDate(record.sessionDate)}
                  subtitle={record.method === 'qr' ? 'QR' : undefined}
                  showChevron={false}
                  right={
                    <Badge
                      label={t(`teacher.${record.status}`)}
                      tone={
                        record.status === 'present'
                          ? 'success'
                          : record.status === 'absent'
                            ? 'danger'
                            : 'warning'
                      }
                    />
                  }
                />
              </View>
            ))}
          </Card>
        ) : null}

        {tab === 'grades' ? (
          <Card padded={false}>
            {data.grades.length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('empty.noResultsBody')}
                </AppText>
              </View>
            ) : (
              data.grades.map((grade, index) => (
                <View key={grade.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={grade.subject}
                    subtitle={grade.term}
                    showChevron={false}
                    right={
                      <Badge
                        label={`${grade.score}/${grade.maxScore}`}
                        tone={
                          grade.score / grade.maxScore >= 0.8
                            ? 'success'
                            : grade.score / grade.maxScore >= 0.5
                              ? 'warning'
                              : 'danger'
                        }
                      />
                    }
                  />
                </View>
              ))
            )}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
