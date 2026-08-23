import {
  KENYA_COUNTIES,
  emailSchema,
  fullNameSchema,
  normaliseKenyanPhone,
  passwordSchema,
  phoneSchema,
  registerMadrasaSchema,
  type Locale,
} from '@digital-madrasa/shared';
import { useRouter } from 'expo-router';
import { ArrowLeft, EnvelopeSimple } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { z } from 'zod';
import { ApiError } from '@/api';
import { CountyField } from '@/components/CountyPicker';
import { PhoneField } from '@/components/PhoneField';
import { AppText, Button, Checkbox, Screen, TextField } from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useRegisterMadrasa } from '@/hooks/useSession';
import { usePreferences } from '@/store/preferences';
import { useTheme } from '@/theme/ThemeProvider';

type Values = {
  ownerName: string;
  email: string;
  phone: string;
  madrasaName: string;
  county: string;
  town: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
  acceptedDataPolicy: boolean;
};

const STEP_SCHEMAS = [
  z.object({ ownerName: fullNameSchema, email: emailSchema, phone: phoneSchema }),
  z.object({
    madrasaName: z.string().trim().min(3, 'validation.madrasa_name_too_short'),
    county: z.enum(KENYA_COUNTIES),
    town: z.string().trim().min(2, 'validation.name_too_short'),
  }),
  z
    .object({
      password: passwordSchema,
      confirmPassword: z.string(),
      acceptedTerms: z.literal(true, {
        errorMap: () => ({ message: 'validation.terms_required' }),
      }),
      acceptedDataPolicy: z.literal(true, {
        errorMap: () => ({ message: 'validation.data_policy_required' }),
      }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: 'validation.passwords_do_not_match',
      path: ['confirmPassword'],
    }),
] as const;

const TOTAL_STEPS = STEP_SCHEMAS.length;

export default function RegisterMadrasa() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const register = useRegisterMadrasa();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const localePreference = usePreferences((s) => s.locale);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({
    ownerName: '',
    email: '',
    phone: '',
    madrasaName: '',
    county: '',
    town: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
    acceptedDataPolicy: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const setField = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const validateStep = (index: number): boolean => {
    const result = STEP_SCHEMAS[index]!.safeParse(values);
    if (result.success) return true;
    const next: Partial<Record<keyof Values, string>> = {};
    result.error.issues.forEach((issue) => {
      const key = issue.path[0];
      if (typeof key === 'string' && !next[key as keyof Values]) {
        next[key as keyof Values] = issue.message;
      }
    });
    setErrors(next);
    return false;
  };

  const submit = () => {
    setFormError(null);
    if (!validateStep(step)) return;

    const parsed = registerMadrasaSchema.safeParse({
      ...values,
      phone: normaliseKenyanPhone(values.phone),
      locale: (localePreference === 'system' ? 'en' : localePreference) as Locale,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? t(issue.message) : t('errors.genericBody'));
      return;
    }

    register.mutate(parsed.data, {
      onSuccess: () => router.replace('/'),
      onError: (error) => {
        // Signup succeeded but the address needs confirming. That is a
        // success, not a failure, and showing it in a red error box tells the
        // owner their madrasa was not created when in fact it was.
        if (error instanceof ApiError && error.code === 'email_confirmation_required') {
          setConfirmationSent(true);
          return;
        }
        setFormError(describeError(error).body);
      },
    });
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else submit();
  };

  const goBack = () => {
    if (step === 0) router.back();
    else setStep(step - 1);
  };

  if (confirmationSent) {
    return (
      <Screen contentStyle={{ paddingTop: theme.spacing.xxl, gap: theme.spacing.lg }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <EnvelopeSimple size={48} color={theme.colors.accent} weight="duotone" />
          <AppText variant="title" align="center">
            {t('auth.confirmEmailTitle')}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            {t('auth.confirmEmailBody', { email: values.email.trim() })}
          </AppText>
          <AppText variant="caption" color="textSubtle" align="center">
            {t('auth.confirmEmailNote')}
          </AppText>
        </View>
        <Button label={t('auth.signIn')} onPress={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        contentStyle={{ paddingTop: theme.spacing.xl, gap: theme.spacing.xl }}
        footer={
          <Button
            label={step < TOTAL_STEPS - 1 ? t('common.next') : t('auth.createAccount')}
            size="lg"
            loading={register.isPending}
            onPress={goNext}
          />
        }
      >
        <View style={{ gap: theme.spacing.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('a11y.backButton')}
            onPress={goBack}
            hitSlop={10}
            style={{ alignSelf: 'flex-start' }}
          >
            <ArrowLeft size={24} color={theme.colors.text} />
          </Pressable>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    index <= step ? theme.colors.accent : theme.colors.surfaceAlt,
                }}
              />
            ))}
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="label" color="textSubtle" uppercase>
              {t('auth.stepOf', { current: step + 1, total: TOTAL_STEPS })}
            </AppText>
            <AppText variant="title">{t('auth.registerMadrasaTitle')}</AppText>
            <AppText variant="body" color="textMuted">
              {t('auth.registerMadrasaBody')}
            </AppText>
          </View>
        </View>

        {step === 0 ? (
          <View style={{ gap: theme.spacing.lg }}>
            <TextField
              label={t('auth.fullName')}
              value={values.ownerName}
              onChangeText={(v) => setField('ownerName', v)}
              error={fieldError(errors.ownerName)}
              autoComplete="name"
              required
            />
            <TextField
              label={t('auth.email')}
              value={values.email}
              onChangeText={(v) => setField('email', v)}
              error={fieldError(errors.email)}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              required
            />
            <PhoneField
              label={t('auth.phone')}
              value={values.phone}
              onChangeText={(v) => setField('phone', v)}
              error={fieldError(errors.phone)}
              hint={t('auth.phoneHint')}
              required
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={{ gap: theme.spacing.lg }}>
            <TextField
              label={t('auth.madrasaName')}
              value={values.madrasaName}
              onChangeText={(v) => setField('madrasaName', v)}
              error={fieldError(errors.madrasaName)}
              required
            />
            <CountyField
              label={t('auth.county')}
              value={values.county}
              onChange={(v) => setField('county', v)}
              error={fieldError(errors.county)}
              required
            />
            <TextField
              label={t('auth.town')}
              value={values.town}
              onChangeText={(v) => setField('town', v)}
              error={fieldError(errors.town)}
              required
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: theme.spacing.lg }}>
            <TextField
              label={t('auth.password')}
              value={values.password}
              onChangeText={(v) => setField('password', v)}
              error={fieldError(errors.password)}
              secure
              autoCapitalize="none"
              autoComplete="new-password"
              required
            />
            <TextField
              label={t('auth.confirmPassword')}
              value={values.confirmPassword}
              onChangeText={(v) => setField('confirmPassword', v)}
              error={fieldError(errors.confirmPassword)}
              secure
              autoCapitalize="none"
              required
            />
            <Checkbox
              label={t('auth.acceptTerms')}
              checked={values.acceptedTerms}
              onChange={(v) => setField('acceptedTerms', v)}
              error={fieldError(errors.acceptedTerms)}
            />
            <Checkbox
              label={t('auth.acceptDataPolicy')}
              checked={values.acceptedDataPolicy}
              onChange={(v) => setField('acceptedDataPolicy', v)}
              error={fieldError(errors.acceptedDataPolicy)}
            />
          </View>
        ) : null}

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
      </Screen>
    </KeyboardAvoidingView>
  );
}
