import type { Role } from '@digital-madrasa/shared';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Client-side routing guard.
 *
 * This is a navigation convenience, not a security boundary — the server
 * decides what a principal may read. It exists so a parent never lands on a
 * teacher screen and sees an empty shell full of permission errors.
 */
export function RoleGate({ allow, children }: { allow: Role; children: React.ReactNode }) {
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
  if (session.user.role !== allow) return <Redirect href="/" />;

  return <>{children}</>;
}
