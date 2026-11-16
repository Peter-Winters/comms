import { Linking, Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import type { RichSpan } from '@/lib/types';
import { Text } from './themed';

const URL_SOURCE = String.raw`https?:\/\/[^\s]+`;
const URL_RE = new RegExp(`(${URL_SOURCE})`, 'g');
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Props = {
  /** Formatted runs; when absent, `text` is shown with links and `mentions` picked out. */
  spans?: RichSpan[];
  text: string;
  mentions?: string[];
  style: StyleProp<TextStyle>;
  /** Colour for @mentions. */
  mentionColor: string;
  selectable?: boolean;
  numberOfLines?: number;
};

/** Message text with formatting, tappable links and highlighted @mentions. */
export function RichText({ spans, text, mentions, style, mentionColor, selectable, numberOfLines }: Props) {
  const link = (url: string, label: string, key: string | number) => (
    <Text key={key} style={styles.link} onPress={() => Linking.openURL(url).catch(() => {})}>
      {label}
    </Text>
  );
  const mention = (label: string, key: string | number) => (
    <Text key={key} style={[styles.mention, { color: mentionColor }]}>
      {label}
    </Text>
  );

  let children: React.ReactNode;
  if (spans) {
    children = spans.map((s, i) => {
      if (s.mention) return mention(s.text, i);
      if (s.href) return link(s.href, s.text, i);
      const format: TextStyle[] = [];
      if (s.bold) format.push(styles.bold);
      if (s.italic || s.quote) format.push(styles.italic);
      if (s.strike) format.push(styles.strike);
      if (s.code) format.push(styles.code);
      const parts = s.text.split(URL_RE).map((part, j) => (j % 2 ? link(part, part, `${i}-${j}`) : part));
      return format.length ? (
        <Text key={i} style={format}>
          {s.quote ? '▎ ' : null}
          {parts}
        </Text>
      ) : (
        parts
      );
    });
  } else {
    const tokens = [...new Set(mentions ?? [])].sort((a, b) => b.length - a.length).map(escapeRegExp);
    const re = tokens.length ? new RegExp(`(${[...tokens, URL_SOURCE].join('|')})`, 'g') : URL_RE;
    children = text
      .split(re)
      .map((part, i) => (i % 2 === 0 ? part : mentions?.includes(part) ? mention(part, i) : link(part, part, i)));
  }

  return (
    <Text style={style} selectable={selectable} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
  mention: { fontWeight: '700' },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: { fontFamily: MONO, fontSize: 14 },
});
