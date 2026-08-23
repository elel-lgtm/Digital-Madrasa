import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AppText, Card, ProgressBar, Skeleton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const WINDOW_SECONDS = 30;

/**
 * Rotating attendance QR.
 *
 * The token changes every 30 seconds and the server rejects anything older
 * than one window, so a screenshot passed around the class stops working
 * almost immediately.
 */
export function AttendanceQrPanel({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [secondsLeft, setSecondsLeft] = useState(WINDOW_SECONDS);

  const token = useQuery({
    queryKey: qk.qrToken(classId),
    queryFn: () => api.getAttendanceQrToken(classId),
    enabled: Boolean(classId),
    refetchInterval: WINDOW_SECONDS * 1000,
    staleTime: 0,
  });

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() % (WINDOW_SECONDS * 1000)) / 1000;
      setSecondsLeft(Math.max(0, Math.ceil(WINDOW_SECONDS - elapsed)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card>
      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
          <AppText variant="heading" align="center">
            {t('teacher.qrAttendance')}
          </AppText>
          <AppText variant="caption" color="textMuted" align="center">
            {t('teacher.qrAttendanceBody')}
          </AppText>
        </View>

        <View
          style={{
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            // QR contrast has to be reliable, so this panel stays white in
            // both themes rather than inverting with the surface.
            backgroundColor: '#FFFFFF',
          }}
        >
          {token.isPending || !token.data ? (
            <Skeleton height={200} width={200} radius={8} />
          ) : (
            <QRCode value={token.data.token} size={200} backgroundColor="#FFFFFF" color="#12100E" />
          )}
        </View>

        <View style={{ alignSelf: 'stretch', gap: theme.spacing.xs }}>
          <ProgressBar
            value={secondsLeft}
            max={WINDOW_SECONDS}
            tone={secondsLeft <= 5 ? 'warning' : 'accent'}
            label={t('teacher.qrAttendance')}
            height={6}
          />
          <AppText variant="caption" color="textSubtle" align="center">
            {secondsLeft}s
          </AppText>
        </View>
      </View>
    </Card>
  );
}
