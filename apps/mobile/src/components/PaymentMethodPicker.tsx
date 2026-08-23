import type { PaymentChannel, SavedCard } from '@digital-madrasa/shared';
import { CreditCard, DeviceMobile } from 'phosphor-react-native';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { AppText, Badge } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

interface PaymentMethodPickerProps {
  value: PaymentChannel;
  onChange: (channel: PaymentChannel) => void;
  /** Shown as a hint under the card option when one is already stored. */
  savedCard?: SavedCard | null;
}

/**
 * M-Pesa or card.
 *
 * M-Pesa is listed first and marked as the common choice deliberately: in
 * Kenya it is what most parents and madrasa owners actually use, and putting
 * card first would suggest a preference the market does not have.
 */
export function PaymentMethodPicker({ value, onChange, savedCard }: PaymentMethodPickerProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const options: {
    channel: PaymentChannel;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      channel: 'mpesa',
      title: t('billing.mpesa'),
      subtitle: t('billing.mpesaHint'),
      icon: <DeviceMobile size={24} color={theme.colors.success} weight="duotone" />,
      badge: t('billing.mostCommon'),
    },
    {
      channel: 'card',
      title: t('billing.card'),
      subtitle: savedCard
        ? t('billing.savedCardHint', { brand: brandLabel(savedCard), last4: savedCard.last4 })
        : t('billing.cardHint'),
      icon: <CreditCard size={24} color={theme.colors.info} weight="duotone" />,
    },
  ];

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('billing.paymentMethod')}
      style={{ gap: theme.spacing.sm }}
    >
      <AppText variant="label" color="textMuted" uppercase>
        {t('billing.paymentMethod')}
      </AppText>

      {options.map((option) => {
        const selected = option.channel === value;
        return (
          <Pressable
            key={option.channel}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.title}. ${option.subtitle}`}
            onPress={() => onChange(option.channel)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              minHeight: MIN_TOUCH_TARGET + 16,
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? theme.colors.accent : theme.colors.border,
              backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {option.icon}
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <AppText variant="bodyStrong">{option.title}</AppText>
                {option.badge ? <Badge label={option.badge} tone="success" /> : null}
              </View>
              <AppText variant="caption" color="textMuted">
                {option.subtitle}
              </AppText>
            </View>

            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selected ? (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: theme.colors.accent,
                  }}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function brandLabel(card: SavedCard): string {
  switch (card.brand) {
    case 'visa':
      return 'Visa';
    case 'mastercard':
      return 'Mastercard';
    case 'amex':
      return 'Amex';
    default:
      return 'Card';
  }
}
