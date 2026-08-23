import {
  formatMoney,
  normaliseKenyanPhone,
  payFeesSchema,
  phoneSchema,
  type PaymentChannel,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, DeviceMobile, XCircle } from 'phosphor-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { CardForm, EMPTY_CARD, toCardInput, type CardFormValues } from '@/components/CardForm';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { PhoneField } from '@/components/PhoneField';
import { AppText, Button, Card, PageHeader, Screen } from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

type Phase = 'confirm' | 'waiting' | 'success' | 'failed';

/**
 * Fee payment by M-Pesa or card.
 *
 * The client sends invoice ids and a payment method and nothing else — the
 * amount is derived server-side from those invoices, so there is no field here
 * a tampered build could inflate. Status only ever moves because the server
 * says so; this screen polls and reports.
 */
export default function PayScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useRequiredSession();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const { invoiceIds } = useLocalSearchParams<{ invoiceIds: string }>();
  const ids = useMemo(
    () => (invoiceIds ?? '').split(',').filter(Boolean),
    [invoiceIds],
  );

  const [phase, setPhase] = useState<Phase>('confirm');
  const [channel, setChannel] = useState<PaymentChannel>('mpesa');
  const [phone, setPhone] = useState(session.user.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [card, setCard] = useState<CardFormValues>(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);

  const savedCards = useQuery({ queryKey: qk.savedCards(), queryFn: () => api.listSavedCards() });

  const invoices = useQuery({
    queryKey: qk.invoices({ scope: 'parent' }),
    queryFn: () => api.listInvoices({}),
  });

  const selected = (invoices.data ?? []).filter((invoice) => ids.includes(invoice.id));
  const total = selected.reduce(
    (sum, invoice) => sum + (invoice.amountDue - invoice.amountPaid),
    0,
  );

  const initiate = useMutation({
    mutationFn: api.payFees,
    onSuccess: (intent) => {
      setCheckoutRequestId(intent.checkoutRequestId);
      setPhase('waiting');
    },
    onError: (err) => setError(describeError(err).body),
  });

  const submitPayment = () => {
    setError(null);
    setCardErrors({});

    if (channel === 'mpesa') {
      const parsed = phoneSchema.safeParse(normaliseKenyanPhone(phone));
      if (!parsed.success) {
        setPhoneError(parsed.error.issues[0]?.message);
        return;
      }
      setPhoneError(undefined);
      initiate.mutate({ channel: 'mpesa', invoiceIds: ids, phone: parsed.data });
      return;
    }

    const parsed = payFeesSchema.safeParse({
      channel: 'card',
      invoiceIds: ids,
      card: toCardInput(card),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[issue.path.length - 1] ?? 'card');
        if (!next[key]) next[key] = t(issue.message);
      }
      setCardErrors(next);
      return;
    }
    initiate.mutate(parsed.data);
  };

  // Poll while the customer is entering their PIN. The real callback lands on
  // an Edge Function; this is the client watching for the result.
  const status = useQuery({
    queryKey: qk.paymentStatus(checkoutRequestId ?? ''),
    queryFn: () => api.getPaymentStatus(checkoutRequestId ?? ''),
    enabled: phase === 'waiting' && Boolean(checkoutRequestId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.status !== 'pending' ? false : 2000;
    },
  });

  const payment = status.data;

  useEffect(() => {
    if (phase !== 'waiting' || !payment) return;
    if (payment.status === 'success') {
      setPhase('success');
      // Balances, invoices and the inbox all changed the moment money landed.
      void queryClient.invalidateQueries();
    } else if (payment.status === 'failed' || payment.status === 'reversed') {
      setPhase('failed');
    }
  }, [payment, phase, queryClient]);

  return (
    <Screen>
      <PageHeader title={t('parent.payFees')} showBack={phase === 'confirm'} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        {phase === 'confirm' ? (
          <>
            <Card>
              <View style={{ gap: theme.spacing.md }}>
                <AppText variant="label" color="textMuted" uppercase>
                  {t('parent.amountToPay')}
                </AppText>
                <AppText variant="display">{formatMoney(total)}</AppText>
                <View style={{ gap: theme.spacing.sm }}>
                  {selected.map((invoice) => (
                    <View
                      key={invoice.id}
                      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                    >
                      <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                        {invoice.studentName} · {invoice.description}
                      </AppText>
                      <AppText variant="caption">
                        {formatMoney(invoice.amountDue - invoice.amountPaid, invoice.currency)}
                      </AppText>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            <PaymentMethodPicker
              value={channel}
              onChange={setChannel}
              savedCard={savedCards.data?.[0] ?? null}
            />

            {channel === 'mpesa' ? (
              <PhoneField
                label={t('parent.mpesaPhone')}
                value={phone}
                onChangeText={setPhone}
                error={fieldError(phoneError)}
                hint={t('auth.phoneHint')}
                required
              />
            ) : (
              <CardForm values={card} onChange={setCard} errors={cardErrors} />
            )}

            {error ? (
              <AppText variant="caption" color="danger">
                {error}
              </AppText>
            ) : null}

            <Button
              label={t('parent.payNow')}
              size="lg"
              disabled={total <= 0}
              loading={initiate.isPending}
              onPress={submitPayment}
            />
          </>
        ) : null}

        {phase === 'waiting' ? (
          <View style={{ alignItems: 'center', gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
            <DeviceMobile size={48} color={theme.colors.accent} weight="duotone" />
            <AppText variant="title" align="center">
              {channel === 'mpesa' ? t('parent.mpesaPrompt') : t('billing.authorising')}
            </AppText>
            <AppText variant="body" color="textMuted" align="center">
              {channel === 'mpesa'
                ? t('parent.mpesaPromptBody', { phone: normaliseKenyanPhone(phone) })
                : t('billing.cardProcessing')}
            </AppText>
            <ActivityIndicator color={theme.colors.accent} />
            <AppText variant="caption" color="textSubtle">
              {t('parent.mpesaWaiting')}
            </AppText>
          </View>
        ) : null}

        {phase === 'success' ? (
          <View style={{ alignItems: 'center', gap: theme.spacing.md, paddingTop: theme.spacing.xl }}>
            <CheckCircle size={56} color={theme.colors.success} weight="fill" />
            <AppText variant="title" align="center">
              {t('parent.paymentSuccess')}
            </AppText>
            <AppText variant="body" color="textMuted" align="center">
              {t('parent.paymentSuccessBody', {
                receipt: payment?.receiptNo ?? '—',
                amount: formatMoney(payment?.amount ?? total),
              })}
            </AppText>
            <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
              <Button label={t('common.done')} onPress={() => router.replace('/(parent)/fees')} />
            </View>
          </View>
        ) : null}

        {phase === 'failed' ? (
          <View style={{ alignItems: 'center', gap: theme.spacing.md, paddingTop: theme.spacing.xl }}>
            <XCircle size={56} color={theme.colors.danger} weight="fill" />
            <AppText variant="title" align="center">
              {t('parent.paymentFailed')}
            </AppText>
            <AppText variant="body" color="textMuted" align="center">
              {t('parent.paymentFailedBody')}
            </AppText>
            <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
              <Button
                label={t('common.retry')}
                onPress={() => {
                  setCheckoutRequestId(null);
                  setPhase('confirm');
                }}
              />
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => router.replace('/(parent)/fees')}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
