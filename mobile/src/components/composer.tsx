import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useMemo, useState, type Ref } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { formatDuration, pickFiles, pickFromLibrary, takePhoto } from '@/lib/media';
import { useTheme } from '@/lib/store';
import type { Member, OutgoingMedia } from '@/lib/types';
import { ActionSheet } from './action-sheet';
import { Avatar } from './avatar';
import { Text, TextInput, type TextInputRef } from './themed';

type Props = {
  placeholder: string;
  bottomInset: number;
  inputRef?: Ref<TextInputRef>;
  draft: string;
  onChangeDraft: (text: string) => void;
  /** Editing an existing message: the send button saves instead. */
  editing?: boolean;
  /** People who can be @mentioned; typing "@" suggests them. */
  members?: Member[];
  onMention?: (member: Member) => void;
  /** Hide attachments and voice notes (e.g. bridge command chats). */
  textOnly?: boolean;
  onSendText: (text: string) => void;
  onSendMedia: (media: OutgoingMedia) => void;
};

/** The "@partial name" being typed at the end of the draft, if any. */
const MENTION_QUERY = /(?:^|\s)@([^\s@]*)$/;

function alertError(e: unknown) {
  const message = (e as Error)?.message ?? String(e);
  if (Platform.OS === 'web') globalThis.alert?.(message);
  else Alert.alert('Something went wrong', message);
}

export function Composer({
  placeholder,
  bottomInset,
  inputRef,
  draft,
  onChangeDraft,
  editing,
  members,
  onMention,
  textOnly,
  onSendText,
  onSendMedia,
}: Props) {
  const { colors, radius } = useTheme();
  const round = { borderRadius: 20 * radius };
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const sendText = () => {
    const text = draft.trim();
    if (!text) return;
    onSendText(text);
  };

  const query = draft.match(MENTION_QUERY)?.[1];
  const suggestions = useMemo(() => {
    if (query === undefined || !members?.length) return [];
    const q = query.toLowerCase();
    // Match the start of any word, so "@pri" finds "Priya" and "@pat" finds "Sean Patrick".
    return members.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))).slice(0, 5);
  }, [query, members]);

  const pickMention = (member: Member) => {
    onChangeDraft(draft.replace(MENTION_QUERY, (whole) => `${whole.startsWith('@') ? '' : whole[0]}@${member.name} `));
    onMention?.(member);
  };

  const attach = async (pick: () => Promise<OutgoingMedia[]>) => {
    try {
      for (const media of await pick()) onSendMedia(media);
    } catch (e) {
      alertError(e);
    }
  };

  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error('Microphone permission is needed to record voice messages.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e) {
      alertError(e);
    }
  };

  const finishRecording = async (send: boolean) => {
    const duration = recorder.getStatus().durationMillis;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (send && recorder.uri && duration > 500) {
        const isWeb = Platform.OS === 'web';
        onSendMedia({
          kind: 'audio',
          voice: true,
          uri: recorder.uri,
          name: `voice-${Date.now()}.${isWeb ? 'webm' : 'm4a'}`,
          mimeType: isWeb ? 'audio/webm' : 'audio/mp4',
          duration,
        });
      }
    } catch (e) {
      alertError(e);
    }
  };

  const hasText = draft.trim().length > 0;

  return (
    <>
      {suggestions.length > 0 && (
        <View style={[styles.suggestions, { backgroundColor: colors.surface, borderRadius: 12 * radius }]}>
          {suggestions.map((m) => (
            <Pressable
              key={m.userId}
              onPress={() => pickMention(m)}
              style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <Avatar title={m.name} image={m.avatar} size={28} />
              <Text style={{ color: colors.text, fontSize: 15 }} numberOfLines={1}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.composer, { paddingBottom: bottomInset }]}>
        {recording ? (
          <View style={[styles.recording, round, { backgroundColor: colors.surface }]}>
            <Pressable hitSlop={10} onPress={() => finishRecording(false)}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
            <View style={[styles.dot, { backgroundColor: colors.danger }]} />
            <Text style={{ color: colors.text, fontVariant: ['tabular-nums'], flex: 1 }}>
              {formatDuration(recorderState.durationMillis)}
            </Text>
            <Text style={{ color: colors.textMuted }}>Recording…</Text>
          </View>
        ) : (
          <>
            {!textOnly && (
              <Pressable hitSlop={6} onPress={() => setAttachOpen(true)} style={styles.side}>
                <Ionicons name="add-circle-outline" size={30} color={colors.textMuted} />
              </Pressable>
            )}
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={onChangeDraft}
              placeholder={placeholder}
              placeholderTextColor={colors.textFaint}
              multiline
              style={[styles.input, round, { backgroundColor: colors.surface, color: colors.text }]}
              onKeyPress={(e) => {
                // On web, Enter sends and Shift+Enter adds a newline.
                const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                  (e as unknown as { preventDefault: () => void }).preventDefault();
                  sendText();
                }
              }}
            />
          </>
        )}
        {hasText || textOnly ? (
          <Pressable
            onPress={sendText}
            disabled={!hasText}
            style={[styles.send, round, { backgroundColor: hasText ? colors.accent : colors.surface }]}>
            <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={20} color={hasText ? colors.accentText : colors.textFaint} />
          </Pressable>
        ) : recording ? (
          <Pressable onPress={() => finishRecording(true)} style={[styles.send, round, { backgroundColor: colors.accent }]}>
            <Ionicons name="arrow-up" size={20} color={colors.accentText} />
          </Pressable>
        ) : (
          <Pressable onPress={startRecording} style={[styles.send, round, { backgroundColor: colors.surface }]}>
            <Ionicons name="mic" size={20} color={colors.text} />
          </Pressable>
        )}
      </View>
      <ActionSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        actions={[
          { label: 'Photos & videos', icon: 'images-outline', onPress: () => attach(pickFromLibrary) },
          { label: 'Camera', icon: 'camera-outline', onPress: () => attach(takePhoto) },
          { label: 'File', icon: 'document-outline', onPress: () => attach(pickFiles) },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  side: { height: 40, justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
  },
  send: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  recording: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 40,
    paddingHorizontal: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  suggestions: { marginHorizontal: 12, marginTop: 6, paddingVertical: 4, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
});
