import { Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
} from '@expo-google-fonts/work-sans';
import type { Locale } from '@digital-madrasa/shared';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSession } from '@/hooks/useSession';
import { applyDirection, initI18n, resolveDeviceLocale } from '@/i18n';
import { registerDeviceForPush } from '@/notifications/push';
import { queryClient, queryPersister } from '@/providers/queryClient';
import { usePreferences } from '@/store/preferences';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

// Hold the native splash until fonts and stored preferences are ready, so the
// first frame is the real UI rather than a flash of unstyled text.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    Amiri_400Regular,
    Amiri_700Bold,
  });

  const hydrated = usePreferences((s) => s.hydrated);
  const localePreference = usePreferences((s) => s.locale);

  const locale: Locale = useMemo(
    () => (localePreference === 'system' ? resolveDeviceLocale() : localePreference),
    [localePreference],
  );

  useEffect(() => {
    initI18n(locale);
    applyDirection(locale);
  }, [locale]);

  const ready = (fontsLoaded || fontError !== null) && hydrated;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          <ThemeProvider>
            <ThemedNavigator />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedNavigator() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <PushRegistrar />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(student)" />
        <Stack.Screen name="(teacher)" />
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </View>
  );
}

/**
 * Registers the device for push once per signed-in account. Renders nothing;
 * does nothing where push is unavailable (see src/notifications/push.ts).
 */
function PushRegistrar() {
  const { data: session } = useSession();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (userId) void registerDeviceForPush();
  }, [userId]);

  return null;
}
