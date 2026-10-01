import { Slot, usePathname, useRouter } from 'expo-router';
import { Buildings, ChartBar, ClockCounterClockwise, Desktop, SignOut } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { RoleGate } from '@/components/RoleGate';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useSignOut } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The platform admin's console.
 *
 * It is a web tool: an admin decides the fate of whole schools here, and does
 * it at a desk with room to read before acting. The same routes open on a
 * phone, but only to say so — the mobile shell is for madrasas and families.
 *
 * RoleGate is navigation, not security. Every read behind these screens is
 * refused by the database unless `is_platform_admin()` holds (migration 0026),
 * and every status change is checked again by the `madrasa-lifecycle`
 * function.
 */
export default function AdminLayout() {
  return (
    <RoleGate allow="admin">
      {Platform.OS === 'web' ? <AdminShell /> : <UseTheWebConsole />}
    </RoleGate>
  );
}

const NAV = [
  { href: '/(admin)/overview', match: '/overview', icon: ChartBar, key: 'admin.nav.overview' },
  { href: '/(admin)/madrasas', match: '/madrasa', icon: Buildings, key: 'admin.nav.madrasas' },
  { href: '/(admin)/audit', match: '/audit', icon: ClockCounterClockwise, key: 'admin.nav.audit' },
] as const;

function AdminShell() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const signOut = useSignOut();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: theme.colors.background }}>
      <View
        style={{
          width: wide ? 248 : undefined,
          borderRightWidth: wide ? 1 : 0,
          borderBottomWidth: wide ? 0 : 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundElevated,
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ gap: 2 }}>
          <AppText variant="heading">Digital Madrasa</AppText>
          <AppText variant="caption" color="textMuted">
            {t('admin.consoleTitle')}
          </AppText>
        </View>
        <ScrollView horizontal={!wide} contentContainerStyle={{ gap: theme.spacing.xs, flexDirection: wide ? 'column' : 'row' }}>
          {NAV.map((item) => {
            const active = pathname.includes(item.match);
            const Icon = item.icon;
            return (
              <Pressable
                key={item.href}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                onPress={() => router.push(item.href)}
                // react-native-web adds `hovered`; React Native's types do not know it.
                style={(state) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  paddingVertical: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  backgroundColor: active
                    ? theme.colors.accentSoft
                    : (state as { hovered?: boolean }).hovered
                      ? theme.colors.surfaceAlt
                      : 'transparent',
                })}
              >
                <Icon size={18} color={active ? theme.colors.accent : theme.colors.textMuted} />
                <AppText variant="bodyStrong" color={active ? 'accent' : 'text'}>
                  {t(item.key)}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
        {wide ? <View style={{ flex: 1 }} /> : null}
        <Button
          label={t('common.signOut')}
          variant="ghost"
          fullWidth={false}
          loading={signOut.isPending}
          icon={<SignOut size={16} color={theme.colors.accent} />}
          onPress={() => signOut.mutate(undefined, { onSuccess: () => router.replace('/(auth)/welcome') })}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}

function UseTheWebConsole() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const signOut = useSignOut();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: theme.spacing.xxxl }}>
        <Card>
          <View style={{ gap: theme.spacing.md, alignItems: 'center' }}>
            <Desktop size={40} color={theme.colors.accent} weight="duotone" />
            <AppText variant="heading" align="center">
              {t('admin.webOnlyTitle')}
            </AppText>
            <AppText color="textMuted" align="center">
              {t('admin.webOnlyBody')}
            </AppText>
            <Button
              label={t('common.signOut')}
              variant="secondary"
              loading={signOut.isPending}
              onPress={() => signOut.mutate(undefined, { onSuccess: () => router.replace('/(auth)/welcome') })}
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
