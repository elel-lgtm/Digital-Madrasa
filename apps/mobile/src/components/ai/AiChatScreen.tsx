import type { Role, Student } from '@digital-madrasa/shared';
import { ArrowUp, Sparkle, Trash, WarningCircle } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useConversation, type AiMessage } from '@/ai/useConversation';
import { AppText, Button, Card, PageHeader, Screen } from '@/components/ui';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

/** Starters, matching the gateway's role prompts. */
const SUGGESTIONS: Record<Role, string[]> = {
  student: ['How am I progressing?', 'What should I revise next?', 'Which subject is my weakest?'],
  teacher: [
    'Summarise my class performance',
    'Which students may need extra support?',
    'Who has attendance I should worry about?',
  ],
  parent: [
    'Summarise my child’s progress',
    'How has attendance been?',
    'What should my child improve?',
  ],
  admin: ['Summarise activity across madrasas'],
};

export function AiChatScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const role = session.user.role;

  const children = session.children ?? [];
  const [childId, setChildId] = useState<string | null>(
    children.length === 1 ? (children[0]?.id ?? null) : null,
  );

  const { messages, pending, error, send, retry, clear, canRetry } = useConversation(childId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<AiMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      // A short delay lets the new bubble lay out before we scroll to it.
      const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [messages.length]);

  const submit = (text: string) => {
    // A parent with several children must say which one, or the assistant
    // would silently answer about all of them at once.
    if (role === 'parent' && children.length > 1 && !childId) {
      Alert.alert(t('ai.chooseChildTitle'), t('ai.chooseChildBody'));
      return;
    }
    setDraft('');
    void send(text);
  };

  const confirmClear = () => {
    if (messages.length === 0) return;
    Alert.alert(t('ai.clearTitle'), t('ai.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ai.clear'), style: 'destructive', onPress: clear },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <Screen scroll={false}>
        <PageHeader
          title={t('ai.title')}
          subtitle={t('ai.subtitle')}
          showBack
          right={
            messages.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('ai.clear')}
                onPress={confirmClear}
                hitSlop={10}
                style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
              >
                <Trash size={22} color={theme.colors.textMuted} />
              </Pressable>
            ) : undefined
          }
        />

        {role === 'parent' && children.length > 1 ? (
          <ChildSelector
            children={children}
            selectedId={childId}
            onSelect={setChildId}
          />
        ) : null}

        {messages.length === 0 ? (
          <EmptyState role={role} onPick={submit} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{
              paddingVertical: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
            renderItem={({ item }) => <Bubble message={item} onRetry={retry} />}
            ListFooterComponent={pending ? <Thinking /> : null}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {error && error.kind === 'not_configured' ? (
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.warningSoft,
              marginBottom: theme.spacing.sm,
            }}
          >
            <WarningCircle size={18} color={theme.colors.warning} weight="fill" />
            <AppText variant="caption" color="warning" style={{ flex: 1 }}>
              {error.message}
            </AppText>
          </View>
        ) : null}

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => submit(draft)}
          disabled={pending}
          canRetry={canRetry && Boolean(error)}
          onRetry={retry}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function ChildSelector({
  children,
  selectedId,
  onSelect,
}: {
  children: Student[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
      <AppText variant="label" color="textMuted" uppercase>
        {t('ai.askingAbout')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        {children.map((child) => {
          const selected = child.id === selectedId;
          return (
            <Pressable
              key={child.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={child.fullName}
              onPress={() => onSelect(child.id)}
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected ? theme.colors.accentSoft : 'transparent',
              }}
            >
              <AppText variant="caption" color={selected ? 'accent' : 'textMuted'}>
                {child.fullName.split(' ')[0]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EmptyState({ role, onPick }: { role: Role; onPick: (text: string) => void }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.xl }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <Sparkle size={40} color={theme.colors.accent} weight="duotone" />
        <AppText variant="heading" align="center">
          {t('ai.emptyTitle')}
        </AppText>
        <AppText variant="body" color="textMuted" align="center">
          {t(`ai.emptyBody.${role}`)}
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        {(SUGGESTIONS[role] ?? []).map((prompt) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            accessibilityLabel={prompt}
            onPress={() => onPick(prompt)}
            style={({ pressed }) => ({
              padding: theme.spacing.md,
              minHeight: MIN_TOUCH_TARGET,
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <AppText variant="body">{prompt}</AppText>
          </Pressable>
        ))}
      </View>

      <AppText variant="caption" color="textSubtle" align="center">
        {t('ai.disclaimer')}
      </AppText>
    </View>
  );
}

function Bubble({ message, onRetry }: { message: AiMessage; onRetry: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isUser = message.author === 'user';

  if (message.failed) {
    return (
      <Card accent="danger">
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
            <WarningCircle size={18} color={theme.colors.danger} weight="fill" />
            <AppText variant="bodyStrong" color="danger" style={{ flex: 1 }}>
              {t('ai.errorTitle')}
            </AppText>
          </View>
          <AppText variant="caption" color="textMuted">
            {message.text}
          </AppText>
          <Button label={t('common.retry')} variant="secondary" onPress={onRetry} />
        </View>
      </Card>
    );
  }

  return (
    <View
      accessibilityLabel={`${isUser ? t('ai.you') : t('ai.assistant')}: ${message.text}`}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: isUser ? theme.colors.accent : theme.colors.surfaceAlt,
        gap: theme.spacing.xs,
      }}
    >
      <AppText variant="body" color={isUser ? 'textOnAccent' : 'text'}>
        {message.text}
      </AppText>
      {message.disclaimer ? (
        <AppText variant="caption" color="textSubtle">
          {message.disclaimer}
        </AppText>
      ) : null}
    </View>
  );
}

function Thinking() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('ai.thinking')}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <Sparkle size={16} color={theme.colors.accent} weight="duotone" />
      <AppText variant="caption" color="textMuted">
        {t('ai.thinking')}
      </AppText>
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  canRetry,
  onRetry,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const ready = value.trim().length > 0 && !disabled;

  return (
    <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.sm }}>
      {canRetry ? (
        <Button label={t('common.retry')} variant="secondary" onPress={onRetry} />
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.spacing.sm,
          padding: theme.spacing.xs,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <TextInput
          accessibilityLabel={t('ai.inputLabel')}
          value={value}
          onChangeText={onChange}
          placeholder={t('ai.placeholder')}
          placeholderTextColor={theme.colors.textSubtle}
          multiline
          maxLength={2000}
          editable={!disabled}
          style={{
            flex: 1,
            maxHeight: 120,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: 10,
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
            fontSize: theme.typography.body.fontSize,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ai.send')}
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={onSend}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            borderRadius: MIN_TOUCH_TARGET / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ready ? theme.colors.accent : theme.colors.border,
          }}
        >
          <ArrowUp
            size={20}
            color={ready ? theme.colors.textOnAccent : theme.colors.textSubtle}
            weight="bold"
          />
        </Pressable>
      </View>
    </View>
  );
}
