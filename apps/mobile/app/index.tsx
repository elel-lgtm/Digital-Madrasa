import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The routing gate. Role decides the shell, and the role comes from the
 * session the server issued — never from anything the client chose.
 */
export default function Index() {
  const theme = useTheme();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/welcome" />;

  switch (session.user.role) {
    case 'student':
      return <Redirect href="/(student)/dashboard" />;
    case 'parent':
      return <Redirect href="/(parent)/dashboard" />;
    case 'teacher':
      return <Redirect href="/(teacher)/dashboard" />;
    default:
      // Platform admins use the web console, never the mobile shell.
      return <Redirect href="/(auth)/welcome" />;
  }
}
