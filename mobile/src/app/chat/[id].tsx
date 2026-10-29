import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/action-sheet';
import { Avatar } from '@/components/avatar';
import { Composer } from '@/components/composer';
import { MediaViewer } from '@/components/media-viewer';
import { MessageBubble } from '@/components/message-bubble';
import { formatDayHeader, isSameDay } from '@/lib/format';
import { NETWORKS } from '@/lib/networks';
import { setVisibleChat } from '@/lib/push';
import { useBackend, useChat, useColors, useMessages } from '@/lib/store';
import type { Message, OutgoingMedia } from '@/lib/types';

type Row =
  | { type: 'day'; key: string; ts: number }
  | { type: 'msg'; key: string; message: Message; first: boolean; last: boolean };

const GROUP_GAP = 5 * 60_000;
const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const BRIDGE_COMMANDS = ['login qr', 'login', 'list-logins', 'help', 'logout', 'cancel'];

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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [viewing, setViewing] = useState<Message | null>(null);
  const inputRef = useRef<TextInput>(null);

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
    backend.sendText(id, text, replyTo?.id);
    setReplyTo(null);
  };
  const sendMedia = (media: OutgoingMedia) => backend.sendMedia(id, media);

  const onLongPress = useCallback((m: Message) => setSelected(m), []);
  const onReact = useCallback((m: Message, key: string) => backend.react(id, m.id, key), [backend, id]);
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
        <Avatar title={chat.title} image={chat.avatar} network={chat.network} size={38} isGroup={chat.isGroup} />
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {chat.title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        </View>
        {chat.muted && <Ionicons name="notifications-off" size={18} color={colors.textFaint} />}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FlatList
          inverted
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
                onReact={onReact}
                onOpenMedia={onOpenMedia}
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
                    inputRef.current?.focus();
                  },
                },
                { label: 'Copy text', icon: 'copy-outline', onPress: () => Clipboard.setStringAsync(selected.text) },
              ]
            : []
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
});
