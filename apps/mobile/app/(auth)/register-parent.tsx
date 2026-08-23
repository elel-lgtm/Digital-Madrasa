import {
  normaliseKenyanPhone,
  registerParentSchema,
  type Locale,
} from '@digital-madrasa/shared';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { PhoneField } from '@/components/PhoneField';
import { AppText, Button, Checkbox, Screen, TextField } from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useRegisterParent } from '@/hooks/useSession';
import { usePreferences } from '@/store/preferences';
import { useTheme } from '@/theme/ThemeProvider';

export default function RegisterParent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const register = useRegisterParent();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const localePreference = usePreferences((s) => s.locale);

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
    acceptedDataPolicy: false,
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const setField = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const submit = () => {
    setFormError(null);
    const parsed = registerParentSchema.safeParse({
      ...values,
      phone: normaliseKenyanPhone(values.phone),
      locale: (localePreference === 'system' ? 'en' : localePreference) as Locale,
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

    register.mutate(parsed.data, {
      // A brand-new parent has no children yet, so we land them straight on
      // the "add your child" flow rather than an empty dashboard.
      onSuccess: () => router.replace('/(parent)/dashboard'),
      onError: (error) => setFormError(describeError(error).body),
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        contentStyle={{ paddingTop: theme.spacing.xl, gap: theme.spacing.xl }}
        footer={
          <Button
            label={t('auth.createAccount')}
            size="lg"
            loading={register.isPending}
            onPress={submit}
          />
        }
      >
        <View style={{ gap: theme.spacing.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('a11y.backButton')}
            onPress={() => router.back()}
            hitSlop={10}
            style={{ alignSelf: 'flex-start' }}
          >
            <ArrowLeft size={24} color={theme.colors.text} />
          </Pressable>
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="title">{t('auth.registerParentTitle')}</AppText>
            <AppText variant="body" color="textMuted">
              {t('auth.registerParentBody')}
            </AppText>
          </View>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          <TextField
            label={t('auth.fullName')}
            value={values.fullName}
            onChangeText={(v) => setField('fullName', v)}
            error={fieldError(errors['fullName'])}
            autoComplete="name"
            required
          />
          <TextField
            label={t('auth.email')}
            value={values.email}
            onChangeText={(v) => setField('email', v)}
            error={fieldError(errors['email'])}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            required
          />
          <PhoneField
            label={t('auth.phone')}
            value={values.phone}
            onChangeText={(v) => setField('phone', v)}
            error={fieldError(errors['phone'])}
            hint={t('auth.phoneHint')}
            required
          />
          <TextField
            label={t('auth.password')}
            value={values.password}
            onChangeText={(v) => setField('password', v)}
            error={fieldError(errors['password'])}
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            required
          />
          <TextField
            label={t('auth.confirmPassword')}
            value={values.confirmPassword}
            onChangeText={(v) => setField('confirmPassword', v)}
            error={fieldError(errors['confirmPassword'])}
            secure
            autoCapitalize="none"
            required
          />
          <Checkbox
            label={t('auth.acceptTerms')}
            checked={values.acceptedTerms}
            onChange={(v) => setField('acceptedTerms', v)}
            error={fieldError(errors['acceptedTerms'])}
          />
          <Checkbox
            label={t('auth.acceptDataPolicy')}
            checked={values.acceptedDataPolicy}
            onChange={(v) => setField('acceptedDataPolicy', v)}
            error={fieldError(errors['acceptedDataPolicy'])}
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
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
