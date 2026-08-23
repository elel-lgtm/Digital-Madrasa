import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { AppText } from './Text';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back affordance. Omit on tab roots, which have nowhere to go. */
  showBack?: boolean;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, showBack = false, right }: PageHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.md }}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11y.backButton')}
          onPress={() => router.back()}
          hitSlop={10}
          style={{
            alignSelf: 'flex-start',
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }],
          }}
        >
          <ArrowLeft size={24} color={theme.colors.text} />
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" color="textMuted">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}
