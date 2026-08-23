import { Tabs } from 'expo-router';
import { ChatCircleDots, DotsThreeCircle, Envelope, House, Money } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { tabIcon } from '@/components/TabBarIcon';
import { useTabScreenOptions } from '@/components/Tabs';

export default function ParentTabsLayout() {
  const { t } = useTranslation();
  const screenOptions = useTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: t('nav.home'), tabBarIcon: tabIcon(House) }}
      />
      <Tabs.Screen name="fees" options={{ title: t('nav.fees'), tabBarIcon: tabIcon(Money) }} />
      <Tabs.Screen
        name="inbox"
        options={{ title: t('nav.inbox'), tabBarIcon: tabIcon(Envelope) }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: t('nav.messages'), tabBarIcon: tabIcon(ChatCircleDots) }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('nav.more'), tabBarIcon: tabIcon(DotsThreeCircle) }}
      />
    </Tabs>
  );
}
