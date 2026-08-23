import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function NotFound() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Screen>
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.xxxl }}>
        <AppText variant="title">{t('errors.notFound')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('errors.screenBody')}
        </AppText>
        <Link href="/">
          <AppText variant="bodyStrong" color="accent">
            {t('nav.home')}
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}
