import { emailSchema, otpCodeSchema, passwordSchema } from '@digital-madrasa/shared';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle, EnvelopeSimple } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { api } from '@/api';
import type { PasswordResetChallenge } from '@/api/types';
import { OtpInput } from '@/components/OtpInput';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Step = 'email' | 'code' | 'password' | 'done';

/** Seconds before "Resend code" becomes tappable, to blunt request spam. */
const RESEND_COOLDOWN = 60;

export default function ForgotPassword() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const fieldError = useFieldError();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [challenge, setChallenge] = useState<PasswordResetChallenge | null>(null);

  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const request = useMutation({
    mutationFn: (value: string) => api.requestPasswordReset(value),
    onSuccess: (result) => {
      setChallenge(result);
      setCode('');
      setStep('code');
      setCooldown(RESEND_COOLDOWN);
      setFormError(null);
    },
    onError: (err) => setFormError(describeError(err).body),
  });

  const verify = useMutation({
    mutationFn: api.verifyPasswordResetOtp,
    onSuccess: (result) => {
      setResetToken(result.resetToken);
      setStep('password');
      setError(undefined);
      setFormError(null);
    },
    onError: (err) => setError(describeError(err).body),
  });

  const reset = useMutation({
    mutationFn: api.resetPassword,
    onSuccess: () => setStep('done'),
    onError: (err) => setFormError(describeError(err).body),
  });

  const submitEmail = () => {
    setFormError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    request.mutate(parsed.data);
  };

  const submitCode = (value: string = code) => {
    const parsed = otpCodeSchema.safeParse(value);
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'validation.otp_invalid'));
      return;
    }
    setError(undefined);
    verify.mutate({ email: email.trim(), code: parsed.data });
  };

  const submitPassword = () => {
    setFormError(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'validation.password_too_weak'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('validation.passwords_do_not_match'));
      return;
    }
    setError(undefined);
    reset.mutate({ email: email.trim(), resetToken, password, confirmPassword });
  };

  const goBack = () => {
    setError(undefined);
    setFormError(null);
    if (step === 'code') setStep('email');
    else if (step === 'password') setStep('code');
    else router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={{ paddingTop: theme.spacing.xl, gap: theme.spacing.xl }}>
        {step === 'done' ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('a11y.backButton')}
            onPress={goBack}
            hitSlop={10}
            style={{ alignSelf: 'flex-start' }}
          >
            <ArrowLeft size={24} color={theme.colors.text} />
          </Pressable>
        )}

        {step === 'email' ? (
          <>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="title">{t('auth.forgotTitle')}</AppText>
              <AppText variant="body" color="textMuted">
                {t('auth.forgotBody')}
              </AppText>
            </View>
            <View style={{ gap: theme.spacing.lg }}>
              <TextField
                label={t('auth.email')}
                value={email}
                onChangeText={setEmail}
                error={fieldError(error)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                required
              />
              <Button
                label={t('auth.sendCode')}
                size="lg"
                loading={request.isPending}
                onPress={submitEmail}
              />
            </View>
          </>
        ) : null}

        {step === 'code' ? (
          <>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="title">{t('auth.enterCodeTitle')}</AppText>
              {/* Says "if it is registered" — confirming the address exists
                  here would undo the enumeration protection on the request. */}
              <AppText variant="body" color="textMuted">
                {t('auth.enterCodeBody', { email: email.trim() })}
              </AppText>
            </View>

            <View style={{ gap: theme.spacing.lg }}>
              <OtpInput
                label={t('auth.verificationCode')}
                value={code}
                onChangeText={setCode}
                onComplete={submitCode}
                error={fieldError(error)}
              />

              {challenge?.demoCode ? (
                <Card accent="info">
                  <AppText variant="caption" color="textMuted">
                    {t('auth.demoCodeNotice', { code: challenge.demoCode })}
                  </AppText>
                </Card>
              ) : null}

              <Button
                label={t('auth.verifyCode')}
                size="lg"
                loading={verify.isPending}
                onPress={() => submitCode()}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: cooldown > 0 || request.isPending }}
                disabled={cooldown > 0 || request.isPending}
                onPress={() => request.mutate(email.trim())}
                style={{ alignSelf: 'center', paddingVertical: theme.spacing.sm }}
              >
                <AppText variant="body" color={cooldown > 0 ? 'textSubtle' : 'accent'}>
                  {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendCode')}
                </AppText>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === 'password' ? (
          <>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="title">{t('auth.newPasswordTitle')}</AppText>
              <AppText variant="body" color="textMuted">
                {t('auth.newPasswordBody')}
              </AppText>
            </View>
            <View style={{ gap: theme.spacing.lg }}>
              <TextField
                label={t('auth.password')}
                value={password}
                onChangeText={setPassword}
                error={fieldError(error)}
                hint={t('auth.passwordHint')}
                secure
                autoCapitalize="none"
                autoComplete="new-password"
                required
              />
              <TextField
                label={t('auth.confirmPassword')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secure
                autoCapitalize="none"
                required
              />
              <Button
                label={t('auth.updatePassword')}
                size="lg"
                loading={reset.isPending}
                onPress={submitPassword}
              />
            </View>
          </>
        ) : null}

        {step === 'done' ? (
          <View
            style={{ gap: theme.spacing.md, alignItems: 'center', paddingTop: theme.spacing.xxl }}
          >
            <CheckCircle size={44} color={theme.colors.success} weight="duotone" />
            <AppText variant="title" align="center">
              {t('auth.passwordUpdatedTitle')}
            </AppText>
            <AppText variant="body" color="textMuted" align="center">
              {t('auth.passwordUpdatedBody')}
            </AppText>
            <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg }}>
              <Button label={t('auth.signIn')} onPress={() => router.replace('/(auth)/sign-in')} />
            </View>
          </View>
        ) : null}

        {step === 'email' && !formError ? (
          <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
            <EnvelopeSimple size={20} color={theme.colors.textSubtle} weight="duotone" />
            <AppText variant="caption" color="textSubtle" align="center">
              {t('auth.resetSent')}
            </AppText>
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
