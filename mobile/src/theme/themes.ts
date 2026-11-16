import { dark, light, type Palette } from './colors';

export type ThemeStyle = 'classic' | 'minimal' | 'pager';

export type Theme = {
  style: ThemeStyle;
  dark: boolean;
  colors: Palette;
  /** Replaces the system font everywhere. Pixel fonts run small, hence the size multiplier. */
  font?: { family: string; scale: number };
  /** Multiplier for corner radii: 1 is the normal rounded look, 0 is square. */
  radius: number;
  /** Coloured initials avatars and brand-coloured network badges, or monochrome ones. */
  colorful: boolean;
  /** Show profile pictures. Without them, chats show just a small network symbol. */
  avatars: boolean;
  /** Incoming messages: a filled bubble, plain text, or an outlined box. */
  theirBubble: 'filled' | 'plain' | 'outline';
  headingWeight: '800' | '600' | '400';
  uppercaseHeadings: boolean;
};

export const THEME_STYLES: { key: ThemeStyle; label: string; description: string }[] = [
  { key: 'classic', label: 'Classic', description: 'Colourful and rounded' },
  { key: 'minimal', label: 'Minimal', description: 'Just text: no colour, no pictures' },
  { key: 'pager', label: 'Pager', description: 'Pixel text on a green LCD' },
];

const minimalLight: Palette = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceAlt: '#EBEBEB',
  border: '#E6E6E6',
  text: '#0A0A0A',
  textMuted: '#707070',
  textFaint: '#ABABAB',
  accent: '#0A0A0A',
  accentText: '#FFFFFF',
  bubbleMine: '#F0F0F0',
  bubbleMineText: '#0A0A0A',
  bubbleTheirs: '#FFFFFF',
  bubbleTheirsText: '#0A0A0A',
  danger: '#D93036',
  warning: '#8F8F8F',
  success: '#0A0A0A',
  badgeMuted: '#C4C4C4',
  overlay: 'rgba(0,0,0,0.3)',
};

const minimalDark: Palette = {
  bg: '#000000',
  surface: '#111111',
  surfaceAlt: '#1D1D1D',
  border: '#222222',
  text: '#F5F5F5',
  textMuted: '#8C8C8C',
  textFaint: '#4F4F4F',
  accent: '#F5F5F5',
  accentText: '#000000',
  bubbleMine: '#1A1A1A',
  bubbleMineText: '#F5F5F5',
  bubbleTheirs: '#000000',
  bubbleTheirsText: '#F5F5F5',
  danger: '#F2555A',
  warning: '#8C8C8C',
  success: '#F5F5F5',
  badgeMuted: '#4F4F4F',
  overlay: 'rgba(0,0,0,0.6)',
};

/** Unlit LCD: dark pixels on a grey-green screen. */
const pagerLight: Palette = {
  bg: '#B4C29C',
  surface: '#A7B68E',
  surfaceAlt: '#99A981',
  border: '#28301C',
  text: '#1E2515',
  textMuted: '#3C4A2C',
  textFaint: '#5D6D49',
  accent: '#1E2515',
  accentText: '#B4C29C',
  bubbleMine: '#1E2515',
  bubbleMineText: '#B4C29C',
  bubbleTheirs: '#B4C29C',
  bubbleTheirsText: '#1E2515',
  danger: '#6E1E12',
  warning: '#3C4A2C',
  success: '#1E2515',
  badgeMuted: '#5D6D49',
  overlay: 'rgba(30,37,21,0.45)',
};

/** Backlit at night: glowing green pixels on black. */
const pagerDark: Palette = {
  bg: '#070A05',
  surface: '#0F160B',
  surfaceAlt: '#172112',
  border: '#8CF26E',
  text: '#8CF26E',
  textMuted: '#62B34C',
  textFaint: '#3B6B2E',
  accent: '#8CF26E',
  accentText: '#070A05',
  bubbleMine: '#8CF26E',
  bubbleMineText: '#070A05',
  bubbleTheirs: '#070A05',
  bubbleTheirsText: '#8CF26E',
  danger: '#FF6B4A',
  warning: '#62B34C',
  success: '#8CF26E',
  badgeMuted: '#3B6B2E',
  overlay: 'rgba(0,0,0,0.6)',
};

export function makeTheme(style: ThemeStyle, isDark: boolean): Theme {
  switch (style) {
    case 'minimal':
      return {
        style,
        dark: isDark,
        colors: isDark ? minimalDark : minimalLight,
        radius: 0.6,
        colorful: false,
        avatars: false,
        theirBubble: 'plain',
        headingWeight: '600',
        uppercaseHeadings: false,
      };
    case 'pager':
      return {
        style,
        dark: isDark,
        colors: isDark ? pagerDark : pagerLight,
        font: { family: 'VT323_400Regular', scale: 1.25 },
        radius: 0,
        colorful: false,
        avatars: true,
        theirBubble: 'outline',
        headingWeight: '400',
        uppercaseHeadings: true,
      };
    default:
      return {
        style: 'classic',
        dark: isDark,
        colors: isDark ? dark : light,
        radius: 1,
        colorful: true,
        avatars: true,
        theirBubble: 'filled',
        headingWeight: '800',
        uppercaseHeadings: false,
      };
  }
}
