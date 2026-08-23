import {
  cardCvvLength,
  detectCardBrand,
  formatCardNumber,
  type CardBrand,
  type CardDetailsInput,
} from '@digital-madrasa/shared';
import { CreditCard, Lock } from 'phosphor-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText, Checkbox, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export interface CardFormValues {
  number: string;
  expiry: string;
  cvv: string;
  holderName: string;
  saveCard: boolean;
}

export const EMPTY_CARD: CardFormValues = {
  number: '',
  expiry: '',
  cvv: '',
  holderName: '',
  saveCard: false,
};

interface CardFormProps {
  values: CardFormValues;
  onChange: (values: CardFormValues) => void;
  errors?: Partial<Record<keyof CardFormValues, string>>;
  /** Hides the "save this card" option for one-off payments. */
  allowSave?: boolean;
}

/**
 * Card entry.
 *
 * In production the number is tokenised on the device by the gateway SDK and
 * never reaches our servers, our logs or our database. This form exists to
 * catch typos before that exchange — it is not, and must never become, a
 * place where a card number is stored.
 */
export function CardForm({ values, onChange, errors = {}, allowSave = true }: CardFormProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const brand = useMemo(() => detectCardBrand(values.number), [values.number]);
  const cvvLength = cardCvvLength(brand);

  const set = <K extends keyof CardFormValues>(key: K, value: CardFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <TextField
        label={t('billing.cardNumber')}
        value={formatCardNumber(values.number)}
        onChangeText={(v) => set('number', v.replace(/\D/g, '').slice(0, 19))}
        error={errors.number}
        placeholder="4242 4242 4242 4242"
        keyboardType="number-pad"
        autoComplete="cc-number"
        right={<BrandMark brand={brand} />}
      />

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <TextField
          label={t('billing.expiry')}
          value={values.expiry}
          onChangeText={(v) => set('expiry', formatExpiry(v))}
          error={errors.expiry}
          placeholder="MM/YY"
          keyboardType="number-pad"
          autoComplete="cc-exp"
          containerStyle={{ flex: 1 }}
        />
        <TextField
          label={t('billing.cvv')}
          value={values.cvv}
          onChangeText={(v) => set('cvv', v.replace(/\D/g, '').slice(0, cvvLength))}
          error={errors.cvv}
          placeholder={cvvLength === 4 ? '••••' : '•••'}
          keyboardType="number-pad"
          autoComplete="cc-csc"
          secure
          containerStyle={{ flex: 1 }}
        />
      </View>

      <TextField
        label={t('billing.cardHolder')}
        value={values.holderName}
        onChangeText={(v) => set('holderName', v)}
        error={errors.holderName}
        placeholder={t('billing.cardHolderPlaceholder')}
        autoCapitalize="words"
        autoComplete="cc-name"
      />

      {allowSave ? (
        <Checkbox
          label={t('billing.saveCard')}
          checked={values.saveCard}
          onChange={(v) => set('saveCard', v)}
        />
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <Lock size={16} color={theme.colors.success} weight="fill" />
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
          {t('billing.securityNote')}
        </AppText>
      </View>
    </View>
  );
}

/** Inserts the slash as the user types, so they never have to. */
function formatExpiry(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function BrandMark({ brand }: { brand: CardBrand }) {
  const theme = useTheme();
  const label: Record<CardBrand, string> = {
    visa: 'VISA',
    mastercard: 'MC',
    amex: 'AMEX',
    unknown: '',
  };

  if (brand === 'unknown') {
    return <CreditCard size={20} color={theme.colors.textSubtle} weight="duotone" />;
  }

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft,
      }}
    >
      <AppText variant="label" color="accent">
        {label[brand]}
      </AppText>
    </View>
  );
}

/** Maps the form's strings onto the shared schema's input shape. */
export function toCardInput(values: CardFormValues): CardDetailsInput {
  return {
    number: values.number,
    expiry: values.expiry,
    cvv: values.cvv,
    holderName: values.holderName,
    saveCard: values.saveCard,
  };
}
