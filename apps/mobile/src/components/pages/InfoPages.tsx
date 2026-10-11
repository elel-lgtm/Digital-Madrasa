import { BRAND, reportProblemSchema } from '@digital-madrasa/shared';
import Constants from 'expo-constants';
import { CheckCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Divider,
  ListRow,
  OptionGroup,
  PageHeader,
  Screen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { BrandLogo } from '@/components/brand/BrandMark';
import { useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/** Shared by all three roles so the legal surface is identical everywhere. */
export function AboutPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <Screen>
      <PageHeader title={t('settings.about')} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            <BrandLogo size={64} />
            <AppText variant="caption" color="textMuted">
              {BRAND.academicTitle}
            </AppText>
            <AppText variant="body" color="textMuted">
              {t('app.tagline')}
            </AppText>
            <AppText variant="caption" color="textSubtle">
              {t('settings.version', { version })} · {Platform.OS}
            </AppText>
          </View>
        </Card>

        <View>
          <SectionHeader title={t('settings.changelog')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title="0.1.0"
                subtitle="Hifz tracking, tajweed feedback, attendance, fees and the parent inbox."
                showChevron={false}
              />
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  const theme = useTheme();

  const sections: { title: string; body: string }[] = [
    {
      title: 'What we collect',
      body: 'Names, dates of birth, class enrolment, attendance, grades, hifz progress, recitation audio, and fee and payment records for the madrasa you belong to.',
    },
    {
      title: "Children's voice recordings",
      body: 'A recitation is only recorded when a student starts one, and only a guardian who has consented at signup and been approved by the madrasa can hear it. Recordings are stored privately and are never used to identify a child outside their madrasa.',
    },
    {
      title: 'Who can see what',
      body: 'Teachers see only their own madrasa. Parents see only children a teacher has approved them to see. No madrasa can ever see another madrasa’s records.',
    },
    {
      title: 'Your rights under the Kenya Data Protection Act 2019',
      body: 'You may request a copy of your data, ask for corrections, withdraw consent, or ask us to delete an account. Requests are actioned within 30 days. Financial records are kept in anonymised form where tax law requires it.',
    },
    {
      title: 'Payments',
      body: 'M-Pesa payments are processed by Safaricom. We store the receipt number and amount, never your PIN or full transaction credentials.',
    },
  ];

  return (
    <Screen>
      <PageHeader title={t('settings.privacyPolicy')} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        {sections.map((section) => (
          <Card key={section.title}>
            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="subheading">{section.title}</AppText>
              <AppText variant="body" color="textMuted">
                {section.body}
              </AppText>
            </View>
          </Card>
        ))}
        <Divider />
        <AppText variant="caption" color="textSubtle">
          Contact the madrasa administrator, or privacy@digitalmadrasa.app, to exercise any of
          these rights.
        </AppText>
      </View>
    </Screen>
  );
}

export function ReportProblemPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const fieldError = useFieldError();

  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [sent, setSent] = useState(false);

  const submit = () => {
    const parsed = reportProblemSchema.safeParse({
      category,
      description,
      includeDiagnostics: true,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    setSent(true);
  };

  if (sent) {
    return (
      <Screen>
        <PageHeader title={t('settings.reportProblem')} showBack />
        <View style={{ alignItems: 'center', gap: theme.spacing.md, paddingTop: theme.spacing.xxl }}>
          <CheckCircle size={52} color={theme.colors.success} weight="fill" />
          <AppText variant="heading" align="center">
            {t('common.done')}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            Thank you. Your report has been logged with your app version and device details
            attached.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={<Button label={t('common.save')} size="lg" onPress={submit} />}
    >
      <PageHeader title={t('settings.reportProblem')} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        <OptionGroup
          label={t('common.select')}
          options={[
            { value: 'bug', label: 'Something is broken' },
            { value: 'payment', label: 'Payment issue' },
            { value: 'account', label: 'Account access' },
            { value: 'content', label: 'Wrong content' },
            { value: 'other', label: 'Something else' },
          ]}
          value={category}
          onChange={setCategory}
          error={fieldError(errors['category'])}
        />
        <TextField
          label={t('teacher.teacherRemarks')}
          value={description}
          onChangeText={setDescription}
          error={fieldError(errors['description'])}
          multiline
          numberOfLines={6}
          required
        />
        <AppText variant="caption" color="textSubtle">
          Your app version, device model and OS are attached automatically. No personal records
          are included.
        </AppText>
      </View>
    </Screen>
  );
}
