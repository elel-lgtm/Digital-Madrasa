import {
  KENYA_COUNTIES,
  PRIORITY_COUNTIES,
  countyCode,
  type KenyaCounty,
} from '@digital-madrasa/shared';
import { CaretDown, Check, MapPin } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { AppText, Divider, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

interface CountyFieldProps {
  label: string;
  value: string;
  onChange: (county: KenyaCounty) => void;
  error?: string | undefined;
  required?: boolean;
}

type Row = { kind: 'header'; title: string } | { kind: 'county'; county: KenyaCounty };

/**
 * County selector.
 *
 * Forty-seven options is too many for a chip grid, so this is a tappable
 * field that opens a searchable list. The counties we are onboarding first
 * are pinned to the top when no search term is active.
 */
export function CountyField({ label, value, onChange, error, required }: CountyFieldProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
        {required ? (
          <AppText variant="label" color="danger">
            *
          </AppText>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value || t('auth.countyPlaceholder') }}
        accessibilityHint={t('auth.countyHint')}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: MIN_TOUCH_TARGET + 4,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <MapPin
          size={18}
          color={value ? theme.colors.accent : theme.colors.textSubtle}
          weight="duotone"
        />
        <AppText variant="body" color={value ? 'text' : 'textSubtle'} style={{ flex: 1 }}>
          {value || t('auth.countyPlaceholder')}
        </AppText>
        <CaretDown size={16} color={theme.colors.textSubtle} />
      </Pressable>

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <CountyPicker
        visible={open}
        selected={value}
        onClose={() => setOpen(false)}
        onSelect={(county) => {
          onChange(county);
          setOpen(false);
        }}
      />
    </View>
  );
}

interface CountyPickerProps {
  visible: boolean;
  selected: string;
  onClose: () => void;
  onSelect: (county: KenyaCounty) => void;
}

function CountyPicker({ visible, selected, onClose, onSelect }: CountyPickerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const rows = useMemo<Row[]>(() => {
    const term = query.trim().toLowerCase();

    if (term) {
      // Searching flattens the grouping — matches only, alphabetical, so the
      // result order does not depend on which group a county happens to be in.
      const matches = KENYA_COUNTIES.filter(
        (county) =>
          county.toLowerCase().includes(term) || String(countyCode(county)) === term,
      );
      return [...matches]
        .sort((a, b) => a.localeCompare(b))
        .map((county) => ({ kind: 'county', county }));
    }

    const rest = [...KENYA_COUNTIES]
      .filter((county) => !PRIORITY_COUNTIES.includes(county))
      .sort((a, b) => a.localeCompare(b));

    return [
      { kind: 'header', title: t('auth.countyCommon') },
      ...PRIORITY_COUNTIES.map((county) => ({ kind: 'county' as const, county })),
      { kind: 'header', title: t('auth.countyAll') },
      ...rest.map((county) => ({ kind: 'county' as const, county })),
    ];
  }, [query, t]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            paddingTop: theme.spacing.xxl,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <AppText variant="heading" style={{ flex: 1 }}>
              {t('auth.chooseCounty')}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('a11y.closeSheet')}
              onPress={onClose}
              hitSlop={10}
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
            >
              <AppText variant="bodyStrong" color="accent">
                {t('common.close')}
              </AppText>
            </Pressable>
          </View>
          <TextField
            label={t('common.search')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('auth.countySearchPlaceholder')}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(row) => (row.kind === 'header' ? `h:${row.title}` : row.county)}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={{ paddingVertical: theme.spacing.xl }}>
              <AppText variant="body" color="textMuted" align="center">
                {t('auth.countyNoMatch')}
              </AppText>
            </View>
          }
          renderItem={({ item, index }) => {
            if (item.kind === 'header') {
              return (
                <View
                  style={{
                    paddingTop: index === 0 ? theme.spacing.sm : theme.spacing.lg,
                    paddingBottom: theme.spacing.xs,
                  }}
                >
                  <AppText variant="label" color="textSubtle" uppercase>
                    {item.title}
                  </AppText>
                </View>
              );
            }

            const isSelected = item.county === selected;
            return (
              <>
                {index > 0 && rows[index - 1]?.kind === 'county' ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={item.county}
                  onPress={() => onSelect(item.county)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                    paddingVertical: theme.spacing.md,
                    minHeight: MIN_TOUCH_TARGET,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected
                        ? theme.colors.accent
                        : theme.colors.surfaceAlt,
                    }}
                  >
                    <AppText variant="caption" color={isSelected ? 'textOnAccent' : 'textMuted'}>
                      {String(countyCode(item.county)).padStart(2, '0')}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>
                    {item.county}
                  </AppText>
                  {isSelected ? (
                    <Check size={20} color={theme.colors.accent} weight="bold" />
                  ) : null}
                </Pressable>
              </>
            );
          }}
        />
      </View>
    </Modal>
  );
}
