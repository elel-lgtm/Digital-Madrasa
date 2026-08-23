import { Tabs } from 'expo-router';
import { BookOpen, ChartLineUp, DotsThreeCircle, House, Microphone } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { tabIcon } from '@/components/TabBarIcon';
import { useTabScreenOptions } from '@/components/Tabs';

export default function StudentTabsLayout() {
  const { t } = useTranslation();
  const screenOptions = useTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: t('nav.home'), tabBarIcon: tabIcon(House) }}
      />
      <Tabs.Screen
        name="recite"
        options={{ title: t('nav.recite'), tabBarIcon: tabIcon(Microphone) }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: t('nav.progress'), tabBarIcon: tabIcon(ChartLineUp) }}
      />
      <Tabs.Screen
        name="learn"
        options={{ title: t('nav.learn'), tabBarIcon: tabIcon(BookOpen) }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('nav.more'), tabBarIcon: tabIcon(DotsThreeCircle) }}
      />
    </Tabs>
  );
}
