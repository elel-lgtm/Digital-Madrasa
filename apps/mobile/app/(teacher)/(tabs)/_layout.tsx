import { Tabs } from 'expo-router';
import {
  ChalkboardTeacher,
  DotsThreeCircle,
  House,
  Money,
  Student,
} from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { tabIcon } from '@/components/TabBarIcon';
import { useTabScreenOptions } from '@/components/Tabs';

export default function TeacherTabsLayout() {
  const { t } = useTranslation();
  const screenOptions = useTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: t('nav.home'), tabBarIcon: tabIcon(House) }}
      />
      <Tabs.Screen
        name="students"
        options={{ title: t('nav.students'), tabBarIcon: tabIcon(Student) }}
      />
      <Tabs.Screen
        name="classes"
        options={{ title: t('nav.classes'), tabBarIcon: tabIcon(ChalkboardTeacher) }}
      />
      <Tabs.Screen name="fees" options={{ title: t('nav.fees'), tabBarIcon: tabIcon(Money) }} />
      <Tabs.Screen
        name="more"
        options={{ title: t('nav.more'), tabBarIcon: tabIcon(DotsThreeCircle) }}
      />
    </Tabs>
  );
}
