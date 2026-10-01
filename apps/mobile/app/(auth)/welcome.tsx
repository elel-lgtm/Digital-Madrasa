import { SUPPORTED_LOCALES, type Locale } from '@digital-madrasa/shared';
import { BookOpen, GraduationCap, Users } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Card, Screen } from '@/components/ui';
import { usePreferences } from '@/store/preferences';
import { useTheme } from '@/theme/ThemeProvider';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
  so: 'Soomaali',
  ar: 'العربية',
};

export default function Welcome() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = usePreferences((s) => s.locale);
  const setLocale = usePreferences((s) => s.setLocale);

  return (
    <Screen contentStyle={{ paddingTop: theme.spacing.xxxl, gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: theme.spacing.md,
          }}
        >
          <BookOpen size={30} color={theme.colors.accent} weight="duotone" />
        </View>
        <AppText variant="label" color="accent" uppercase>
          {t('app.name')}
        </AppText>
        <AppText variant="display">{t('auth.welcomeTitle')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('auth.welcomeBody')}
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <Card onPress={() => router.push('/(auth)/register-madrasa')}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'center' }}>
            <GraduationCap size={30} color={theme.colors.accent} weight="duotone" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="subheading">{t('auth.registerMadrasa')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('auth.registerMadrasaHint')}
              </AppText>
            </View>
          </View>
        </Card>

        <Card onPress={() => router.push('/(auth)/register-parent')}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'center' }}>
            <Users size={30} color={theme.colors.info} weight="duotone" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="subheading">{t('auth.parentAccount')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('auth.parentAccountHint')}
              </AppText>
            </View>
          </View>
        </Card>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'center' }}>
        <AppText variant="body" color="textMuted">
          {t('auth.haveAccount')}
        </AppText>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/(auth)/sign-in')}
          hitSlop={8}
        >
          <AppText variant="bodyStrong" color="accent">
            {t('auth.signIn')}
          </AppText>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/(auth)/verify-certificate')}
        hitSlop={8}
        style={{ alignSelf: 'center', marginTop: theme.spacing.md, minHeight: 44, justifyContent: 'center' }}
      >
        <AppText variant="caption" color="textMuted">
          {t('learning.verifyLink')}
        </AppText>
      </Pressable>

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <AppText variant="label" color="textSubtle" uppercase align="center">
          {t('settings.language')}
        </AppText>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.sm,
            justifyContent: 'center',
          }}
        >
          {SUPPORTED_LOCALES.map((code) => {
            const selected = locale === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={LOCALE_LABELS[code]}
                onPress={() => setLocale(code)}
                style={{
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: selected ? theme.colors.accentSoft : 'transparent',
                }}
              >
                <AppText variant="caption" color={selected ? 'accent' : 'textMuted'}>
                  {LOCALE_LABELS[code]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
