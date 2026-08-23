import {
  billingUrgency,
  formatMoney,
  trialDaysLeft,
  type Subscription,
} from '@digital-madrasa/shared';
import { useRouter } from 'expo-router';
import { ArrowRight, Clock, Warning } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The billing nudge on the teacher dashboard.
 *
 * Prominence escalates with urgency rather than shouting from day one — a
 * banner that looks the same on trial day 1 and on the day access is about to
 * be restricted teaches owners to ignore it.
 */
export function SubscriptionBanner({ subscription }: { subscription: Subscription }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const urgency = billingUrgency(subscription);
  if (urgency === 'none') return null;

  const daysLeft = trialDaysLeft(subscription);
  const price = formatMoney(subscription.plan.amount, subscription.plan.currency);

  const copy = (() => {
    switch (subscription.status) {
      case 'trialing':
        return {
          title: t('billing.trialTitle', { count: daysLeft }),
          body: t('billing.trialBody', { price }),
        };
      case 'past_due':
        return { title: t('billing.pastDueTitle'), body: t('billing.pastDueBody', { price }) };
      case 'grace':
        return { title: t('billing.graceTitle'), body: t('billing.graceBody') };
      case 'restricted':
        return { title: t('billing.restrictedTitle'), body: t('billing.restrictedBody') };
      case 'cancelled':
        return { title: t('billing.cancelledTitle'), body: t('billing.cancelledBody') };
      default:
        return null;
    }
  })();

  if (!copy) return null;

  const tone =
    urgency === 'critical'
      ? { bg: theme.colors.dangerSoft, fg: theme.colors.danger, text: 'danger' as const }
      : urgency === 'warning'
        ? { bg: theme.colors.warningSoft, fg: theme.colors.warning, text: 'warning' as const }
        : { bg: theme.colors.infoSoft, fg: theme.colors.info, text: 'info' as const };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      accessibilityHint={t('billing.openSubscription')}
      onPress={() => router.push('/(teacher)/subscription')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: tone.bg,
        borderWidth: urgency === 'critical' ? 1 : 0,
        borderColor: tone.fg,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      {urgency === 'critical' ? (
        <Warning size={24} color={tone.fg} weight="fill" />
      ) : (
        <Clock size={24} color={tone.fg} weight="duotone" />
      )}

      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" color={tone.text}>
          {copy.title}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {copy.body}
        </AppText>
      </View>

      <ArrowRight size={18} color={tone.fg} />
    </Pressable>
  );
}
