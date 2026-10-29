import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colorFor, initials } from '@/lib/format';
import { useColors } from '@/lib/store';
import type { ImageRef, NetworkId } from '@/lib/types';
import { NetworkIcon } from './network-icon';

type Props = {
  title: string;
  image?: ImageRef;
  network?: NetworkId;
  size?: number;
  isGroup?: boolean;
};

export function Avatar({ title, image, network, size = 52, isGroup }: Props) {
  const colors = useColors();
  const badge = Math.round(size * 0.38);
  return (
    <View style={{ width: size, height: size }}>
      {image ? (
        <Image
          source={{ uri: image.uri, headers: image.headers }}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }}
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
              borderRadius: isGroup ? size * 0.32 : size / 2,
              backgroundColor: colorFor(title),
            },
          ]}>
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(title)}</Text>
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
  initials: { color: '#fff', fontWeight: '600' },
  badge: { position: 'absolute' },
});
