export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  bubbleMine: string;
  bubbleMineText: string;
  bubbleTheirs: string;
  bubbleTheirsText: string;
  danger: string;
  warning: string;
  success: string;
  badgeMuted: string;
  overlay: string;
};

export const light: Palette = {
  bg: '#FFFFFF',
  surface: '#F4F4F7',
  surfaceAlt: '#EBEBF0',
  border: '#E3E3E8',
  text: '#111114',
  textMuted: '#6B6B76',
  textFaint: '#A0A0AA',
  accent: '#6C5CE7',
  accentText: '#FFFFFF',
  bubbleMine: '#6C5CE7',
  bubbleMineText: '#FFFFFF',
  bubbleTheirs: '#F0F0F4',
  bubbleTheirsText: '#111114',
  danger: '#E5484D',
  warning: '#F5A524',
  success: '#30A46C',
  badgeMuted: '#B4B4BE',
  overlay: 'rgba(0,0,0,0.35)',
};

export const dark: Palette = {
  bg: '#0E0E11',
  surface: '#1A1A1F',
  surfaceAlt: '#24242B',
  border: '#2A2A31',
  text: '#F2F2F5',
  textMuted: '#9A9AA5',
  textFaint: '#5F5F6A',
  accent: '#8B7CF6',
  accentText: '#FFFFFF',
  bubbleMine: '#7B6CF0',
  bubbleMineText: '#FFFFFF',
  bubbleTheirs: '#212128',
  bubbleTheirsText: '#F2F2F5',
  danger: '#F2555A',
  warning: '#F5A524',
  success: '#3DD68C',
  badgeMuted: '#4A4A54',
  overlay: 'rgba(0,0,0,0.55)',
};
