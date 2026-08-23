import { Stack } from 'expo-router';
import { RoleGate } from '@/components/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';

export default function ParentStackLayout() {
  const theme = useTheme();
  return (
    <RoleGate allow="parent">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
    </RoleGate>
  );
}
