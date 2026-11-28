import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/themed';
import { COUNTRIES, defaultCountry, flag, toInternational, type Country } from '@/lib/countries';
import { useTheme } from '@/lib/store';

/**
 * A phone number with a country picker. Reports the number in international format
 * (+353891234567), which is what the bridges expect.
 */
export function PhoneInput({ onChange }: { onChange: (international: string) => void }) {
  const theme = useTheme();
  const { colors } = theme;
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [number, setNumber] = useState('');
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const update = (c: Country, n: string) => {
    setCountry(c);
    setNumber(n);
    onChange(toInternational(c, n));
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.iso.toLowerCase() === q);
  }, [query]);

  const radius = { borderRadius: 10 * theme.radius };
  const typedOwnCode = number.trim().startsWith('+') || number.trim().startsWith('00');

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => setPicking(true)}
        accessibilityLabel={`Country code, ${country.name} +${country.dial}`}
        style={[styles.country, radius, { backgroundColor: colors.surface, opacity: typedOwnCode ? 0.4 : 1 }]}>
        {theme.colorful && <Text style={styles.flag}>{flag(country.iso)}</Text>}
        <Text style={{ color: colors.text, fontSize: 16 }}>+{country.dial}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>
      <TextInput
        value={number}
        onChangeText={(n) => update(country, n)}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder={country.iso === 'IE' ? '089 123 4567' : 'Phone number'}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, radius, { backgroundColor: colors.surface, color: colors.text }]}
      />

      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={styles.header}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search countries or codes"
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              style={[styles.input, radius, { backgroundColor: colors.surface, color: colors.text }]}
            />
            <Pressable hitSlop={10} onPress={() => setPicking(false)}>
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
          <FlatList
            data={list}
            keyExtractor={(c) => c.iso}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  update(item, number);
                  setPicking(false);
                  setQuery('');
                }}
                style={({ pressed }) => [
                  styles.item,
                  { borderBottomColor: colors.border, backgroundColor: pressed ? colors.surface : 'transparent' },
                ]}>
                {theme.colorful && <Text style={styles.flag}>{flag(item.iso)}</Text>}
                <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>+{item.dial}</Text>
                {item.iso === country.iso && <Ionicons name="checkmark" size={18} color={colors.accent} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  flag: { fontSize: 20 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
