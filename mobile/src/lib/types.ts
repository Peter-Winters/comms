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
  /** A bridged chat whose name and messages haven't arrived yet; kept out of the inbox. */
  incomplete?: boolean;
  /** Names of people typing right now. */
  typing?: string[];
};

/** `senders` are display names, with "You" first if you reacted. */
export type Reaction = { key: string; count: number; mine: boolean; senders: string[] };

export type MessageKind =
  | 'text'
  | 'notice'
  | 'emote'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'system'
  | 'poll'
  | 'deleted'
  /** A photo or video the bridge couldn't fetch (e.g. no longer on the phone). */
  | 'unavailable'
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
  /** A looping, silent clip that plays by itself (GIFs are sent as short videos). */
  gif?: boolean;
  /** A contact card (.vcf). */
  contact?: boolean;
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

/** A run of text with one set of formatting. `mention` runs read "@Name". */
export type RichSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  quote?: boolean;
  href?: string;
  mention?: boolean;
};

export type LinkPreview = { url: string; title?: string; description?: string; image?: ImageRef; site: string };

/** Someone who can be @mentioned. */
export type Member = { userId: string; name: string; avatar?: ImageRef };

export type SharedPost = { url: string; label: 'Reel' | 'Post' | 'Story' };

export type PollOption = {
  id: string;
  text: string;
  /** Display names of everyone who picked this option ("You" first). */
  voters: string[];
  mine: boolean;
};

export type Poll = {
  question: string;
  options: PollOption[];
  /** How many options one person may pick. */
  maxSelections: number;
  /** People who have voted at all. */
  totalVoters: number;
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
  /** A shared Instagram/Facebook reel, post or story; the image or video is its preview. */
  share?: SharedPost;
  /** "@Name" tokens in `text` that mention someone, for highlighting. */
  mentions?: string[];
  /** Set when kind is 'poll'. */
  poll?: Poll;
  /** Formatted text (bold, lists, links…), when the message has any formatting. */
  rich?: RichSpan[];
  linkPreview?: LinkPreview;
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

/** A newly connected network whose chats are still arriving. */
export type NetworkImport = { network: NetworkId; found: number };

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
