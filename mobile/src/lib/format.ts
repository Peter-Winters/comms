import type { MediaInfo, MessageKind } from './types';

const DAY = 86_400_000;

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Compact timestamp for the inbox: time today, weekday this week, otherwise a date. */
export function formatInboxTime(ts: number, now = Date.now()) {
  const today = startOfDay(now);
  if (ts >= today) return formatTime(ts);
  if (ts >= today - DAY) return 'Yesterday';
  if (ts >= today - 6 * DAY) return new Date(ts).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatDayHeader(ts: number, now = Date.now()) {
  const today = startOfDay(now);
  if (ts >= today) return 'Today';
  if (ts >= today - DAY) return 'Yesterday';
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function isSameDay(a: number, b: number) {
  return startOfDay(a) === startOfDay(b);
}

export function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '#';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#F97066', '#F79009', '#12B76A', '#2E90FA', '#7A5AF8', '#EE46BC', '#06AED4', '#669F2A'];

export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** One-line summary of a message for the inbox. */
export function previewText(kind: MessageKind, text: string, media?: MediaInfo) {
  switch (kind) {
    case 'image':
      return text ? `📷 ${text}` : '📷 Photo';
    case 'video':
      return text ? `🎥 ${text}` : '🎥 Video';
    case 'audio':
      return media?.voice ? '🎤 Voice message' : '🎵 Audio';
    case 'file':
      return `📎 ${media?.name ?? 'File'}`;
    default:
      return text;
  }
}
