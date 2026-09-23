import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { CheckCircle, QrCode, Warning } from 'phosphor-react-native';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { api, ApiError } from '@/api';
import { AppText, Button, Card, PageHeader, Screen } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate } from '@/utils/dates';

type Phase = 'scanning' | 'sending' | 'done' | 'failed';

/**
 * Marks the student present by reading the teacher's rotating code.
 *
 * The camera only reads the code. Everything that decides whether the scan
 * counts — the signature, the 30-second window, which class it belongs to,
 * which madrasa, and whether the caller is even a student — is settled by the
 * `attendance-qr` function. Nothing here re-implements those rules, because a
 * second copy of them on a device the student controls would be worth nothing.
 *
 * The camera fires `onBarcodeScanned` repeatedly while a code is in view, so
 * the first read latches and stops the rest. The upsert on the server is keyed
 * on `(student_id, session_date)`, so a scan that slips through twice is still
 * one row — the latch is for the UI, not for correctness.
 */
export default function ScanAttendance() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const session = useRequiredSession();
  const queryClient = useQueryClient();

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [failure, setFailure] = useState<string | null>(null);
  const [marked, setMarked] = useState<{ sessionDate: string } | null>(null);

  // A ref rather than state: `onBarcodeScanned` can fire again before React
  // has re-rendered with the new phase, which is exactly the double submit
  // this guards against.
  const busy = useRef(false);

  const mark = useMutation({
    mutationFn: (token: string) =>
      api.markAttendanceByQr({ token, studentId: session.student?.id ?? '' }),
    onSuccess: (result) => {
      setMarked({ sessionDate: result.sessionDate });
      setPhase('done');
      // The attendance the student just created is read back by several
      // screens; without this they keep showing the state from before the scan.
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      setFailure(scanMessage(error));
      setPhase('failed');
    },
  });

  /**
   * The server distinguishes an expired code from a foreign one, and the
   * student needs that difference: one means "ask for a new code", the other
   * means "you are in the wrong room".
   */
  const scanMessage = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        if (error.code === 'expired_code') return t('scan.expired');
        if (error.code === 'wrong_class') return t('scan.wrongClass');
        if (error.code === 'forbidden') return t('scan.notStudent');
      }
      return describeError(error).body;
    },
    [describeError, t],
  );

  const onScanned = ({ data }: { data: string }) => {
    if (busy.current) return;
    busy.current = true;
    setFailure(null);

    // A shape check, not an authorisation check: the server still verifies the
    // signature, the window and the class for everything sent to it. This only
    // spares the student a round trip — and a false answer — when they have
    // pointed the camera at a QR code that could never be an attendance code.
    // Without it, any unrelated code comes back as `expired_code` and the
    // screen tells them to ask for a fresh one, which is simply untrue.
    if (data.split('.').length !== 3) {
      setFailure(t('scan.unreadable'));
      setPhase('failed');
      return;
    }

    setPhase('sending');
    mark.mutate(data);
  };

  const scanAgain = () => {
    busy.current = false;
    setFailure(null);
    setMarked(null);
    setPhase('scanning');
  };

  // ------------------------------------------------------------- permission
  if (!permission) {
    // Still reading the current grant; showing the camera frame here would
    // flash an empty black box.
    return (
      <Screen>
        <PageHeader title={t('scan.title')} showBack />
      </Screen>
    );
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <Screen>
        <PageHeader title={t('scan.title')} showBack />
        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.lg }}>
          <Card>
            <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
              <QrCode size={48} color={theme.colors.accent} weight="duotone" />
              <AppText variant="subheading" align="center">
                {t('scan.permissionTitle')}
              </AppText>
              <AppText variant="body" color="textMuted" align="center">
                {blocked ? t('scan.permissionDenied') : t('scan.permissionBody')}
              </AppText>
            </View>
          </Card>
          {/* Once Android stops asking, the prompt cannot be reopened from
              here — Settings is the only route, so that is what is offered. */}
          <Button
            label={blocked ? t('scan.openSettings') : t('scan.permissionAllow')}
            onPress={() => {
              if (blocked) void Linking.openSettings();
              else void requestPermission();
            }}
          />
        </View>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- result
  if (phase === 'done') {
    return (
      <Screen>
        <PageHeader title={t('scan.title')} showBack />
        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.lg }}>
          <Card accent="success">
            <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
              <CheckCircle size={56} color={theme.colors.success} weight="fill" />
              <AppText variant="subheading" align="center">
                {t('scan.successTitle')}
              </AppText>
              {/* Only what the server actually confirmed. */}
              {marked ? (
                <AppText variant="caption" color="textMuted" align="center">
                  {longDate(marked.sessionDate)}
                </AppText>
              ) : null}
            </View>
          </Card>
          <Button label={t('scan.done')} onPress={() => router.back()} />
          <Button label={t('scan.scanAgain')} variant="secondary" onPress={scanAgain} />
        </View>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- camera
  return (
    <Screen scroll={false}>
      <PageHeader title={t('scan.title')} subtitle={t('scan.intro')} showBack />

      <View style={{ flex: 1, marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View
          style={{
            flex: 1,
            borderRadius: theme.radius.lg,
            overflow: 'hidden',
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            // Only QR: leaving the other symbologies on makes the reader
            // slower and invites a barcode that could never be an attendance
            // code in the first place.
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={phase === 'scanning' ? onScanned : undefined}
          />

          {/* The target square. Purely a sighting aid — the reader is not
              limited to this region, so a code slightly outside it still
              works rather than silently failing. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            <View
              style={{
                width: 220,
                height: 220,
                borderRadius: theme.radius.lg,
                borderWidth: 3,
                borderColor:
                  phase === 'sending' ? theme.colors.accent : theme.colors.textOnAccent,
              }}
            />
          </View>
        </View>

        <AppText variant="caption" color="textMuted" align="center">
          {phase === 'sending' ? t('scan.checking') : t('scan.frameHint')}
        </AppText>

        {phase === 'failed' && failure ? (
          <Card accent="danger">
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Warning size={20} color={theme.colors.danger} weight="fill" />
                <AppText variant="bodyStrong" color="danger">
                  {t('errors.genericTitle')}
                </AppText>
              </View>
              <AppText variant="body" color="textMuted">
                {failure}
              </AppText>
              <Button label={t('scan.scanAgain')} onPress={scanAgain} />
            </View>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
