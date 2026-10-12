import { formatMoney, type Invoice, type Payment } from '@digital-madrasa/shared';
import * as Clipboard from 'expo-clipboard';
import { CheckCircle, Clock, Copy, FilePdf, XCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { AppText, Badge, Button, Card, Divider } from '@/components/ui';
import { shareReceiptPdf } from '@/payments/receipt';
import { partner } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  payment: Payment;
  invoices: Invoice[];
  madrasaName: string;
}

/** Long date and time, the way a receipt prints it. */
function stamp(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-KE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * A payment as a receipt: the M-Pesa transaction code first (it is what a
 * parent quotes to the madrasa), then the receipt number, time, phone and
 * what it paid for. Shareable as a PDF. A test payment says so plainly.
 */
export function PaymentReceipt({ payment, invoices, madrasaName }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const paidFor = invoices.filter((i) => payment.invoiceIds.includes(i.id));
  const success = payment.status === 'success';
  const failed = payment.status === 'failed' || payment.status === 'reversed';
  const methodLabel = t(`fees.method_${payment.method}`);
  const dateLabel = stamp(payment.settledAt ?? payment.createdAt, i18n.language);

  const row = (label: string, value: string, strong = false) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, paddingVertical: theme.spacing.xs }}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
          {success ? (
            <CheckCircle size={52} color={partner.mpesa} weight="fill" />
          ) : failed ? (
            <XCircle size={52} color={theme.colors.danger} weight="fill" />
          ) : (
            <Clock size={52} color={theme.colors.warning} weight="duotone" />
          )}
          <AppText variant="label" color="textMuted" uppercase>
            {success ? t('receipt.received') : failed ? t('receipt.failed') : t('receipt.pending')}
          </AppText>
          <AppText variant="display">{formatMoney(payment.amount, payment.currency)}</AppText>
          {payment.isTest !== false ? <Badge label={t('receipt.testBadge')} tone="warning" /> : null}
        </View>

        {success && payment.providerRef ? (
          <>
            <Divider />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('receipt.copyCode')}
              onPress={() => {
                void Clipboard.setStringAsync(payment.providerRef ?? '');
                setCopied(true);
              }}
              style={{ alignItems: 'center', gap: 4, paddingVertical: theme.spacing.md }}
            >
              <AppText variant="caption" color="textMuted">
                {payment.method === 'mpesa' ? t('receipt.mpesaCode') : t('receipt.reference')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <AppText style={{ fontFamily: theme.fonts.bodySemibold, fontSize: 22, letterSpacing: 3, color: partner.mpesa }}>
                  {payment.providerRef}
                </AppText>
                <Copy size={18} color={theme.colors.textMuted} />
              </View>
              {copied ? (
                <AppText variant="caption" color="success">
                  {t('receipt.copied')}
                </AppText>
              ) : null}
            </Pressable>
          </>
        ) : null}

        {failed && payment.failureCode ? (
          <>
            <Divider />
            <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.md }}>
              <AppText variant="bodyStrong">{t(`mpesa.fail_${payment.failureCode}`)}</AppText>
              <AppText variant="caption" color="textMuted">
                {t(`mpesa.hint_${payment.failureCode}`)}
              </AppText>
            </View>
          </>
        ) : null}
      </Card>

      <Card>
        <View>
          {payment.receiptNo ? row(t('receipt.receiptNo'), payment.receiptNo, true) : null}
          {row(t('receipt.date'), dateLabel)}
          {row(t('receipt.method'), methodLabel)}
          {payment.payerPhone
            ? row(t('receipt.paidFrom'), payment.payerPhone)
            : payment.cardLast4
              ? row(t('receipt.paidFrom'), `•••• ${payment.cardLast4}`)
              : null}
          {madrasaName ? row(t('receipt.paidTo'), madrasaName) : null}
          {paidFor.length > 0 ? (
            <View style={{ paddingTop: theme.spacing.sm, gap: 2 }}>
              <AppText variant="caption" color="textMuted">
                {t('receipt.forItems')}
              </AppText>
              {paidFor.map((i) => (
                <AppText key={i.id} variant="body">
                  {i.studentName} · {i.description} ({i.invoiceNo})
                </AppText>
              ))}
            </View>
          ) : null}
        </View>
      </Card>

      {success ? (
        <Button
          label={t('receipt.share')}
          variant="secondary"
          loading={sharing}
          icon={<FilePdf size={18} color={theme.colors.text} />}
          onPress={async () => {
            setSharing(true);
            try {
              await shareReceiptPdf({
                payment,
                invoices: paidFor,
                madrasaName,
                methodLabel,
                dateLabel,
                labels: {
                  title: t('receipt.title'),
                  code: payment.method === 'mpesa' ? t('receipt.mpesaCode') : t('receipt.reference'),
                  receiptNo: t('receipt.receiptNo'),
                  date: t('receipt.date'),
                  paidFrom: t('receipt.paidFrom'),
                  method: t('receipt.method'),
                  paidTo: t('receipt.paidTo'),
                  forItems: t('receipt.forItems'),
                  amount: t('receipt.amount'),
                  test: t('receipt.testNote'),
                  footer: t('receipt.footer'),
                },
              });
            } finally {
              setSharing(false);
            }
          }}
        />
      ) : null}
    </View>
  );
}
