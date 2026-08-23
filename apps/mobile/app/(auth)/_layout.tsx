import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const theme = useTheme();
  const { data: session, isPending } = useSession();

  // Someone already signed in has no business on the signup screens.
  if (!isPending && session) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}
