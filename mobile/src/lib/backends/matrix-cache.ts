import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Persists the Matrix client's room state between launches, so the inbox appears instantly
// and the next sync only fetches what changed.

const MAX_EVENTS_PER_ROOM = 80;
const VERSION = 1;

/** Plain-JSON form of a room; mirrors the Room type in matrix.ts. */
export type CachedRoom = {
  id: string;
  state: [string, [string, unknown][]][];
  events: any[];
  reactions: [string, [string, [string, string][]][]][];
  edits: [string, { text: string; ts: number }][];
  prevBatch?: string;
  hasMore: boolean;
  /** Older events were dropped when caching; pagination must restart from the oldest kept one. */
  trimmed: boolean;
  heroes: string[];
  joinedCount: number;
  notificationCount: number;
  tags: Record<string, unknown>;
  markedUnread: boolean;
  archivedAt?: number;
  othersReadTs: number;
  createdTs: number;
};

export type CacheData = {
  version: number;
  userId: string;
  since: string;
  direct: string[];
  mutedRooms: string[];
  rooms: CachedRoom[];
};

function file(userId: string) {
  // One file per account; the user ID is hashed only to make a safe file name.
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return new File(Paths.document, `matrix-cache-${(h >>> 0).toString(16)}.json`);
}

const supported = Platform.OS !== 'web';

export async function loadCache(userId: string): Promise<CacheData | null> {
  if (!supported) return null;
  try {
    const f = file(userId);
    if (!f.exists) return null;
    const data = JSON.parse(await f.text()) as CacheData;
    return data.version === VERSION && data.userId === userId ? data : null;
  } catch {
    return null;
  }
}

export function saveCache(data: Omit<CacheData, 'version'>) {
  if (!supported) return;
  try {
    const f = file(data.userId);
    if (!f.exists) f.create();
    f.write(JSON.stringify({ ...data, version: VERSION }));
  } catch {}
}

export function clearCache(userId: string) {
  if (!supported) return;
  try {
    const f = file(userId);
    if (f.exists) f.delete();
  } catch {}
}

export function trimEvents<T>(events: T[]): { events: T[]; trimmed: boolean } {
  return events.length > MAX_EVENTS_PER_ROOM
    ? { events: events.slice(-MAX_EVENTS_PER_ROOM), trimmed: true }
    : { events, trimmed: false };
}
