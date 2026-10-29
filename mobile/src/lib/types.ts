export type NetworkId =
  | 'whatsapp'
  | 'signal'
  | 'telegram'
  | 'instagram'
  | 'messenger'
  | 'gmessages'
  | 'gvoice'
  | 'discord'
  | 'slack'
  | 'linkedin'
  | 'twitter'
  | 'bluesky'
  | 'imessage'
  | 'matrix';

export type ImageRef = {
  uri: string;
  headers?: Record<string, string>;
  width?: number;
  height?: number;
};

export type MessagePreview = {
  text: string;
  ts: number;
  senderName?: string;
  fromMe: boolean;
};

export type Chat = {
  id: string;
  network: NetworkId;
  title: string;
  avatar?: ImageRef;
  isGroup: boolean;
  memberCount?: number;
  lastMessage?: MessagePreview;
  /** Timestamp used for inbox ordering. */
  lastActivity: number;
  unreadCount: number;
  markedUnread: boolean;
  pinned: boolean;
  muted: boolean;
  lowPriority: boolean;
  /** Archived ("done") chats return to the inbox when new activity arrives after archivedAt. */
  archivedAt?: number;
  /** Management room with a bridge bot rather than a real conversation. */
  isBridgeControl?: boolean;
  encrypted?: boolean;
};

export type Reaction = { key: string; count: number; mine: boolean };

export type MessageKind =
  | 'text'
  | 'notice'
  | 'emote'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'system'
  | 'encrypted';

export type MediaInfo = {
  uri: string;
  headers?: Record<string, string>;
  name?: string;
  mimeType?: string;
  size?: number;
  /** Milliseconds. */
  duration?: number;
  width?: number;
  height?: number;
  voice?: boolean;
  thumbnail?: ImageRef;
};

/** A local file picked or recorded on the device, to be sent. */
export type OutgoingMedia = {
  kind: 'image' | 'video' | 'audio' | 'file';
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  voice?: boolean;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  fromMe: boolean;
  ts: number;
  kind: MessageKind;
  text: string;
  image?: ImageRef;
  /** Set for video, audio and file messages. */
  media?: MediaInfo;
  replyTo?: { id: string; senderName: string; text: string };
  reactions: Reaction[];
  status?: 'sending' | 'sent' | 'read' | 'failed';
  edited?: boolean;
};

export type ChatFlags = Partial<Pick<Chat, 'pinned' | 'muted' | 'lowPriority' | 'markedUnread'>> & {
  archived?: boolean;
};

export type Account = {
  network: NetworkId;
  connected: boolean;
  /** Whether this network can be connected at all (e.g. its bridge is installed on the server). */
  available: boolean;
  /** Free-form identity shown to the user, e.g. a phone number. */
  label?: string;
  /** Chat used to manage this connection (bridge bot DM). */
  controlChatId?: string;
};

export type SearchResult =
  | { type: 'chat'; chat: Chat }
  | { type: 'message'; chat: Chat; message: Message };

export type BackendStatus = 'starting' | 'syncing' | 'ready' | 'offline' | 'error';

export function isArchived(chat: Chat): boolean {
  return chat.archivedAt !== undefined && chat.archivedAt >= chat.lastActivity;
}

/** Pinned first, then most recent activity. */
export function sortChats(chats: Chat[]) {
  return [...chats].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivity - a.lastActivity);
}

export function isUnread(chat: Chat): boolean {
  return chat.unreadCount > 0 || chat.markedUnread;
}
