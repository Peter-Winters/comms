import { useVideoPlayer, VideoView } from 'expo-video';
import type { StyleProp, ViewStyle } from 'react-native';

import type { MediaInfo } from '@/lib/types';

/** A GIF (sent as a short silent video) that plays on a loop in the chat, like it does in WhatsApp. */
export function GifPlayer({ media, style }: { media: MediaInfo; style: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer({ uri: media.uri, headers: media.headers }, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={style} nativeControls={false} contentFit="cover" />;
}
