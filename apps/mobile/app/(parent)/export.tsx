import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { DownloadSimple } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useChildren } from '@/hooks/useChildren';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Data export.
 *
 * Both a trust feature and a Kenya Data Protection Act obligation: a parent
 * can take a complete copy of their child's records at any time, without
 * asking the madrasa.
 */
export default function ExportData() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const { children, activeId } = useChildren();
  const [copied, setCopied] = useState(false);

  const overview = useQuery({
    queryKey: qk.childOverview(activeId ?? ''),
    queryFn: () => api.getChildOverview(activeId ?? ''),
    enabled: Boolean(activeId),
  });

  const invoices = useQuery({
    queryKey: qk.invoices({ studentId: activeId }),
    queryFn: () => api.listInvoices({ studentId: activeId ?? undefined }),
    enabled: Boolean(activeId),
  });

  const payload =
    overview.data && invoices.data
      ? JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            student: overview.data.student,
            attendance: overview.data.recentAttendance,
            grades: overview.data.grades,
            hifz: overview.data.hifzSummary,
            recitations: overview.data.recentRecitations.map((r) => ({
              surah: r.surahName,
              ayahFrom: r.ayahFrom,
              ayahTo: r.ayahTo,
              createdAt: r.createdAt,
              score: r.feedback?.teacherOverride?.overallScore ?? r.feedback?.overallScore ?? null,
            })),
            certificates: overview.data.certificates,
            invoices: invoices.data,
          },
          null,
          2,
        )
      : null;

  return (
    <Screen>
      <PageHeader title={t('parent.exportData')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        {children.length === 0 ? (
          <Card>
            <AppText variant="body" color="textMuted">
              {t('empty.noChildrenBody')}
            </AppText>
          </Card>
        ) : overview.isPending || invoices.isPending ? (
          <SkeletonList count={3} />
        ) : overview.isError ? (
          <ErrorState
            {...describeError(overview.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void overview.refetch()}
          />
        ) : (
          <>
            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="subheading">{overview.data.student.fullName}</AppText>
                <AppText variant="caption" color="textMuted">
                  {overview.data.student.admissionNo}
                </AppText>
                <AppText variant="body" color="textMuted">
                  Includes attendance, grades, hifz progress, recitation scores, certificates and
                  the full fee history.
                </AppText>
              </View>
            </Card>

            <Button
              label={copied ? t('common.copied') : t('common.download')}
              icon={<DownloadSimple size={18} color={theme.colors.textOnAccent} weight="bold" />}
              onPress={() => {
                if (!payload) return;
                void Clipboard.setStringAsync(payload);
                setCopied(true);
              }}
            />

            <View>
              <SectionHeader title="Preview" />
              <Card>
                <AppText variant="caption" color="textSubtle" numberOfLines={20}>
                  {payload?.slice(0, 1200)}
                </AppText>
              </Card>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
