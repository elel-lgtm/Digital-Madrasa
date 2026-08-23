import type { Student } from '@digital-madrasa/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { MagnifyingGlass, Plus, UsersThree } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  ListRow,
  PageHeader,
  Screen,
  Segmented,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useDebounced } from '@/hooks/useDebounced';
import { useTheme } from '@/theme/ThemeProvider';

export default function StudentsTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState<string>('all');
  const debouncedSearch = useDebounced(search, 300);

  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });

  const students = useInfiniteQuery({
    queryKey: qk.students({ search: debouncedSearch, classId }),
    queryFn: ({ pageParam }) =>
      api.listStudents({
        search: debouncedSearch,
        classId: classId === 'all' ? null : classId,
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const rows: Student[] = useMemo(
    () => students.data?.pages.flatMap((page) => page.items) ?? [],
    [students.data],
  );

  const classOptions = useMemo(
    () => [
      { value: 'all', label: t('common.all') },
      ...(classes.data ?? []).map((klass) => ({ value: klass.id, label: klass.name })),
    ],
    [classes.data, t],
  );

  return (
    <Screen scroll={false}>
      <PageHeader
        title={t('nav.students')}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('teacher.addStudent')}
            onPress={() => router.push('/(teacher)/student-new')}
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={22} color={theme.colors.textOnAccent} weight="bold" />
          </Pressable>
        }
      />

      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
        <TextField
          label={t('common.search')}
          value={search}
          onChangeText={setSearch}
          placeholder={t('teacher.searchStudents')}
          autoCapitalize="characters"
          right={<MagnifyingGlass size={18} color={theme.colors.textSubtle} />}
        />
        {classOptions.length > 1 ? (
          <Segmented
            options={classOptions.slice(0, 4)}
            value={classId}
            onChange={setClassId}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, marginTop: theme.spacing.lg }}>
        {students.isPending ? (
          <SkeletonList count={5} />
        ) : students.isError ? (
          <ErrorState
            {...describeError(students.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void students.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UsersThree size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={debouncedSearch ? t('empty.noResults') : t('empty.noStudents')}
            body={debouncedSearch ? t('empty.noResultsBody') : t('empty.noStudentsBody')}
            action={
              debouncedSearch
                ? undefined
                : {
                    label: t('teacher.addStudent'),
                    onPress: () => router.push('/(teacher)/student-new'),
                  }
            }
          />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            refreshing={students.isRefetching}
            onRefresh={() => void students.refetch()}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (students.hasNextPage && !students.isFetchingNextPage) {
                void students.fetchNextPage();
              }
            }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.5 }} />
            )}
            ListFooterComponent={
              students.isFetchingNextPage ? (
                <View style={{ paddingVertical: theme.spacing.lg }}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <ListRow
                title={item.fullName}
                subtitle={item.className ?? undefined}
                left={<Avatar name={item.fullName} />}
                right={<Badge label={item.admissionNo} />}
                showChevron={false}
                onPress={() =>
                  router.push({ pathname: '/(teacher)/student/[id]', params: { id: item.id } })
                }
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}
