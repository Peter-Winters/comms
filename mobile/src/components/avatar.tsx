import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colorFor, initials } from '@/lib/format';
import { useTheme } from '@/lib/store';
import type { ImageRef, NetworkId } from '@/lib/types';
import { NetworkIcon } from './network-icon';
import { Text } from './themed';

type Props = {
  title: string;
  image?: ImageRef;
  network?: NetworkId;
  size?: number;
  isGroup?: boolean;
};

export function Avatar({ title, image, network, size = 52, isGroup }: Props) {
  const { colors, colorful, radius, avatars } = useTheme();
  // Themes without pictures show at most a small symbol for the chat's network.
  if (!avatars) return network ? <NetworkIcon network={network} size={Math.round(size * 0.34)} plain /> : null;
  const badge = Math.round(size * 0.38);
  // Square themes still keep a hint of a corner so avatars don't look like broken images.
  const corner = radius === 0 ? 2 : (isGroup ? size * 0.32 : size / 2) * Math.max(radius, 0.6);
  return (
    <View style={{ width: size, height: size }}>
      {image ? (
        <Image
          source={{ uri: image.uri, headers: image.headers }}
          style={{ width: size, height: size, borderRadius: radius === 0 ? 2 : size / 2, backgroundColor: colors.surfaceAlt }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={image.uri}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: corner,
              backgroundColor: colorful ? colorFor(title) : colors.surfaceAlt,
            },
          ]}>
          <Text style={[styles.initials, { fontSize: size * 0.36, color: colorful ? '#fff' : colors.text }]}>
            {initials(title)}
          </Text>
        </View>
      )}
      {network && (
        <View style={[styles.badge, { right: -2, bottom: -2 }]}>
          <NetworkIcon network={network} size={badge} borderColor={colors.bg} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '600' },
  badge: { position: 'absolute' },
});
