import type { MediaInfo, MessageKind, SharedPost } from './types';

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
export function previewText(kind: MessageKind, text: string, media?: MediaInfo, share?: SharedPost) {
  if (share) return text ? `🎬 ${share.label}: ${text}` : `🎬 ${share.label}`;
  switch (kind) {
    case 'poll':
      return `📊 ${text}`;
    case 'deleted':
      return '🚫 Message deleted';
    case 'unavailable':
      return `⚠️ ${text.split('\n')[0]}`;
    case 'image':
      return text ? `📷 ${text}` : '📷 Photo';
    case 'video':
      if (media?.gif) return '🎞️ GIF';
      return text ? `🎥 ${text}` : '🎥 Video';
    case 'audio':
      return media?.voice ? '🎤 Voice message' : '🎵 Audio';
    case 'file':
      if (media?.contact) return `👤 ${contactName(media.name)}`;
      return `📎 ${media?.name ?? 'File'}`;
    default:
      return text;
  }
}

const SHARE_RE = /^https?:\/\/(?:www\.|m\.)?(?:instagram|facebook)\.com\/(reels?|p|tv|stories|share\/r)\//i;

/** Recognises a link to an Instagram or Facebook reel, post or story. */
export function sharedPostFrom(url: unknown): SharedPost | undefined {
  if (typeof url !== 'string') return undefined;
  const kind = url.match(SHARE_RE)?.[1]?.toLowerCase();
  if (!kind) return undefined;
  const label = kind === 'p' ? 'Post' : kind === 'stories' ? 'Story' : 'Reel';
  // Drop Instagram's tracking parameters.
  return { url: url.split('?')[0], label };
}

/** Removes links (bare or Markdown) from a caption, leaving any words someone actually wrote. */
export function stripLinks(text: string) {
  return text
    .replace(/\[[^\]]*\]\(https?:\/\/[^)]*\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
}

/** "Zack.vcf" → "Zack". */
export function contactName(fileName?: string) {
  return fileName?.replace(/\.vcf$/i, '') || 'Contact';
}

/** "Dan is typing…", "Dan and Priya are typing…", "3 people are typing…". */
export function typingText(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
