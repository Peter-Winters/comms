import type { BridgeManager } from '../bridges';
import type {
  Account,
  BackendStatus,
  Chat,
  ChatFlags,
  Member,
  Message,
  NetworkId,
  NetworkImport,
  OutgoingMedia,
  SearchResult,
} from '../types';

export type BackendSnapshot = {
  status: BackendStatus;
  statusDetail?: string;
  userId: string;
  displayName: string;
  chats: Chat[];
  accounts: Account[];
  /** Networks whose chats are still being imported. Their chats stay out of the inbox until done. */
  importing: NetworkImport[];
};

/** How long a network's import must be quiet (no new chats or messages) before it's shown as done. */
export const IMPORT_QUIET_MS = 12_000;
/** Imports are shown as done after this long regardless, so a busy account doesn't hide forever. */
export const IMPORT_MAX_MS = 5 * 60_000;
/** A login that produces no chats at all (an empty account) stops waiting after this long. */
export const IMPORT_EMPTY_MS = 90_000;

/**
 * A source of chats. The UI only talks to this interface, so the demo backend and the
 * Matrix (bridged) backend are interchangeable — and other transports can be added later.
 */
export interface Backend {
  readonly kind: 'demo' | 'matrix';
  start(): Promise<void>;
  stop(): void;
  /** Clears server-side session where applicable. */
  logout(): Promise<void>;

  subscribe(listener: () => void): () => void;
  getSnapshot(): BackendSnapshot;
  getMessages(chatId: string): Message[];
  hasMoreHistory(chatId: string): boolean;
  loadOlder(chatId: string): Promise<void>;

  sendText(chatId: string, text: string, replyToId?: string, mentions?: Member[]): Promise<void>;
  /** Replaces the text of one of your messages. */
  editMessage(chatId: string, messageId: string, text: string): Promise<void>;
  /** Deletes one of your messages for everyone. */
  deleteMessage(chatId: string, messageId: string): Promise<void>;
  setTyping(chatId: string, typing: boolean): Promise<void>;
  /** People in the chat other than you and bridge bots. */
  getMembers(chatId: string): Promise<Member[]>;
  sendMedia(chatId: string, media: OutgoingMedia): Promise<void>;
  react(chatId: string, messageId: string, key: string): Promise<void>;
  /** Replaces your vote on a poll; an empty list withdraws it. */
  votePoll(chatId: string, messageId: string, optionIds: string[]): Promise<void>;
  markRead(chatId: string): Promise<void>;
  setFlags(chatId: string, flags: ChatFlags): Promise<void>;
  search(query: string): Promise<SearchResult[]>;

  /** Starts (or resumes) connecting a network. Resolves to the chat that drives the login flow. */
  connectNetwork(network: NetworkId): Promise<string | undefined>;
  /** Disconnects a network, or resolves to the chat where the user can manage the connection. */
  disconnectNetwork(network: NetworkId): Promise<string | undefined>;
  /** A login just finished: treat the network's incoming chats as an import (unless it already has chats). */
  beginImport(network: NetworkId): void;

  readonly bridges: BridgeManager;

  /** Registers this device for push notifications, or unregisters it when token is null. */
  setPushToken(token: string | null): Promise<void>;
}

/** Shared change-notification plumbing for backends. */
export abstract class BaseBackend {
  private listeners = new Set<() => void>();
  private pending = false;

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Coalesces bursts of changes into one notification per tick. */
  protected emit() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.listeners.forEach((l) => l());
    });
  }
}
