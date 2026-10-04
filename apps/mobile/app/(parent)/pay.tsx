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
import { HostedCardNote, openCardCheckout } from '@/components/CardCheckout';
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

  const { invoiceIds, sponsor } = useLocalSearchParams<{ invoiceIds: string; sponsor?: string }>();
  const ids = useMemo(
    () => (invoiceIds ?? '').split(',').filter(Boolean),
    [invoiceIds],
  );

  const [phase, setPhase] = useState<Phase>('confirm');
  const [channel, setChannel] = useState<PaymentChannel>('mpesa');
  const [phone, setPhone] = useState(session.user.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);

  const savedCards = useQuery({ queryKey: qk.savedCards(), queryFn: () => api.listSavedCards() });

  const invoices = useQuery({
    queryKey: qk.invoices({ scope: 'parent' }),
    queryFn: () => api.listInvoices({}),
  });

  // Sponsoring a pupil: the amount is that pupil's next unpaid invoice, as
  // the server will charge it. The pupil stays anonymous here too.
  const sponsorable = useQuery({
    queryKey: ['sponsorable'],
    queryFn: () => api.listSponsorable(),
    enabled: Boolean(sponsor),
  });
  const pupil = sponsor ? (sponsorable.data ?? []).find((p) => p.studentId === sponsor) : undefined;

  const selected = sponsor ? [] : (invoices.data ?? []).filter((invoice) => ids.includes(invoice.id));
  const total = pupil
    ? pupil.invoiceOwed
    : selected.reduce((sum, invoice) => sum + (invoice.amountDue - invoice.amountPaid), 0);
  const leave = () => router.replace(sponsor ? '/(parent)/sponsor' : '/(parent)/fees');

  const initiate = useMutation({
    mutationFn: (input: Parameters<typeof api.payFees>[0]) =>
      sponsor
        ? api.sponsorStudent(
            input.channel === 'mpesa'
              ? { studentId: sponsor, channel: 'mpesa', phone: input.phone }
              : { studentId: sponsor, channel: 'card' },
          )
        : api.payFees(input),
    onSuccess: (intent) => {
      setCheckoutRequestId(intent.checkoutRequestId);
      setPhase('waiting');
      // Card: the gateway's page opens over the app; polling carries on.
      void openCardCheckout(intent.authorisationUrl);
    },
    onError: (err) => setError(describeError(err).body),
  });

  const submitPayment = () => {
    setError(null);

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

    if (sponsor) {
      initiate.mutate({ channel: 'card', invoiceIds: [] });
      return;
    }
    const parsed = payFeesSchema.safeParse({ channel: 'card', invoiceIds: ids });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'validation.no_invoices_selected'));
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
      <PageHeader title={sponsor ? t('sponsor.title') : t('parent.payFees')} showBack={phase === 'confirm'} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        {phase === 'confirm' ? (
          <>
            <Card>
              <View style={{ gap: theme.spacing.md }}>
                <AppText variant="label" color="textMuted" uppercase>
                  {t('parent.amountToPay')}
                </AppText>
                <AppText variant="display">{formatMoney(total)}</AppText>
                {pupil ? (
                  <AppText variant="caption" color="textMuted">
                    {t(pupil.gender === 'female' ? 'sponsor.girl' : 'sponsor.boy', {
                      klass: pupil.className ?? t('sponsor.aClass'),
                    })}{' '}
                    · {pupil.madrasaName}
                  </AppText>
                ) : null}
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
              <HostedCardNote />
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
              {sponsor ? t('sponsor.thanks') : t('parent.paymentSuccess')}
            </AppText>
            <AppText variant="body" color="textMuted" align="center">
              {t(sponsor ? 'sponsor.thanksBody' : 'parent.paymentSuccessBody', {
                receipt: payment?.receiptNo ?? '—',
                amount: formatMoney(payment?.amount ?? total),
              })}
            </AppText>
            <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
              <Button label={t('common.done')} onPress={leave} />
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
              <Button label={t('common.cancel')} variant="secondary" onPress={leave} />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
