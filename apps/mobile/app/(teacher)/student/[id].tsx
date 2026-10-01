import { formatMoney, percent } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Copy, Users } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { CertificateCard } from '@/components/CertificateCard';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  ListRow,
  PageHeader,
  ProgressBar,
  Screen,
  SectionHeader,
  SkeletonList,
  StatTile,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate } from '@/utils/dates';

export default function StudentDetail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [copied, setCopied] = useState(false);

  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: qk.student(id ?? ''),
    queryFn: () => api.getStudent(id ?? ''),
    enabled: Boolean(id),
  });
  const hifz = useQuery({
    queryKey: qk.hifz(id ?? ''),
    queryFn: () => api.listHifzProgress(id ?? ''),
    enabled: Boolean(id),
  });
  const certificates = useQuery({
    queryKey: qk.certificates(id ?? ''),
    queryFn: () => api.listCertificates(id ?? ''),
    enabled: Boolean(id),
  });
  const withdraw = useMutation({
    mutationFn: api.withdrawCertificate,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.certificates(id ?? '') }),
  });

  if (detail.isPending) {
    return (
      <Screen>
        <PageHeader title={t('nav.students')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      </Screen>
    );
  }

  if (detail.isError) {
    return (
      <Screen>
        <PageHeader title={t('nav.students')} showBack />
        <ErrorState
          {...describeError(detail.error)}
          retryLabel={t('common.retry')}
          onRetry={() => void detail.refetch()}
        />
      </Screen>
    );
  }

  const { student, attendanceRate, hifzSummary, recentGrades, outstandingBalance, linkedParents } =
    detail.data;

  return (
    <Screen refreshing={detail.isFetching} onRefresh={() => void detail.refetch()}>
      <PageHeader title={student.fullName} subtitle={student.className ?? undefined} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <Avatar name={student.fullName} size={56} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('parent.admissionNo')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('common.copy')} ${student.admissionNo}`}
                onPress={() => {
                  void Clipboard.setStringAsync(student.admissionNo);
                  setCopied(true);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
              >
                <AppText variant="heading" color="accent">
                  {student.admissionNo}
                </AppText>
                <Copy size={16} color={theme.colors.textSubtle} />
              </Pressable>
              {copied ? (
                <AppText variant="caption" color="success">
                  {t('common.copied')}
                </AppText>
              ) : (
                <AppText variant="caption" color="textSubtle">
                  {longDate(student.dateOfBirth)}
                </AppText>
              )}
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <StatTile
            label={t('teacher.attendance')}
            value={`${attendanceRate}%`}
            tone={attendanceRate >= 85 ? 'success' : 'warning'}
          />
          <StatTile
            label={t('parent.balance')}
            value={formatMoney(outstandingBalance)}
            tone={outstandingBalance > 0 ? 'danger' : 'success'}
          />
        </View>

        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="bodyStrong">{t('student.myProgress')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('student.juzComplete', { count: hifzSummary.juzCompleted })}
              </AppText>
            </View>
            <ProgressBar
              value={percent(hifzSummary.memorisedAyahs, hifzSummary.totalAyahs)}
              tone="accent"
              label={t('student.myProgress')}
            />
            <AppText variant="caption" color="textSubtle">
              {t('student.ayahsMemorised', { count: hifzSummary.memorisedAyahs })}
            </AppText>
          </View>
        </Card>

        <View>
          <SectionHeader
            title={t('learning.memorisation')}
            action={{
              label: t('learning.updateMemorisation'),
              onPress: () =>
                router.push({
                  pathname: '/(teacher)/hifz-update',
                  params: { studentId: student.id, name: student.fullName },
                }),
            }}
          />
          <Card padded={false}>
            {(hifz.data ?? []).length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('learning.noHifz')}
                </AppText>
              </View>
            ) : (
              [...(hifz.data ?? [])]
                .sort((a, b) => b.surahNo - a.surahNo)
                .slice(0, 8)
                .map((row, index) => (
                  <View key={row.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={`${row.surahNo}. ${row.surahName}`}
                      subtitle={`Juz ${row.juzNo}${row.status === 'learning' ? ` · ${t('learning.upToAyah')} ${row.ayahNo}` : ''}`}
                      onPress={() =>
                        router.push({
                          pathname: '/(teacher)/hifz-update',
                          params: { studentId: student.id, name: student.fullName, surahNo: String(row.surahNo) },
                        })
                      }
                      right={
                        <Badge
                          label={t(`learning.status_${row.status}`)}
                          tone={
                            row.status === 'mastered'
                              ? 'success'
                              : row.status === 'learning'
                                ? 'info'
                                : row.status === 'revising'
                                  ? 'warning'
                                  : 'accent'
                          }
                        />
                      }
                    />
                  </View>
                ))
            )}
          </Card>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <SectionHeader title={t('learning.certificates')} />
          {(certificates.data ?? []).length === 0 ? (
            <AppText variant="body" color="textMuted">
              {t('learning.noCertificates')}
            </AppText>
          ) : (
            (certificates.data ?? []).map((certificate) => (
              <CertificateCard
                key={certificate.id}
                certificate={certificate}
                withdrawing={withdraw.isPending && withdraw.variables === certificate.id}
                onWithdraw={() =>
                  Alert.alert(t('learning.withdraw'), t('learning.withdrawConfirm'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('learning.withdraw'),
                      style: 'destructive',
                      onPress: () => withdraw.mutate(certificate.id),
                    },
                  ])
                }
              />
            ))
          )}
          <Button
            label={t('learning.awardCertificate')}
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/(teacher)/certificate-new',
                params: { studentId: student.id, name: student.fullName },
              })
            }
          />
        </View>

        <View>
          <SectionHeader title={t('teacher.grades')} />
          <Card padded={false}>
            {recentGrades.length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('empty.noResultsBody')}
                </AppText>
              </View>
            ) : (
              recentGrades.map((grade, index) => (
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
        </View>

        <View>
          <SectionHeader
            title={t('teacher.linkRequests')}
            action={{
              label: t('common.seeAll'),
              onPress: () => router.push('/(teacher)/link-requests'),
            }}
          />
          <Card padded={false}>
            {linkedParents.length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('empty.noRequestsBody')}
                </AppText>
              </View>
            ) : (
              linkedParents.map((link, index) => (
                <View key={link.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={link.parentName}
                    subtitle={t(`parent.${link.relationship}`)}
                    left={<Users size={20} color={theme.colors.textMuted} weight="duotone" />}
                    showChevron={false}
                    right={<Badge label={t('teacher.approved')} tone="success" />}
                  />
                </View>
              ))
            )}
          </Card>
        </View>
      </View>
    </Screen>
  );
}
