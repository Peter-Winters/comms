import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { StyleSheet, View } from 'react-native';

import { NETWORKS } from '@/lib/networks';
import type { NetworkId } from '@/lib/types';

type Props = { network: NetworkId; size?: number; borderColor?: string };

/** Round brand badge for a network. */
export function NetworkIcon({ network, size = 18, borderColor }: Props) {
  const info = NETWORKS[network];
  const style = info.iconStyle === 'brand' ? { brand: true } : { solid: true };
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: info.color,
          borderWidth: borderColor ? Math.max(1.5, size / 10) : 0,
          borderColor,
        },
      ]}>
      <FontAwesome6 name={info.icon} size={size * 0.55} color="#fff" {...style} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
