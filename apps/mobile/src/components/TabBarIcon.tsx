import type { Icon } from 'phosphor-react-native';

/**
 * Navigation icons use Phosphor's duotone weight when active and regular when
 * not, which reads as "selected" without relying on colour alone.
 */
export function tabIcon(IconComponent: Icon) {
  return function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <IconComponent size={24} color={color} weight={focused ? 'duotone' : 'regular'} />;
  };
}
