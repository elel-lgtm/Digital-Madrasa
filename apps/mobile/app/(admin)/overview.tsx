import { formatMoney } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Card,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
  StatTile,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/** The platform at a glance: schools, people, money, and whether delivery runs. */
export default function AdminOverview() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describe = useApiError();
  const overview = useQuery({ queryKey: qk.adminOverview(), queryFn: () => api.getAdminOverview() });

  const o = overview.data;
  const grid = { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md } as const;
  const tile = { flexGrow: 1, flexBasis: 180 } as const;

  return (
    <Screen refreshing={overview.isRefetching} onRefresh={() => void overview.refetch()}>
      <PageHeader title={t('admin.overviewTitle')} subtitle={t('admin.overviewSubtitle')} />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl, maxWidth: 1100 }}>
        {overview.isPending ? (
          <SkeletonList count={4} />
        ) : overview.isError || !o ? (
          <ErrorState
            title={describe(overview.error).title}
            body={describe(overview.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void overview.refetch()}
          />
        ) : (
          <>
            <View>
              <SectionHeader title={t('admin.madrasas')} />
              <View style={grid}>
                <View style={tile}>
                  <StatTile label={t('admin.status.active')} value={String(o.madrasas.active)} tone="success"
                    onPress={() => router.push('/(admin)/madrasas')} />
                </View>
                <View style={tile}>
                  <StatTile label={t('admin.status.suspended')} value={String(o.madrasas.suspended)}
                    tone={o.madrasas.suspended ? 'warning' : 'neutral'} onPress={() => router.push('/(admin)/madrasas')} />
                </View>
                <View style={tile}>
                  <StatTile label={t('admin.status.pending_deletion')} value={String(o.madrasas.pending_deletion)}
                    tone={o.madrasas.pending_deletion ? 'danger' : 'neutral'} onPress={() => router.push('/(admin)/madrasas')} />
                </View>
              </View>
            </View>

            <View>
              <SectionHeader title={t('admin.people')} />
              <View style={grid}>
                <View style={tile}><StatTile label={t('admin.students')} value={String(o.people.students)} /></View>
                <View style={tile}><StatTile label={t('admin.teachers')} value={String(o.people.teachers)} /></View>
                <View style={tile}><StatTile label={t('admin.parents')} value={String(o.people.parents)} /></View>
              </View>
            </View>

            <View>
              <SectionHeader title={t('admin.last30Days')} />
              <View style={grid}>
                <View style={tile}>
                  <StatTile label={t('admin.subscriptionRevenue')}
                    value={formatMoney(o.revenue30d.subscriptions, o.revenue30d.currency)} tone="accent" />
                </View>
                <View style={tile}>
                  <StatTile label={t('admin.feesCollected')}
                    value={formatMoney(o.revenue30d.feesCollected, o.revenue30d.currency)}
                    caption={t('admin.feesCollectedCaption')} />
                </View>
              </View>
            </View>

            <View>
              <SectionHeader title={t('admin.subscriptions')} />
              <Card>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {Object.entries(o.subscriptions).length === 0 ? (
                    <AppText color="textMuted">{t('admin.none')}</AppText>
                  ) : (
                    Object.entries(o.subscriptions).map(([status, n]) => (
                      <Badge key={status} label={`${t(`billing.status.${status}`, { defaultValue: status })}: ${n}`}
                        tone={status === 'active' || status === 'trialing' ? 'success'
                          : status === 'restricted' || status === 'cancelled' ? 'danger' : 'warning'} />
                    ))
                  )}
                </View>
              </Card>
            </View>

            <View>
              <SectionHeader title={t('admin.delivery')} />
              <Card accent={o.delivery.stalled || o.delivery.emailFailed || o.delivery.smsFailed ? 'warning' : 'success'}>
                <View style={{ gap: theme.spacing.xs }}>
                  <AppText variant="bodyStrong">
                    {o.delivery.stalled ? t('admin.deliveryStalled', { n: o.delivery.stalled }) : t('admin.deliveryOk')}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {t('admin.deliveryFailures', { email: o.delivery.emailFailed, sms: o.delivery.smsFailed })}
                  </AppText>
                </View>
              </Card>
            </View>

            <AppText variant="caption" color="textSubtle">
              {t('admin.generatedAt', { time: new Date(o.generatedAt).toLocaleString() })}
            </AppText>
          </>
        )}
      </View>
    </Screen>
  );
}
