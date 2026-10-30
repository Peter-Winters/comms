import { createContext, forwardRef, useContext } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from '@/lib/store';
import type { Theme } from '@/theme/themes';

const InsideText = createContext(false);

/** Applies the theme's font, scaling sizes for fonts that run small. */
function fontStyle(theme: Theme, style: TextProps['style']): TextStyle | undefined {
  if (!theme.font) return undefined;
  const flat = StyleSheet.flatten(style) ?? {};
  const scale = theme.font.scale;
  return {
    fontFamily: theme.font.family,
    // Single-weight pixel font: faux bold and italics look broken, so drop them.
    fontWeight: 'normal',
    fontStyle: 'normal',
    fontSize: (flat.fontSize ?? 14) * scale,
    ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scale } : null),
  };
}

/** Drop-in for React Native's Text that follows the theme's font. */
export function Text(props: TextProps) {
  const theme = useTheme();
  const nested = useContext(InsideText);
  // Nested text inherits the font and size from its parent.
  if (nested || !theme.font) return <RNText {...props} />;
  return (
    <InsideText.Provider value>
      <RNText {...props} style={[props.style, fontStyle(theme, props.style)]} />
    </InsideText.Provider>
  );
}

/** Refs to the themed input are plain React Native TextInput instances. */
export type TextInputRef = RNTextInput;

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const theme = useTheme();
  return <RNTextInput ref={ref} {...props} style={[props.style, fontStyle(theme, props.style)]} />;
});
