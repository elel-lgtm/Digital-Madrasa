import { LockSimple } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Card payments use the gateway's hosted page (Paystack). The card number is
 * typed there, in the browser, and never passes through this app, so there is
 * no card form here at all.
 */
export function HostedCardNote() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
        <LockSimple size={20} color={theme.colors.accent} weight="duotone" />
        <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
          {t('billing.cardHostedNote')}
        </AppText>
      </View>
    </Card>
  );
}

/**
 * Opens the checkout page, if the server returned one, and resolves when the
 * customer closes it. The payment is still settled only on the server; the
 * screen keeps polling for the outcome either way. The mock provider needs
 * no page.
 */
export async function openCardCheckout(url: string | null | undefined): Promise<void> {
  if (!url) return;
  await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'done', showTitle: true });
}
