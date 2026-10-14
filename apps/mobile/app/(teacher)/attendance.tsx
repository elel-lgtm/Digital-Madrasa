import { ATTENDANCE_STATUSES, isoDate, type AttendanceStatus } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useLocalSearchParams } from 'expo-router';
import { QrCode } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AttendanceQrPanel } from '@/components/AttendanceQrPanel';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Divider,
  ErrorState,
  PageHeader,
  Screen,
  Segmented,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { isNetworkError, queueAttendance } from '@/offline/outbox';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { longDate } from '@/utils/dates';

const STATUS_TONE: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'info'> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
};

export default function Attendance() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ classId?: string }>();

  const sessionDate = isoDate();
  const [classId, setClassId] = useState<string>(params.classId ?? '');
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [qrMode, setQrMode] = useState(false);
  const [saved, setSaved] = useState(false);
  // Saved on the phone, waiting for a connection (offline/outbox.ts).
  const [queued, setQueued] = useState(false);

  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });

  useEffect(() => {
    if (!classId && classes.data?.[0]) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  const roster = useQuery({
    queryKey: qk.attendance(classId, sessionDate),
    queryFn: () => api.listAttendance({ classId, sessionDate }),
    enabled: Boolean(classId),
  });

  // Seed the local marks from whatever is already recorded for today.
  useEffect(() => {
    if (!roster.data) return;
    setMarks(
      Object.fromEntries(roster.data.map((record) => [record.studentId, record.status])),
    );
  }, [roster.data]);

  const save = useMutation({
    // React Query pauses mutations while offline; this one handles offline
    // itself (it keeps the register on the phone), so it must always run.
    networkMode: 'always',
    mutationFn: async (): Promise<'sent' | 'queued'> => {
      const input = {
        classId,
        sessionDate,
        method: 'manual' as const,
        entries: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
      };
      // No connection: keep the register on the phone; it is sent automatically later.
      // Ask the phone, but never wait long: a hung check must not freeze the button.
      const net = await Promise.race([
        NetInfo.fetch(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (net && net.isConnected === false) {
        await queueAttendance(input);
        return 'queued';
      }
      try {
        await api.markAttendance(input);
        return 'sent';
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueAttendance(input);
        return 'queued';
      }
    },
    onSuccess: (result) => {
      setSaved(true);
      setQueued(result === 'queued');
      if (result === 'sent') void queryClient.invalidateQueries();
    },
  });

  const markAllPresent = () => {
    setSaved(false);
    setMarks(Object.fromEntries((roster.data ?? []).map((r) => [r.studentId, 'present'])));
  };

  const selectedClass = (classes.data ?? []).find((klass) => klass.id === classId);

  return (
    <Screen
      footer={
        qrMode ? undefined : (
          <Button
            label={saved ? t('common.done') : t('common.save')}
            size="lg"
            loading={save.isPending}
            disabled={Object.keys(marks).length === 0}
            onPress={() => save.mutate()}
          />
        )
      }
    >
      <PageHeader
        title={t('teacher.attendance')}
        subtitle={`${selectedClass?.name ?? ''} · ${longDate(sessionDate)}`}
        showBack
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('teacher.qrAttendance')}
            onPress={() => setQrMode((value) => !value)}
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: qrMode ? theme.colors.accent : theme.colors.surfaceAlt,
            }}
          >
            <QrCode
              size={22}
              color={qrMode ? theme.colors.textOnAccent : theme.colors.text}
              weight="duotone"
            />
          </Pressable>
        }
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        {saved && queued ? (
          <AppText variant="body" color="warning">
            {t('offline.attendanceQueued')}
          </AppText>
        ) : null}
        {(classes.data ?? []).length > 1 ? (
          <Segmented
            options={(classes.data ?? []).slice(0, 4).map((klass) => ({
              value: klass.id,
              label: klass.name,
            }))}
            value={classId}
            onChange={(value) => {
              setClassId(value);
              setSaved(false);
            }}
          />
        ) : null}

        {qrMode ? (
          <AttendanceQrPanel classId={classId} />
        ) : roster.isPending ? (
          <SkeletonList count={4} />
        ) : roster.isError ? (
          <ErrorState
            {...describeError(roster.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void roster.refetch()}
          />
        ) : (
          <>
            <Button
              label={t('teacher.markAll')}
              variant="secondary"
              onPress={markAllPresent}
            />

            <Card padded={false}>
              {(roster.data ?? []).map((record, index) => (
                <View key={record.studentId} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <View style={{ paddingVertical: theme.spacing.md, gap: theme.spacing.sm }}>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                    >
                      <Avatar name={record.studentName} size={34} />
                      <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                        {record.studentName}
                      </AppText>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {ATTENDANCE_STATUSES.map((status) => {
                        const selected = marks[record.studentId] === status;
                        const tone = STATUS_TONE[status];
                        return (
                          <Pressable
                            key={status}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`${record.studentName}: ${t(`teacher.${status}`)}`}
                            onPress={() => {
                              setSaved(false);
                              setMarks((prev) => ({ ...prev, [record.studentId]: status }));
                            }}
                            style={{
                              flex: 1,
                              minHeight: MIN_TOUCH_TARGET - 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: theme.radius.sm,
                              borderWidth: 1,
                              borderColor: selected ? theme.colors[tone] : theme.colors.border,
                              backgroundColor: selected
                                ? theme.colors[`${tone}Soft` as const]
                                : 'transparent',
                            }}
                          >
                            <AppText variant="caption" color={selected ? tone : 'textMuted'}>
                              {t(`teacher.${status}`)}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
