import {
  GRACE_DAYS,
  formatMoney,
  trialDaysLeft,
  type SubscriptionStatus,
} from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CheckCircle, Receipt, Sparkle } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { brandLabel } from '@/components/PaymentMethodPicker';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { shortDate } from '@/utils/dates';

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const session = useRequiredSession();

  const isOwner = session.teacher?.isOwner ?? false;

  const subscription = useQuery({
    queryKey: qk.subscription(),
    queryFn: () => api.getSubscription(),
  });
  const payments = useQuery({
    queryKey: qk.subscriptionPayments(),
    queryFn: () => api.listSubscriptionPayments(),
  });

  if (subscription.isPending) {
    return (
      <Screen>
        <PageHeader title={t('billing.subscription')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  if (subscription.isError || !subscription.data) {
    return (
      <Screen>
        <PageHeader title={t('billing.subscription')} showBack />
        <ErrorState
          {...describeError(subscription.error)}
          retryLabel={t('common.retry')}
          onRetry={() => void subscription.refetch()}
        />
      </Screen>
    );
  }

  const sub = subscription.data;
  const daysLeft = trialDaysLeft(sub);
  const price = formatMoney(sub.plan.amount, sub.plan.currency);
  const tone = statusTone(sub.status);

  return (
    <Screen
      refreshing={subscription.isFetching}
      onRefresh={() => void subscription.refetch()}
      footer={
        isOwner && sub.status !== 'active' ? (
          <Button
            label={t('billing.payNow', { price })}
            size="lg"
            onPress={() => router.push('/(teacher)/subscription-pay')}
          />
        ) : undefined
      }
    >
      <PageHeader title={t('billing.subscription')} subtitle={sub.plan.name} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        {/* Status is the first thing an owner needs, so it leads. */}
        <Card accent={tone.accent}>
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <AppText variant="subheading" style={{ flex: 1 }}>
                {t(`billing.status.${sub.status}`)}
              </AppText>
              <Badge label={t(`billing.status.${sub.status}`)} tone={tone.badge} />
            </View>

            {sub.status === 'trialing' ? (
              <>
                <AppText variant="display" color="accent">
                  {t('billing.daysLeft', { count: daysLeft })}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {t('billing.trialEnds', { date: shortDate(sub.trialEndsAt ?? '') })}
                </AppText>
              </>
            ) : null}

            {sub.status === 'active' && sub.currentPeriodEnd ? (
              <AppText variant="caption" color="textMuted">
                {sub.cancelAtPeriodEnd
                  ? t('billing.endsOn', { date: shortDate(sub.currentPeriodEnd) })
                  : t('billing.renewsOn', { date: shortDate(sub.currentPeriodEnd) })}
              </AppText>
            ) : null}

            {sub.status === 'grace' && sub.graceEndsAt ? (
              <AppText variant="caption" color="danger">
                {t('billing.graceEnds', {
                  date: shortDate(sub.graceEndsAt),
                  count: GRACE_DAYS,
                })}
              </AppText>
            ) : null}

            {sub.status === 'restricted' ? (
              <AppText variant="caption" color="danger">
                {t('billing.restrictedBody')}
              </AppText>
            ) : null}
          </View>
        </Card>

        {/* What the money buys. */}
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs }}>
              <AppText variant="display">{price}</AppText>
              <AppText variant="body" color="textMuted">
                {t('billing.perMonth')}
              </AppText>
            </View>

            <Divider />

            {sub.plan.features.map((feature) => (
              <View
                key={feature}
                style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}
              >
                <CheckCircle size={18} color={theme.colors.success} weight="fill" />
                <AppText variant="body" style={{ flex: 1 }}>
                  {feature}
                </AppText>
              </View>
            ))}

            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                alignItems: 'center',
                marginTop: theme.spacing.xs,
              }}
            >
              <Sparkle size={16} color={theme.colors.accent} weight="fill" />
              <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                {t('billing.learningNeverBlocked')}
              </AppText>
            </View>
          </View>
        </Card>

        {sub.defaultCard ? (
          <View>
            <SectionHeader title={t('billing.paymentMethod')} />
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">
                    {brandLabel(sub.defaultCard)} •••• {sub.defaultCard.last4}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {t('billing.expiresOn', {
                      month: String(sub.defaultCard.expiryMonth).padStart(2, '0'),
                      year: String(sub.defaultCard.expiryYear).slice(-2),
                    })}
                  </AppText>
                </View>
                <Badge label={t('billing.autoRenew')} tone="success" />
              </View>
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader title={t('billing.paymentHistory')} />
          <Card padded={false}>
            {payments.isPending ? (
              <View style={{ padding: theme.spacing.lg }}>
                <SkeletonList count={2} />
              </View>
            ) : (payments.data ?? []).length === 0 ? (
              <View
                style={{ padding: theme.spacing.lg, alignItems: 'center', gap: theme.spacing.sm }}
              >
                <Receipt size={28} color={theme.colors.textSubtle} weight="duotone" />
                <AppText variant="body" color="textMuted" align="center">
                  {t('billing.noPayments')}
                </AppText>
              </View>
            ) : (
              (payments.data ?? []).map((payment, index) => (
                <View key={payment.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.md,
                      paddingVertical: theme.spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyStrong">
                        {formatMoney(payment.amount, payment.currency)}
                      </AppText>
                      <AppText variant="caption" color="textMuted">
                        {payment.cardLast4
                          ? t('billing.paidByCard', { last4: payment.cardLast4 })
                          : t('billing.paidByMpesa')}
                        {' · '}
                        {shortDate(payment.createdAt)}
                      </AppText>
                      {payment.failureReason ? (
                        <AppText variant="caption" color="danger">
                          {payment.failureReason}
                        </AppText>
                      ) : null}
                    </View>
                    <Badge
                      label={t(`billing.paymentStatus.${payment.status}`)}
                      tone={
                        payment.status === 'success'
                          ? 'success'
                          : payment.status === 'failed'
                            ? 'danger'
                            : 'warning'
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>

        {!isOwner ? (
          <AppText variant="caption" color="textSubtle" align="center">
            {t('billing.ownerOnly')}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

function statusTone(status: SubscriptionStatus): {
  accent: 'accent' | 'success' | 'warning' | 'danger' | 'info';
  badge: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
} {
  switch (status) {
    case 'active':
      return { accent: 'success', badge: 'success' };
    case 'trialing':
      return { accent: 'accent', badge: 'accent' };
    case 'past_due':
      return { accent: 'warning', badge: 'warning' };
    case 'grace':
    case 'restricted':
      return { accent: 'danger', badge: 'danger' };
    case 'cancelled':
      return { accent: 'warning', badge: 'neutral' };
  }
}
