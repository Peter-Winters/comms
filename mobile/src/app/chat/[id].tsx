import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, type TextInputRef } from '@/components/themed';
import { ActionSheet } from '@/components/action-sheet';
import { Avatar } from '@/components/avatar';
import { Composer } from '@/components/composer';
import { MediaViewer } from '@/components/media-viewer';
import { MessageBubble } from '@/components/message-bubble';
import { formatDayHeader, isSameDay, typingText } from '@/lib/format';
import { NETWORKS } from '@/lib/networks';
import { setVisibleChat } from '@/lib/push';
import { useBackend, useChat, useColors, useMessages } from '@/lib/store';
import type { Member, Message, OutgoingMedia } from '@/lib/types';

type Row =
  | { type: 'day'; key: string; ts: number }
  | { type: 'msg'; key: string; message: Message; first: boolean; last: boolean };

const GROUP_GAP = 5 * 60_000;
const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const BRIDGE_COMMANDS = ['login qr', 'login', 'list-logins', 'help', 'logout', 'cancel'];
/** Re-send "typing" this often while the user keeps typing (the server forgets after ~6s). */
const TYPING_REFRESH_MS = 4000;

/** Tells the chat you're typing, at most every few seconds, and once when you stop. */
function typingSender(send: (typing: boolean) => void) {
  let sentAt = 0;
  return {
    typed() {
      if (Date.now() - sentAt < TYPING_REFRESH_MS) return;
      sentAt = Date.now();
      send(true);
    },
    stopped() {
      if (!sentAt) return;
      sentAt = 0;
      send(false);
    },
  };
}

function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(message)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

function buildRows(messages: Message[]): Row[] {
  const rows: Row[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || !isSameDay(prev.ts, m.ts)) rows.push({ type: 'day', key: `day-${m.ts}`, ts: m.ts });
    const continues = (a?: Message, b?: Message) =>
      !!a && !!b && a.senderId === b.senderId && b.ts - a.ts < GROUP_GAP && isSameDay(a.ts, b.ts);
    rows.push({ type: 'msg', key: m.id, message: m, first: !continues(prev, m), last: !continues(m, next) });
  });
  return rows.reverse(); // the list is inverted: newest at the bottom
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const backend = useBackend();
  const chat = useChat(id);
  const messages = useMessages(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [reactionsOf, setReactionsOf] = useState<Message | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [viewing, setViewing] = useState<Message | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Message | null>(null);
  const [mentions, setMentions] = useState<Member[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const inputRef = useRef<TextInputRef>(null);
  const listRef = useRef<FlatList<Row>>(null);

  const rows = useMemo(() => buildRows(messages), [messages]);
  const unread = !!chat && (chat.unreadCount > 0 || chat.markedUnread);

  // Reading the chat clears its unread state, including when new messages arrive while open.
  useEffect(() => {
    if (unread && AppState.currentState === 'active') backend.markRead(id);
  }, [backend, id, unread, messages.length]);

  // Don't pop up notifications for the chat that's on screen.
  useFocusEffect(
    useCallback(() => {
      setVisibleChat(id);
      return () => setVisibleChat(null);
    }, [id]),
  );

  // Fill the screen with some history on first open.
  useEffect(() => {
    if (messages.length < 15 && backend.hasMoreHistory(id)) backend.loadOlder(id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, id]);

  // Group members, for @mention suggestions.
  const isGroup = !!chat?.isGroup;
  useEffect(() => {
    if (!isGroup) return;
    let cancelled = false;
    backend
      .getMembers(id)
      .then((list) => !cancelled && setMembers(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [backend, id, isGroup]);

  const typing = useMemo(() => typingSender((on) => backend.setTyping(id, on)), [backend, id]);
  // Stop showing as typing when leaving the chat.
  useEffect(() => () => typing.stopped(), [typing]);
  const stopTyping = () => typing.stopped();

  const changeDraft = (text: string) => {
    setDraft(text);
    if (!text.trim()) typing.stopped();
    else if (!editing) typing.typed();
  };

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !backend.hasMoreHistory(id)) return;
    setLoadingOlder(true);
    try {
      await backend.loadOlder(id);
    } finally {
      setLoadingOlder(false);
    }
  }, [backend, id, loadingOlder]);

  const send = (text: string) => {
    if (editing) {
      if (text !== editing.text) backend.editMessage(id, editing.id, text);
      setEditing(null);
    } else {
      backend.sendText(id, text, replyTo?.id, mentions);
      setReplyTo(null);
    }
    setDraft('');
    setMentions([]);
    stopTyping();
  };

  // Focusing while the action sheet is still closing loses the focus (and the keyboard) to the sheet.
  const focusInputAfterSheet = () => setTimeout(() => inputRef.current?.focus(), 350);

  const startEditing = (m: Message) => {
    setReplyTo(null);
    setEditing(m);
    setDraft(m.text);
    focusInputAfterSheet();
  };
  const cancelEditing = () => {
    setEditing(null);
    setDraft('');
  };

  const jumpTo = useCallback(
    (messageId: string) => {
      const index = rows.findIndex((r) => r.key === messageId);
      if (index < 0) return; // older than what's loaded
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setHighlighted(messageId);
      setTimeout(() => setHighlighted((h) => (h === messageId ? null : h)), 1600);
    },
    [rows],
  );
  const sendMedia = (media: OutgoingMedia) => backend.sendMedia(id, media);

  const onLongPress = useCallback((m: Message) => {
    if (m.kind !== 'deleted') setSelected(m);
  }, []);
  const onReact = useCallback((m: Message, key: string) => backend.react(id, m.id, key), [backend, id]);
  const onShowReactions = useCallback((m: Message) => setReactionsOf(m), []);
  const onVote = useCallback((m: Message, ids: string[]) => backend.votePoll(id, m.id, ids), [backend, id]);
  const onOpenMedia = useCallback((m: Message) => setViewing(m), []);

  if (!chat) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  const network = NETWORKS[chat.network];
  const subtitle = chat.isBridgeControl
    ? 'Bridge control — send commands to connect your account'
    : chat.typing
      ? chat.isGroup
        ? typingText(chat.typing)
        : 'typing…'
      : chat.isGroup && chat.memberCount
      ? `${network.name} · ${chat.memberCount} members`
      : network.name;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => !chat.isBridgeControl && router.push({ pathname: '/chat-info/[id]', params: { id } })}
          style={styles.headerMain}>
          <Avatar title={chat.title} image={chat.avatar} network={chat.network} size={38} isGroup={chat.isGroup} />
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
              {chat.title}
            </Text>
            <Text numberOfLines={1} style={[styles.subtitle, { color: chat.typing ? colors.accent : colors.textMuted }]}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
        {chat.muted && <Ionicons name="notifications-off" size={18} color={colors.textFaint} />}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FlatList
          ref={listRef}
          inverted
          extraData={highlighted}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            // Rows vary in height; scroll near it, then try again once it's rendered.
            listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5 }), 120);
          }}
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <Text style={[styles.day, { color: colors.textFaint }]}>{formatDayHeader(item.ts)}</Text>
            ) : (
              <MessageBubble
                message={item.message}
                isGroup={chat.isGroup}
                firstInGroup={item.first}
                lastInGroup={item.last}
                onLongPress={onLongPress}
                onShowReactions={onShowReactions}
                onVote={onVote}
                onOpenMedia={onOpenMedia}
                onJumpTo={jumpTo}
                highlighted={highlighted === item.message.id}
              />
            )
          }
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator style={{ margin: 16 }} color={colors.textMuted} /> : null
          }
          contentContainerStyle={{ paddingVertical: 8 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />

        {chat.isBridgeControl && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.commandBar}
            contentContainerStyle={styles.commands}
            keyboardShouldPersistTaps="handled">
            {BRIDGE_COMMANDS.map((c) => (
              <Pressable key={c} onPress={() => send(c)} style={[styles.command, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {editing && (
          <View style={[styles.replyBar, { backgroundColor: colors.surface, borderLeftColor: colors.accent }]}>
            <View style={styles.flex}>
              <Text style={[styles.replyLabel, { color: colors.accent }]}>Editing message</Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted }}>
                {editing.text}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={cancelEditing}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {replyTo && (
          <View style={[styles.replyBar, { backgroundColor: colors.surface, borderLeftColor: colors.accent }]}>
            <View style={styles.flex}>
              <Text style={[styles.replyLabel, { color: colors.accent }]}>Replying to {replyTo.senderName}</Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted }}>
                {replyTo.text}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        <Composer
          inputRef={inputRef}
          placeholder={chat.isBridgeControl ? 'Send a command…' : `Message on ${network.name}`}
          bottomInset={Math.max(insets.bottom, 8)}
          textOnly={chat.isBridgeControl}
          draft={draft}
          onChangeDraft={changeDraft}
          editing={!!editing}
          members={members}
          onMention={(m) => {
            setMentions((prev) => [...prev.filter((x) => x.userId !== m.userId), m]);
            inputRef.current?.focus();
          }}
          onSendText={send}
          onSendMedia={sendMedia}
        />
      </KeyboardAvoidingView>

      <MediaViewer message={viewing} onClose={() => setViewing(null)} />
      <ActionSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        header={
          selected && (
            <View style={styles.reactionBar}>
              {QUICK_REACTIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => {
                    onReact(selected, r);
                    setSelected(null);
                  }}
                  style={({ pressed }) => [
                    styles.quickReaction,
                    {
                      backgroundColor: selected.reactions.some((x) => x.key === r && x.mine)
                        ? colors.accent + '33'
                        : pressed
                          ? colors.surfaceAlt
                          : 'transparent',
                    },
                  ]}>
                  <Text style={{ fontSize: 28 }}>{r}</Text>
                </Pressable>
              ))}
            </View>
          )
        }
        actions={
          selected
            ? [
                {
                  label: 'Reply',
                  icon: 'arrow-undo-outline',
                  onPress: () => {
                    setReplyTo(selected);
                    focusInputAfterSheet();
                  },
                },
                { label: 'Copy text', icon: 'copy-outline', onPress: () => Clipboard.setStringAsync(selected.text) },
                ...(selected.fromMe && (selected.kind === 'text' || selected.kind === 'emote') && selected.status !== 'sending'
                  ? [{ label: 'Edit', icon: 'create-outline' as const, onPress: () => startEditing(selected) }]
                  : []),
                ...(selected.fromMe && selected.status !== 'sending'
                  ? [
                      {
                        label: 'Delete for everyone',
                        icon: 'trash-outline' as const,
                        destructive: true,
                        onPress: () =>
                          confirm('Delete message', 'Delete this message for everyone?', 'Delete', () =>
                            backend.deleteMessage(id, selected.id),
                          ),
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
      <ActionSheet
        visible={!!reactionsOf}
        onClose={() => setReactionsOf(null)}
        actions={[]}
        header={
          reactionsOf && (
            <View style={styles.reactionList}>
              <Text style={[styles.reactionListTitle, { color: colors.textMuted }]}>Reactions</Text>
              {reactionsOf.reactions.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => {
                    onReact(reactionsOf, r.key);
                    setReactionsOf(null);
                  }}
                  style={({ pressed }) => [styles.reactionRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={styles.reactionRowKey}>{r.key}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15 }} numberOfLines={3}>
                      {r.senders.join(', ')}
                    </Text>
                    <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
                      {r.mine ? 'Tap to remove yours' : 'Tap to add yours'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { paddingRight: 2 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  day: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 4 },
  commandBar: { flexGrow: 0, flexShrink: 0 },
  commands: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  command: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    gap: 8,
  },
  replyLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  reactionBar: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, paddingBottom: 8 },
  quickReaction: { padding: 6, borderRadius: 24 },
  reactionList: { paddingBottom: 8 },
  reactionListTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  reactionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 10 },
  reactionRowKey: { fontSize: 26 },
});
