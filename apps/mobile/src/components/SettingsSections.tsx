import { SUPPORTED_LOCALES, type Locale } from '@digital-madrasa/shared';
import { useRouter } from 'expo-router';
import { SignOut } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { AppText, Avatar, Card, ListRow, SectionHeader, Segmented, ToggleRow } from '@/components/ui';
import { useRequiredSession, useSignOut } from '@/hooks/useSession';
import { usePreferences } from '@/store/preferences';
import { useTheme } from '@/theme/ThemeProvider';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
  so: 'Soomaali',
  ar: 'العربية',
};

export function ProfileCard() {
  const theme = useTheme();
  const session = useRequiredSession();

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <Avatar name={session.user.fullName} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="subheading">{session.user.fullName}</AppText>
          <AppText variant="caption" color="textMuted">
            {session.user.email}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

/**
 * Appearance, language and reading-size controls. Shared by all three role
 * shells so the app behaves identically whoever is holding the phone.
 */
export function AppearanceSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = usePreferences((s) => s.scheme);
  const setScheme = usePreferences((s) => s.setScheme);
  const locale = usePreferences((s) => s.locale);
  const setLocale = usePreferences((s) => s.setLocale);
  const quranFontScale = usePreferences((s) => s.quranFontScale);
  const setQuranFontScale = usePreferences((s) => s.setQuranFontScale);
  const reducedMotion = usePreferences((s) => s.reducedMotion);
  const setReducedMotion = usePreferences((s) => s.setReducedMotion);

  const isRtlTarget = locale === 'ar';

  return (
    <View>
      <SectionHeader title={t('settings.appearance')} />
      <Card>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="label" color="textMuted" uppercase>
              {t('settings.theme')}
            </AppText>
            <Segmented
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'dark', label: t('settings.themeDark') },
                { value: 'light', label: t('settings.themeLight') },
              ]}
              value={scheme}
              onChange={setScheme}
            />
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="label" color="textMuted" uppercase>
              {t('settings.language')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
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
            {isRtlTarget ? (
              <AppText variant="caption" color="textSubtle">
                {t('settings.restartRequired')}
              </AppText>
            ) : null}
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="label" color="textMuted" uppercase>
              {t('settings.quranTextSize')}
            </AppText>
            <Segmented
              options={[
                { value: '0.9', label: 'A' },
                { value: '1', label: 'AA' },
                { value: '1.2', label: 'AAA' },
              ]}
              value={String(quranFontScale)}
              onChange={(value) => setQuranFontScale(Number(value))}
            />
            <AppText arabic scale={quranFontScale} color="textMuted">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </AppText>
          </View>

          <ToggleRow
            label={t('settings.reducedMotion')}
            value={reducedMotion}
            onChange={setReducedMotion}
          />
        </View>
      </Card>
    </View>
  );
}

export function SignOutCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const signOut = useSignOut();

  const confirm = () => {
    Alert.alert(t('settings.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.signOut'),
        style: 'destructive',
        onPress: () => signOut.mutate(undefined, { onSuccess: () => router.replace('/') }),
      },
    ]);
  };

  return (
    <Card padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <ListRow
          title={t('common.signOut')}
          left={<SignOut size={20} color={theme.colors.danger} weight="duotone" />}
          onPress={confirm}
          showChevron={false}
        />
      </View>
    </Card>
  );
}
