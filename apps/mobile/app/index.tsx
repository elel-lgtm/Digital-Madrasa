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
    case 'admin':
      // The web console. On a phone the (admin) layout explains where to go.
      return <Redirect href="/(admin)/overview" />;
    default:
      return <Redirect href="/(auth)/welcome" />;
  }
}
