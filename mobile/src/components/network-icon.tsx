import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { StyleSheet, View } from 'react-native';

import { NETWORKS } from '@/lib/networks';
import { useTheme } from '@/lib/store';
import type { NetworkId } from '@/lib/types';

type Props = { network: NetworkId; size?: number; borderColor?: string; plain?: boolean };

/** Round brand badge for a network, or with `plain` just its symbol in a muted colour. */
export function NetworkIcon({ network, size = 18, borderColor, plain }: Props) {
  const { colors, colorful, radius } = useTheme();
  const info = NETWORKS[network];
  const style = info.iconStyle === 'brand' ? { brand: true } : { solid: true };
  if (plain) {
    return (
      <View style={[styles.badge, { width: size, height: size }]}>
        <FontAwesome6 name={info.icon} size={size * 0.8} color={colors.textFaint} {...style} />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: radius === 0 ? 1 : size / 2,
          backgroundColor: colorful ? info.color : colors.text,
          borderWidth: borderColor ? Math.max(1.5, size / 10) : 0,
          borderColor,
        },
      ]}>
      <FontAwesome6 name={info.icon} size={size * 0.55} color={colorful ? '#fff' : colors.bg} {...style} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
