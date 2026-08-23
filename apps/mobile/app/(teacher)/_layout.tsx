import { Stack } from 'expo-router';
import { RoleGate } from '@/components/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';

export default function TeacherStackLayout() {
  const theme = useTheme();
  return (
    <RoleGate allow="teacher">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
    </RoleGate>
  );
}
