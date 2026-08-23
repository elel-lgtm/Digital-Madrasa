import { createClassSchema } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Button,
  Card,
  OptionGroup,
  PageHeader,
  Screen,
  TextField,
  type Option,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

const DAYS = [
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const;

const DAY_LABEL: Record<(typeof DAYS)[number], string> = {
  saturday: 'Sat',
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
};

export default function NewClass() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [capacity, setCapacity] = useState('20');
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>(['monday', 'wednesday']);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('08:00');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const teachers = useQuery({ queryKey: qk.teachers(), queryFn: () => api.listTeachers() });

  const create = useMutation({
    mutationFn: api.createClass,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      router.back();
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const submit = () => {
    setFormError(null);
    const parsed = createClassSchema.safeParse({
      name,
      level,
      capacity: Number(capacity),
      teacherId,
      schedule: days.map((day) => ({ day, startTime, endTime })),
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
    create.mutate(parsed.data);
  };

  const teacherOptions: Option<string>[] = (teachers.data ?? []).map((teacher) => ({
    value: teacher.id,
    label: teacher.fullName,
  }));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        footer={
          <Button
            label={t('teacher.createClass')}
            size="lg"
            loading={create.isPending}
            onPress={submit}
          />
        }
      >
        <PageHeader title={t('teacher.createClass')} showBack />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <TextField
            label={t('teacher.className')}
            value={name}
            onChangeText={setName}
            error={fieldError(errors['name'])}
            placeholder="Hifz Level 1"
            required
          />
          <TextField
            label={t('teacher.level')}
            value={level}
            onChangeText={setLevel}
            error={fieldError(errors['level'])}
            placeholder="Intermediate"
            required
          />
          <TextField
            label={t('teacher.capacity')}
            value={capacity}
            onChangeText={setCapacity}
            error={fieldError(errors['capacity'])}
            keyboardType="number-pad"
            required
          />

          {teacherOptions.length > 0 ? (
            <OptionGroup
              label={t('teacher.assignTeacher')}
              options={teacherOptions}
              value={teacherId}
              onChange={setTeacherId}
              error={fieldError(errors['teacherId'])}
            />
          ) : null}

          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('teacher.schedule')}
              </AppText>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {DAYS.map((day) => {
                  const selected = days.includes(day);
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={DAY_LABEL[day]}
                      onPress={() =>
                        setDays((current) =>
                          current.includes(day)
                            ? current.filter((value) => value !== day)
                            : [...current, day],
                        )
                      }
                      style={{
                        minWidth: 48,
                        minHeight: MIN_TOUCH_TARGET - 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: theme.radius.sm,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.accent : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.accentSoft
                          : theme.colors.surfaceAlt,
                      }}
                    >
                      <AppText variant="caption" color={selected ? 'accent' : 'textMuted'}>
                        {DAY_LABEL[day]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="From"
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="06:00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="To"
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="08:00"
                  />
                </View>
              </View>
            </View>
          </Card>

          {formError ? (
            <AppText variant="caption" color="danger">
              {formError}
            </AppText>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
