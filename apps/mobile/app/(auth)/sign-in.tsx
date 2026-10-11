import { signInSchema } from '@digital-madrasa/shared';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { BrandLogo } from '@/components/brand/BrandMark';
import { DEMO_ACCOUNTS } from '@/api';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useSignIn } from '@/hooks/useSession';
import { useZodForm } from '@/hooks/useZodForm';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignIn() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const signIn = useSignIn();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useZodForm(signInSchema, { email: '', password: '' });

  const submit = () => {
    setFormError(null);
    const parsed = form.validate();
    if (!parsed) return;
    signIn.mutate(parsed, {
      onSuccess: () => router.replace('/'),
      onError: (error) => setFormError(describeError(error).body),
    });
  };

  const fillDemo = (account: { email: string; password: string }) => {
    form.setField('email', account.email);
    form.setField('password', account.password);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={{ paddingTop: theme.spacing.xl, gap: theme.spacing.xl }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11y.backButton')}
          onPress={() => router.back()}
          hitSlop={10}
          style={{ alignSelf: 'flex-start' }}
        >
          <ArrowLeft size={24} color={theme.colors.text} />
        </Pressable>

        <BrandLogo layout="inline" size={40} showDescriptor={false} />

        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="title">{t('auth.signInTitle')}</AppText>
          <AppText variant="body" color="textMuted">
            {t('auth.signInBody')}
          </AppText>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          <TextField
            label={t('auth.email')}
            value={form.values.email}
            onChangeText={(value) => form.setField('email', value)}
            error={fieldError(form.errors.email)}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            required
          />
          <TextField
            label={t('auth.password')}
            value={form.values.password}
            onChangeText={(value) => form.setField('password', value)}
            error={fieldError(form.errors.password)}
            secure
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
            returnKeyType="go"
            required
          />

          {formError ? (
            <View
              style={{
                backgroundColor: theme.colors.dangerSoft,
                borderRadius: theme.radius.md,
                padding: theme.spacing.md,
              }}
            >
              <AppText variant="caption" color="danger">
                {formError}
              </AppText>
            </View>
          ) : null}

          <Button
            label={t('auth.signIn')}
            size="lg"
            loading={signIn.isPending}
            onPress={submit}
          />

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/(auth)/forgot-password')}
            hitSlop={8}
            style={{ alignSelf: 'center' }}
          >
            <AppText variant="bodyStrong" color="accent">
              {t('auth.forgotPassword')}
            </AppText>
          </Pressable>
        </View>

        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="subheading">{t('auth.demoTitle')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('auth.demoBody')}
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: theme.spacing.sm,
                marginTop: theme.spacing.sm,
              }}
            >
              {(
                [
                  ['demoOwner', DEMO_ACCOUNTS.owner],
                  ['demoTeacher', DEMO_ACCOUNTS.teacher],
                  ['demoStudent', DEMO_ACCOUNTS.student],
                  ['demoParent', DEMO_ACCOUNTS.parent],
                ] as const
              ).map(([labelKey, account]) => (
                <Pressable
                  key={labelKey}
                  accessibilityRole="button"
                  accessibilityLabel={t(`auth.${labelKey}`)}
                  onPress={() => fillDemo(account)}
                  style={{
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                  }}
                >
                  <AppText variant="caption" color="textMuted">
                    {t(`auth.${labelKey}`)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
