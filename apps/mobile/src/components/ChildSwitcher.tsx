import type { Student } from '@digital-madrasa/shared';
import { ScrollView, View } from 'react-native';
import { Avatar, AppText } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { Pressable } from 'react-native';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

interface ChildSwitcherProps {
  children: Student[];
  activeId: string | null;
  onChange: (studentId: string) => void;
}

/**
 * Horizontal child selector for multi-child households. Hidden entirely when
 * there is only one child — a switcher with one option is just clutter.
 */
export function ChildSwitcher({ children, activeId, onChange }: ChildSwitcherProps) {
  const theme = useTheme();
  if (children.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}
    >
      {children.map((child) => {
        const selected = child.id === activeId;
        return (
          <Pressable
            key={child.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={child.fullName}
            onPress={() => onChange(child.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: selected ? theme.colors.accent : theme.colors.border,
              backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
            }}
          >
            <Avatar name={child.fullName} size={28} tone={selected ? 'accent' : 'neutral'} />
            <View>
              <AppText variant="caption" color={selected ? 'accent' : 'text'}>
                {child.fullName.split(' ')[0]}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
