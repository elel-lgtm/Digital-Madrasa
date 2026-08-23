import { SURAHS, type Surah } from '@digital-madrasa/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { AppText, Divider, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

interface SurahPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (surah: Surah) => void;
  selected?: number;
}

/**
 * Full-screen surah chooser. Searchable by number, transliteration or Arabic
 * name, because students look surahs up all three ways.
 */
export function SurahPicker({ visible, onClose, onSelect, selected }: SurahPickerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SURAHS;
    return SURAHS.filter(
      (surah) =>
        String(surah.number) === term ||
        surah.name.toLowerCase().includes(term) ||
        surah.arabicName.includes(query.trim()),
    );
  }, [query]);

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
              {t('student.chooseSurah')}
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
            placeholder="Al-Mulk"
            autoCapitalize="none"
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => String(item.number)}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
          ItemSeparatorComponent={Divider}
          renderItem={({ item }) => {
            const isSelected = item.number === selected;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${item.number}. ${item.name}`}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
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
                    {item.number}
                  </AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{item.name}</AppText>
                  <AppText variant="caption" color="textSubtle">
                    {item.ayahCount} ayahs
                  </AppText>
                </View>
                <AppText arabic scale={0.7} color="textMuted">
                  {item.arabicName}
                </AppText>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
