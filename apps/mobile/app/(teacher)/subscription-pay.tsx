import {
  formatMoney,
  normaliseKenyanPhone,
  phoneSchema,
  startSubscriptionPaymentSchema,
  type PaymentChannel,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CheckCircle, XCircle } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { HostedCardNote, openCardCheckout } from '@/components/CardCheckout';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { PhoneField } from '@/components/PhoneField';
import {
  AppText,
  Button,
  Card,
  Divider,
  PageHeader,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

type Stage = 'form' | 'processing' | 'success' | 'failed';

export default function SubscriptionPay() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const session = useRequiredSession();

  const [channel, setChannel] = useState<PaymentChannel>('mpesa');
  const [phone, setPhone] = useState(session.user.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>('form');
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const subscription = useQuery({
    queryKey: qk.subscription(),
    queryFn: () => api.getSubscription(),
  });
  const cards = useQuery({ queryKey: qk.savedCards(), queryFn: () => api.listSavedCards() });

  const start = useMutation({
    mutationFn: api.startSubscriptionPayment,
    onSuccess: (intent) => {
      setCheckoutId(intent.checkoutRequestId);
      setStage('processing');
      // Card: the gateway's page opens over the app; polling carries on.
      void openCardCheckout(intent.authorisationUrl);
    },
    onError: (error) => {
      setFailure(describeError(error).body);
      setStage('failed');
    },
  });

  // Polls for the gateway callback. The client never decides the outcome —
  // it only asks the server what happened.
  const status = useQuery({
    queryKey: qk.subscriptionPaymentStatus(checkoutId ?? ''),
    queryFn: () => api.getSubscriptionPaymentStatus(checkoutId!),
    enabled: stage === 'processing' && Boolean(checkoutId),
    refetchInterval: 1500,
  });

  useEffect(() => {
    const payment = status.data;
    if (!payment || stage !== 'processing') return;

    if (payment.status === 'success') {
      setStage('success');
      void queryClient.invalidateQueries();
    } else if (payment.status === 'failed') {
      setFailure(payment.failureReason ?? t('billing.paymentFailedBody'));
      setStage('failed');
    }
  }, [status.data, stage, queryClient, t]);

  const submit = () => {
    setErrors({});
    setFailure(null);

    if (channel === 'mpesa') {
      const parsed = phoneSchema.safeParse(normaliseKenyanPhone(phone));
      if (!parsed.success) {
        setErrors({ phone: parsed.error.issues[0]?.message ?? 'validation.phone_invalid' });
        return;
      }
      start.mutate({ channel: 'mpesa', phone: parsed.data });
      return;
    }

    start.mutate(startSubscriptionPaymentSchema.parse({ channel: 'card' }));
  };

  if (subscription.isPending || !subscription.data) {
    return (
      <Screen>
        <PageHeader title={t('billing.payTitle')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  const sub = subscription.data;
  const price = formatMoney(sub.plan.amount, sub.plan.currency);

  if (stage === 'success') {
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.xxl,
          }}
        >
          <CheckCircle size={64} color={theme.colors.success} weight="duotone" />
          <AppText variant="title" align="center">
            {t('billing.paymentSuccessTitle')}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            {t('billing.paymentSuccessBody', { price })}
          </AppText>
          {status.data?.receiptNo ? (
            <AppText variant="caption" color="textSubtle">
              {t('billing.receiptNo', { no: status.data.receiptNo })}
            </AppText>
          ) : null}
          <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg }}>
            <Button label={t('common.done')} onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  if (stage === 'processing') {
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.xxl,
          }}
        >
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <AppText variant="title" align="center">
            {channel === 'mpesa' ? t('billing.checkYourPhone') : t('billing.authorising')}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            {channel === 'mpesa' ? t('billing.stkSent', { price }) : t('billing.cardProcessing')}
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        footer={
          <Button
            label={t('billing.payNow', { price })}
            size="lg"
            loading={start.isPending}
            onPress={submit}
          />
        }
      >
        <PageHeader title={t('billing.payTitle')} subtitle={sub.plan.name} showBack />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
          <Card accent="accent">
            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="caption" color="textMuted" uppercase>
                {t('billing.amountDue')}
              </AppText>
              <AppText variant="display">{price}</AppText>
              <Divider />
              <AppText variant="caption" color="textMuted">
                {t('billing.oneMonthOfAccess')}
              </AppText>
            </View>
          </Card>

          {stage === 'failed' && failure ? (
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.dangerSoft,
              }}
            >
              <XCircle size={20} color={theme.colors.danger} weight="fill" />
              <AppText variant="caption" color="danger" style={{ flex: 1 }}>
                {failure}
              </AppText>
            </View>
          ) : null}

          <PaymentMethodPicker
            value={channel}
            onChange={setChannel}
            savedCard={cards.data?.[0] ?? null}
          />

          {channel === 'mpesa' ? (
            <PhoneField
              label={t('billing.mpesaPhone')}
              value={phone}
              onChangeText={setPhone}
              error={fieldError(errors.phone)}
              hint={t('billing.mpesaPhoneHint')}
              required
            />
          ) : (
            <HostedCardNote />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
