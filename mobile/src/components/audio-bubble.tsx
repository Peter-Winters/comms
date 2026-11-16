import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDuration } from '@/lib/media';
import type { MediaInfo } from '@/lib/types';
import { Text } from './themed';

type Props = { media: MediaInfo; color: string; trackColor: string };

/** Inline player for voice notes and audio files. */
export function AudioBubble({ media, color, trackColor }: Props) {
  const player = useAudioPlayer({ uri: media.uri, headers: media.headers });
  const status = useAudioPlayerStatus(player);
  const durationMs = status.duration ? status.duration * 1000 : (media.duration ?? 0);
  const progress = durationMs ? Math.min(1, (status.currentTime * 1000) / durationMs) : 0;

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (durationMs && status.currentTime * 1000 >= durationMs - 50)) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View style={styles.row}>
      <Pressable hitSlop={8} onPress={toggle}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={26} color={color} />
      </Pressable>
      <View style={styles.body}>
        <View style={[styles.track, { backgroundColor: trackColor }]}>
          <View style={[styles.fill, { backgroundColor: color, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.time, { color }]}>
          {media.voice ? '🎤 ' : ''}
          {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime * 1000 : durationMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 2 },
  body: { flex: 1, gap: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  time: { fontSize: 12, opacity: 0.85 },
});
