import { formatMoney } from '@digital-madrasa/shared';
import { CheckCircle, DeviceMobile } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { AppText, Card, ProgressBar } from '@/components/ui';
import { partner } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Safaricom drops an unanswered STK prompt after about a minute. */
const PROMPT_SECONDS = 60;

interface Props {
  amount: number;
  /** As M-Pesa shows it: 07*****678. */
  phone: string;
  /** Who the prompt says is being paid. */
  payee: string;
  startedAt: number;
}

/**
 * The wait while the parent answers the M-Pesa prompt on their phone: what
 * the prompt will say, where they are in the three steps, and how long the
 * prompt stays open. Only the server ever decides the outcome.
 */
export function MpesaPrompt({ amount, phone, payee, startedAt }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, PROMPT_SECONDS - Math.floor((now - startedAt) / 1000));

  const step = (done: boolean, active: boolean, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      {done ? (
        <CheckCircle size={20} color={partner.mpesa} weight="fill" />
      ) : active ? (
        <ActivityIndicator size="small" color={partner.mpesa} />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.border }} />
      )}
      <AppText variant={active ? 'bodyStrong' : 'body'} color={done || active ? 'text' : 'textMuted'} style={{ flex: 1 }}>
        {label}
      </AppText>
    </View>
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View
        style={{
          backgroundColor: partner.mpesa,
          borderRadius: theme.radius.lg,
          paddingVertical: theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          gap: 4,
        }}
      >
        <AppText style={{ color: '#FFFFFF', fontFamily: theme.fonts.bodySemibold, fontSize: 24, letterSpacing: 2 }}>
          M-PESA
        </AppText>
        <AppText style={{ color: '#E8F7E8', fontFamily: theme.fonts.body, fontSize: 14 }}>
          {t('mpesa.lipa')} · {formatMoney(amount)}
        </AppText>
      </View>

      {/* What the parent will see on their phone. */}
      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}>
          <DeviceMobile size={36} color={partner.mpesa} weight="duotone" />
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <AppText variant="label" color="textMuted" uppercase>
              {t('mpesa.onYourPhone', { phone })}
            </AppText>
            <AppText variant="body">
              {t('mpesa.promptText', { amount: formatMoney(amount), payee: payee.toUpperCase() })}
            </AppText>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.spacing.md }}>
          {step(true, false, t('mpesa.stepSent', { phone }))}
          {step(false, left > 0, t('mpesa.stepPin'))}
          {step(false, left === 0, t('mpesa.stepConfirm'))}
          <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
            <ProgressBar value={left} max={PROMPT_SECONDS} tone="success" height={6} />
            <AppText variant="caption" color="textMuted">
              {left > 0 ? t('mpesa.expiresIn', { count: left }) : t('mpesa.stillWaiting')}
            </AppText>
          </View>
        </View>
      </Card>
    </View>
  );
}
