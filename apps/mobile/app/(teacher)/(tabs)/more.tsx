import { useRouter } from 'expo-router';
import {
  BookOpen,
  ClipboardText,
  CreditCard,
  Gear,
  Info,
  Megaphone,
  SquaresFour,
  TreeStructure,
  Question,
  SignOut,
  Sparkle,
  UserPlus,
  Users,
  WaveTriangle,
} from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import {
  AppText,
  Avatar,
  Card,
  Divider,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useRequiredSession, useSignOut } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

export default function TeacherMore() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useRequiredSession();
  const signOut = useSignOut();

  const confirmSignOut = () => {
    Alert.alert(t('settings.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.signOut'),
        style: 'destructive',
        onPress: () => signOut.mutate(undefined, { onSuccess: () => router.replace('/') }),
      },
    ]);
  };

  const groups: { title: string; items: { icon: Icon; label: string; onPress: () => void }[] }[] = [
    {
      title: t('nav.learn'),
      items: [
        {
          icon: BookOpen,
          label: t('teacher.lessons'),
          onPress: () => router.push('/(teacher)/lessons'),
        },
        {
          icon: ClipboardText,
          label: t('teacher.assignments'),
          onPress: () => router.push('/(teacher)/assignments'),
        },
        {
          icon: WaveTriangle,
          label: t('teacher.gradingQueue'),
          onPress: () => router.push('/(teacher)/review'),
        },
        {
          icon: SquaresFour,
          label: t('heatmap.title'),
          onPress: () => router.push('/(teacher)/mistakes'),
        },
        {
          icon: TreeStructure,
          label: t('sanad.title'),
          onPress: () => router.push('/(teacher)/sanad'),
        },
      ],
    },
    {
      title: t('teacher.settings'),
      items: [
        {
          icon: UserPlus,
          label: t('teacher.linkRequests'),
          onPress: () => router.push('/(teacher)/link-requests'),
        },
        { icon: Users, label: t('teacher.staff'), onPress: () => router.push('/(teacher)/staff') },
        {
          icon: Megaphone,
          label: t('teacher.announcements'),
          onPress: () => router.push('/(teacher)/announcements'),
        },
        {
          icon: Sparkle,
          label: t('ai.title'),
          onPress: () => router.push('/(teacher)/assistant'),
        },
        {
          icon: CreditCard,
          label: t('billing.subscription'),
          onPress: () => router.push('/(teacher)/subscription'),
        },
        {
          icon: Gear,
          label: t('settings.title'),
          onPress: () => router.push('/(teacher)/settings'),
        },
      ],
    },
    {
      title: t('settings.help'),
      items: [
        {
          icon: Question,
          label: t('settings.reportProblem'),
          onPress: () => router.push('/(teacher)/report-problem'),
        },
        { icon: Info, label: t('settings.about'), onPress: () => router.push('/(teacher)/about') },
      ],
    },
  ];

  return (
    <Screen>
      <PageHeader title={t('nav.more')} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <Avatar name={session.user.fullName} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="subheading">{session.user.fullName}</AppText>
              <AppText variant="caption" color="textMuted">
                {session.madrasa?.name ?? session.user.email}
              </AppText>
            </View>
          </View>
        </Card>

        {groups.map((group) => (
          <View key={group.title}>
            <SectionHeader title={group.title} />
            <Card padded={false}>
              {group.items.map((item, index) => (
                <View key={item.label} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={item.label}
                    left={<item.icon size={20} color={theme.colors.textMuted} weight="duotone" />}
                    onPress={item.onPress}
                  />
                </View>
              ))}
            </Card>
          </View>
        ))}

        <Card padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            <ListRow
              title={t('common.signOut')}
              left={<SignOut size={20} color={theme.colors.danger} weight="duotone" />}
              onPress={confirmSignOut}
              showChevron={false}
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
