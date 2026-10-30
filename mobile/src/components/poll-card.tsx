import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { parseWhatsAppMarkup } from '@/lib/rich-text';
import { useTheme } from '@/lib/store';
import type { Poll } from '@/lib/types';
import { RichText } from './rich-text';
import { Text } from './themed';

type Props = {
  poll: Poll;
  /** Text colour of the bubble the poll sits in. */
  color: string;
  onVote: (optionIds: string[]) => void;
};

/** A poll inside a message bubble. Tapping an option votes, tapping it again takes the vote back. */
export function PollCard({ poll, color, onVote }: Props) {
  const { radius } = useTheme();
  const single = poll.maxSelections === 1;
  const mine = poll.options.filter((o) => o.mine).map((o) => o.id);

  const choose = (id: string) => {
    if (single) onVote(mine.includes(id) ? [] : [id]);
    else if (mine.includes(id)) onVote(mine.filter((x) => x !== id));
    else onVote([...mine, id].slice(-poll.maxSelections));
  };

  return (
    <View style={styles.card}>
      <RichText
        spans={parseWhatsAppMarkup(poll.question)}
        text={poll.question}
        style={[styles.question, { color }]}
        mentionColor={color}
      />
      <Text style={[styles.hint, { color }]}>{single ? 'Select one' : 'Select one or more'}</Text>
      {poll.options.map((o) => {
        const share = poll.totalVoters ? o.voters.length / poll.totalVoters : 0;
        const icon = single
          ? o.mine ? 'radio-button-on' : 'radio-button-off'
          : o.mine ? 'checkbox' : 'square-outline';
        return (
          <Pressable
            key={o.id}
            onPress={() => choose(o.id)}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityState={{ checked: o.mine }}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}>
            <View style={styles.optionLine}>
              <Ionicons name={icon} size={20} color={color} />
              <Text style={[styles.optionText, { color }]}>{o.text}</Text>
              <Text style={[styles.count, { color }]}>{o.voters.length}</Text>
            </View>
            <View style={[styles.track, { borderRadius: 3 * radius }]}>
              <View style={[StyleSheet.absoluteFill, styles.trackBg, { backgroundColor: color }]} />
              <View style={[styles.fill, { backgroundColor: color, width: `${Math.round(share * 100)}%` }]} />
            </View>
            {o.voters.length > 0 && (
              <Text style={[styles.voters, { color }]} numberOfLines={2}>
                {o.voters.join(', ')}
              </Text>
            )}
          </Pressable>
        );
      })}
      <Text style={[styles.hint, styles.total, { color }]}>
        {poll.totalVoters === 1 ? '1 vote' : `${poll.totalVoters} votes`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minWidth: 230, paddingVertical: 2 },
  question: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  hint: { fontSize: 12, opacity: 0.7, marginTop: 2, marginBottom: 6 },
  option: { paddingVertical: 6 },
  optionLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionText: { flex: 1, fontSize: 15 },
  count: { fontSize: 13, fontWeight: '600', minWidth: 16, textAlign: 'right' },
  // The bar is the bubble's text colour: faint for the track, solid for the share of votes.
  track: { height: 5, marginTop: 6, marginLeft: 28, overflow: 'hidden' },
  trackBg: { opacity: 0.2 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  voters: { fontSize: 12, opacity: 0.7, marginTop: 4, marginLeft: 28 },
  total: { marginTop: 4, marginBottom: 0 },
});
