import { AppState, type NativeEventSubscription } from 'react-native';

import {
  CONNECTABLE_NETWORKS,
  NETWORKS,
  networkFromBotUserId,
  networkFromProtocol,
  networkFromUserId,
} from '../networks';
import type {
  Account,
  Chat,
  ChatFlags,
  ImageRef,
  MediaInfo,
  Message,
  MessageKind,
  LinkPreview,
  Member,
  NetworkId,
  OutgoingMedia,
  Poll,
  RichSpan,
  SearchResult,
} from '../types';
import { previewText, sharedPostFrom, stripLinks } from '../format';
import { hasFormatting, parseHtml, plainText } from '../rich-text';
import { BaseBackend, type Backend, type BackendSnapshot } from './backend';
import { ImportTracker } from './imports';
import { MatrixBridges, type CommsServerConfig } from './matrix-bridges';
import { clearCache, loadCache, saveCache, trimEvents, type CachedRoom } from './matrix-cache';

const PUSH_APP_ID = 'com.pfwin.comms';
const MSGTYPES = { image: 'm.image', video: 'm.video', audio: 'm.audio', file: 'm.file' } as const;

export type MatrixSession = {
  homeserver: string;
  userId: string;
  accessToken: string;
  deviceId: string;
};

type MxEvent = {
  type: string;
  event_id: string;
  sender: string;
  origin_server_ts: number;
  content: any;
  state_key?: string;
  redacts?: string;
  unsigned?: { transaction_id?: string; redacted_because?: unknown };
};

type BaseMessage = Omit<Message, 'reactions' | 'replyTo' | 'edited'> & { replyToId?: string };

type Room = {
  id: string;
  state: Map<string, Map<string, any>>;
  events: BaseMessage[];
  eventIds: Set<string>;
  /** target event -> reaction key -> sender -> reaction event id */
  reactions: Map<string, Map<string, Map<string, string>>>;
  /** reaction event id -> [target, key, sender], for redactions */
  reactionIndex: Map<string, [string, string, string]>;
  /** Edits by id of the edited message. `unavailable`: the bridge replaced it with a "failed to bridge" notice. */
  edits: Map<string, { text: string; ts: number; mentions?: string[]; rich?: RichSpan[]; unavailable?: boolean }>;
  /** poll event -> voter -> their latest vote */
  pollVotes: Map<string, Map<string, { answers: string[]; ts: number }>>;
  pending: BaseMessage[];
  prevBatch?: string;
  hasMore: boolean;
  /** Restored from cache with older events dropped; pagination restarts via /context. */
  trimmed: boolean;
  heroes: string[];
  joinedCount: number;
  notificationCount: number;
  tags: Record<string, unknown>;
  markedUnread: boolean;
  archivedAt?: number;
  othersReadTs: number;
  /** People typing right now (not cached). */
  typing: string[];
  createdTs: number;
  built?: Message[];
};

const NO_MESSAGES: Message[] = [];
const ARCHIVE_TYPE = 'com.comms.archive';
const BRIDGE_TYPES = ['m.bridge', 'uk.half-shot.bridge'];
const POLL_START_TYPES = ['org.matrix.msc3381.poll.start', 'm.poll.start'];
const POLL_RESPONSE_TYPES = ['org.matrix.msc3381.poll.response', 'm.poll.response'];
const POLL_RESPONSE = 'org.matrix.msc3381.poll.response';
const SYNC_FILTER = JSON.stringify({
  room: {
    timeline: { limit: 30 },
    state: { lazy_load_members: true },
    ephemeral: { types: ['m.receipt', 'm.typing'] },
  },
  presence: { types: [] },
});

export class MatrixError extends Error {
  constructor(
    public status: number,
    public errcode: string,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeHomeserver(input: string) {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export async function matrixLogin(homeserver: string, username: string, password: string): Promise<MatrixSession> {
  const hs = normalizeHomeserver(homeserver);
  const res = await fetch(`${hs}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: username.trim() },
      password,
      initial_device_display_name: 'Comms',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MatrixError(res.status, body.errcode ?? 'M_UNKNOWN', body.error ?? `HTTP ${res.status}`);
  return {
    homeserver: hs,
    userId: body.user_id,
    accessToken: body.access_token,
    deviceId: body.device_id,
  };
}

/** Older bridge configs tag every contact's name with the network, e.g. "Brie (WA)". The app shows a badge instead. */
/** HTML for a message with mentions, so bridges turn "@Name" into a real mention. */
function mentionContent(text: string, mentions?: Member[]) {
  const used = (mentions ?? []).filter((m) => text.includes(`@${m.name}`));
  if (!used.length) return {};
  let html = escapeHtml(text);
  for (const m of used) {
    const link = `<a href="https://matrix.to/#/${encodeURIComponent(m.userId)}">${escapeHtml(m.name)}</a>`;
    html = html.replace(escapeHtml(`@${m.name}`), link);
  }
  return {
    format: 'org.matrix.custom.html',
    formatted_body: html.replace(/\n/g, '<br>'),
    'm.mentions': { user_ids: used.map((m) => m.userId) },
  };
}

/** Reads a poll from MSC3381 (unstable) or Matrix 1.7 (stable) content. */
function pollFrom(content: any): Poll | undefined {
  const unstable = content?.['org.matrix.msc3381.poll.start'];
  const stable = content?.['m.poll'];
  const textOf = (t: any): string =>
    typeof t === 'string' ? t : (t?.['org.matrix.msc1767.text'] ?? t?.['m.text']?.[0]?.body ?? t?.body ?? '');
  if (unstable?.answers) {
    return {
      question: textOf(unstable.question),
      options: unstable.answers.map((a: any) => ({ id: String(a.id), text: textOf(a), voters: [], mine: false })),
      maxSelections: Math.max(1, Number(unstable.max_selections) || 1),
      totalVoters: 0,
    };
  }
  if (stable?.answers) {
    return {
      question: textOf(stable.question),
      options: stable.answers.map((a: any) => ({ id: String(a['m.id']), text: textOf(a), voters: [], mine: false })),
      maxSelections: Math.max(1, Number(stable.max_selections) || 1),
      totalVoters: 0,
    };
  }
  return undefined;
}

/**
 * "* Failed to bridge photo…" notices, optionally followed by the sender's caption, as
 * "Photo couldn't be loaded" with the caption on the next line.
 */
function unavailableText(body: string): string | undefined {
  const m = body.match(/^(?:\* )?Failed to bridge ([^\n]*)\n*([\s\S]*)$/);
  if (!m) return undefined;
  const what = /video/i.test(m[1]) ? 'Video' : /photo|image|sticker/i.test(m[1]) ? 'Photo' : 'Media';
  const reason = /no longer available/i.test(m[1]) ? 'is no longer on your phone' : "couldn't be loaded";
  return m[2] ? `${what} ${reason}\n${m[2]}` : `${what} ${reason}`;
}

/** What's left of a message once it's deleted: who sent it and when. */
function deletedMessage(m: BaseMessage): BaseMessage {
  const { id, chatId, senderId, senderName, fromMe, ts, replyToId } = m;
  return { id, chatId, senderId, senderName, fromMe, ts, replyToId, kind: 'deleted', text: '' };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function withoutNetworkSuffix(name: string) {
  return name.replace(/ \((WA|Signal|Telegram|FB Messenger|Instagram|SMS)\)$/, '');
}

export class MatrixBackend extends BaseBackend implements Backend {
  readonly kind = 'matrix' as const;
  private rooms = new Map<string, Room>();
  private direct = new Set<string>();
  private mutedRooms = new Set<string>();
  private availableNetworks = new Set<NetworkId>();
  private displayName: string;
  private since?: string;
  private running = false;
  private abort?: AbortController;
  private snapshot: BackendSnapshot;
  private chatCache = new Map<string, Chat>();
  private dirty = new Set<string>();
  private txn = 0;
  private joining = new Set<string>();
  private config?: CommsServerConfig;
  private pushToken: string | null = null;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private appStateSub?: NativeEventSubscription;
  private configLoaded!: () => void;
  private configReady = new Promise<void>((resolve) => (this.configLoaded = resolve));
  private imports = new ImportTracker(() => this.publish());
  readonly bridges: MatrixBridges;

  constructor(
    private session: MatrixSession,
    private onSessionInvalid: () => void,
  ) {
    super();
    this.bridges = new MatrixBridges({
      homeserver: session.homeserver,
      userId: session.userId,
      accessToken: session.accessToken,
      getConfig: () => this.config,
      configLoaded: () => this.configReady,
      mediaRef: (mxc, size) => this.mediaRef(mxc, size),
    });
    this.displayName = session.userId;
    this.snapshot = {
      status: 'starting',
      userId: session.userId,
      displayName: session.userId,
      chats: [],
      accounts: [],
      importing: [],
    };
  }

  private get domain() {
    return this.session.userId.split(':').slice(1).join(':');
  }

  // ---------------------------------------------------------------- HTTP

  private async api<T = any>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    const qs = query
      ? '?' +
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const res = await fetch(`${this.session.homeserver}/_matrix/client${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.session.accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && json.errcode === 'M_UNKNOWN_TOKEN') this.onSessionInvalid();
      throw new MatrixError(res.status, json.errcode ?? 'M_UNKNOWN', json.error ?? `HTTP ${res.status}`);
    }
    return json as T;
  }

  private get authHeaders() {
    return { Authorization: `Bearer ${this.session.accessToken}` };
  }

  /** Authenticated media URL. With a size, a server-side thumbnail (cropped square, or scaled). */
  private mediaRef(mxc: string | undefined, size?: number, method: 'crop' | 'scale' = 'crop'): ImageRef | undefined {
    const m = mxc?.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!m) return undefined;
    const base = `${this.session.homeserver}/_matrix/client/v1/media`;
    const uri = size
      ? `${base}/thumbnail/${m[1]}/${m[2]}?width=${size}&height=${size}&method=${method}`
      : `${base}/download/${m[1]}/${m[2]}`;
    return { uri, headers: this.authHeaders };
  }

  private enc(s: string) {
    return encodeURIComponent(s);
  }

  private newTxn() {
    return `comms${Date.now()}.${this.txn++}`;
  }

  // ---------------------------------------------------------------- lifecycle

  async start() {
    if (this.running) return;
    this.running = true;
    const cached = await loadCache(this.session.userId);
    if (cached) this.restore(cached);
    this.api('GET', `/v3/profile/${this.enc(this.session.userId)}`)
      .then((p) => {
        if (p.displayname) this.displayName = p.displayname;
        this.publish();
      })
      .catch(() => {});
    this.loadServerConfig();
    // Mobile OSes suspend us in the background; on return, drop the stale long-poll and resync.
    this.appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') this.abort?.abort();
      else this.flushSave();
    });
    this.syncLoop();
  }

  stop() {
    this.running = false;
    this.abort?.abort();
    this.appStateSub?.remove();
    this.imports.stop();
    this.flushSave();
  }

  async logout() {
    await this.setPushToken(null).catch(() => {});
    this.stop();
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    clearCache(this.session.userId);
    await this.api('POST', '/v3/logout', {}).catch(() => {});
  }

  /** The Comms server describes its bridges and push gateway; plain Matrix servers don't. */
  private async loadServerConfig() {
    try {
      const res = await fetch(`${this.session.homeserver}/_comms/config`);
      if (res.ok) {
        this.config = await res.json();
        for (const id of Object.keys(this.config?.bridges ?? {})) this.availableNetworks.add(id as NetworkId);
        this.configLoaded();
        this.publish();
        return;
      }
    } catch {}
    this.configLoaded();
    this.probeBridges();
  }

  /** Bridge bots only have profiles if the bridge is registered on this homeserver. */
  private async probeBridges() {
    await Promise.all(
      CONNECTABLE_NETWORKS.map(async (id) => {
        const bot = NETWORKS[id].botLocalpart;
        if (!bot) return;
        try {
          await this.api('GET', `/v3/profile/${this.enc(`@${bot}:${this.domain}`)}`);
          this.availableNetworks.add(id);
        } catch {}
      }),
    );
    this.publish();
  }

  private async syncLoop() {
    let backoff = 2000;
    while (this.running) {
      this.abort = new AbortController();
      try {
        const res = await this.api(
          'GET',
          '/v3/sync',
          undefined,
          { filter: SYNC_FILTER, since: this.since, timeout: this.since ? 30000 : 0 },
          this.abort.signal,
        );
        this.handleSync(res);
        this.since = res.next_batch;
        backoff = 2000;
        this.publish('ready');
        this.scheduleSave();
      } catch (e: any) {
        if (!this.running) return;
        // Aborted on purpose (app returned to the foreground): resync immediately.
        if (e?.name === 'AbortError') continue;
        if (e instanceof MatrixError && e.status === 401) {
          this.publish('error', 'Your session has expired. Please sign in again.');
          return;
        }
        this.publish(this.since ? 'offline' : 'error', e?.message ?? 'Connection failed');
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30000);
      }
    }
  }

  // ---------------------------------------------------------------- sync processing

  private room(id: string): Room {
    let room = this.rooms.get(id);
    if (!room) {
      room = {
        id,
        state: new Map(),
        events: [],
        eventIds: new Set(),
        reactions: new Map(),
        reactionIndex: new Map(),
        edits: new Map(),
        pollVotes: new Map(),
        pending: [],
        hasMore: true,
        trimmed: false,
        heroes: [],
        joinedCount: 0,
        notificationCount: 0,
        tags: {},
        markedUnread: false,
        othersReadTs: 0,
        typing: [],
        createdTs: 0,
      };
      this.rooms.set(id, room);
    }
    return room;
  }

  private handleSync(res: any) {
    for (const ev of res.account_data?.events ?? []) {
      if (ev.type === 'm.direct') {
        this.direct = new Set(Object.values(ev.content as Record<string, string[]>).flat());
        this.rooms.forEach((_, id) => this.dirty.add(id));
      } else if (ev.type === 'm.push_rules') {
        this.applyPushRules(ev.content);
      }
    }

    for (const [roomId, data] of Object.entries<any>(res.rooms?.join ?? {})) {
      const room = this.room(roomId);
      this.dirty.add(roomId);

      if (data.summary) {
        if (data.summary['m.heroes']) room.heroes = data.summary['m.heroes'];
        if (data.summary['m.joined_member_count'] !== undefined)
          room.joinedCount = data.summary['m.joined_member_count'];
      }
      for (const ev of data.state?.events ?? []) this.applyState(room, ev);

      const timeline = data.timeline ?? {};
      if (timeline.limited && this.since) {
        // There is a gap: drop what we had and restart pagination from here.
        room.events = [];
        room.eventIds.clear();
        room.hasMore = true;
      }
      if (timeline.prev_batch && (room.prevBatch === undefined || timeline.limited)) {
        room.prevBatch = timeline.prev_batch;
      }
      for (const ev of timeline.events ?? []) {
        if (ev.state_key !== undefined) this.applyState(room, ev);
        this.applyTimelineEvent(room, ev, 'append');
      }

      if (data.unread_notifications) room.notificationCount = data.unread_notifications.notification_count ?? 0;

      for (const ev of data.account_data?.events ?? []) {
        if (ev.type === 'm.tag') room.tags = ev.content.tags ?? {};
        else if (ev.type === 'm.marked_unread' || ev.type === 'com.famedly.marked_unread')
          room.markedUnread = !!ev.content.unread;
        else if (ev.type === ARCHIVE_TYPE) room.archivedAt = ev.content.archived_at ?? undefined;
      }

      for (const ev of data.ephemeral?.events ?? []) {
        if (ev.type === 'm.typing') {
          room.typing = (ev.content.user_ids ?? []).filter(
            (u: string) => u !== this.session.userId && !networkFromBotUserId(u),
          );
          continue;
        }
        if (ev.type !== 'm.receipt') continue;
        for (const receipts of Object.values<any>(ev.content)) {
          for (const [userId, info] of Object.entries<any>(receipts['m.read'] ?? {})) {
            if (userId !== this.session.userId && !networkFromBotUserId(userId) && info.ts > room.othersReadTs) {
              room.othersReadTs = info.ts;
              room.built = undefined;
            }
          }
        }
      }
    }

    for (const [roomId, data] of Object.entries<any>(res.rooms?.invite ?? {})) {
      const invite = (data.invite_state?.events ?? []).find(
        (e: any) => e.type === 'm.room.member' && e.state_key === this.session.userId,
      );
      // Bridges invite us to portal rooms; join those automatically like Beeper does.
      if (invite && networkFromUserId(invite.sender) && !this.joining.has(roomId)) {
        this.joining.add(roomId);
        this.api('POST', `/v3/join/${this.enc(roomId)}`, {}).finally(() => this.joining.delete(roomId));
      }
    }

    for (const roomId of Object.keys(res.rooms?.leave ?? {})) {
      this.rooms.delete(roomId);
      this.chatCache.delete(roomId);
    }
  }

  private applyPushRules(content: any) {
    const muted = new Set<string>();
    for (const rule of content?.global?.room ?? []) {
      if (rule.enabled !== false && !(rule.actions ?? []).includes('notify')) muted.add(rule.rule_id);
    }
    for (const rule of content?.global?.override ?? []) {
      const cond = rule.conditions?.find((c: any) => c.kind === 'event_match' && c.key === 'room_id');
      if (cond && rule.enabled !== false && !(rule.actions ?? []).includes('notify')) muted.add(cond.pattern);
    }
    for (const id of new Set([...muted, ...this.mutedRooms])) this.dirty.add(id);
    this.mutedRooms = muted;
  }

  private applyState(room: Room, ev: MxEvent) {
    let byKey = room.state.get(ev.type);
    if (!byKey) room.state.set(ev.type, (byKey = new Map()));
    byKey.set(ev.state_key ?? '', ev.content);
    if (ev.type === 'm.room.member') room.built = undefined;
    if (ev.type === 'm.room.create' && ev.origin_server_ts) room.createdTs = ev.origin_server_ts;
  }

  private stateContent(room: Room, type: string, key = '') {
    return room.state.get(type)?.get(key);
  }

  /**
   * Reads formatting from the HTML body. Bridges put mentions there as matrix.to links while the
   * plain body just has the name (often with a " (WA)" suffix), so mentions come out as "@Name".
   */
  private formatted(room: Room, content: any, body: string): Pick<BaseMessage, 'text' | 'mentions' | 'rich'> {
    const html: unknown = content?.format === 'org.matrix.custom.html' ? content.formatted_body : undefined;
    if (typeof html !== 'string') return { text: body };
    const spans = parseHtml(html, (userId, linkText) =>
      withoutNetworkSuffix(linkText.replace(/^@/, '')) || this.memberName(room, userId),
    );
    if (!spans.length) return { text: body };
    const mentions = spans.filter((s) => s.mention).map((s) => s.text);
    return {
      text: plainText(spans),
      mentions: mentions.length ? mentions : undefined,
      rich: hasFormatting(spans) ? spans : undefined,
    };
  }

  private memberName(room: Room, userId: string) {
    const name = this.stateContent(room, 'm.room.member', userId)?.displayname;
    return name ? withoutNetworkSuffix(name) : userId.replace(/^@/, '').split(':')[0];
  }

  private applyTimelineEvent(room: Room, ev: MxEvent, mode: 'append' | 'prepend') {
    room.built = undefined;
    const rel = ev.content?.['m.relates_to'];

    if (POLL_RESPONSE_TYPES.includes(ev.type) && rel?.event_id) {
      const answers: unknown = ev.content[POLL_RESPONSE]?.answers ?? ev.content['m.selections'];
      let byVoter = room.pollVotes.get(rel.event_id);
      if (!byVoter) room.pollVotes.set(rel.event_id, (byVoter = new Map()));
      const prev = byVoter.get(ev.sender);
      if (Array.isArray(answers) && (!prev || prev.ts <= ev.origin_server_ts)) {
        byVoter.set(ev.sender, { answers: answers.filter((a) => typeof a === 'string'), ts: ev.origin_server_ts });
      }
      return;
    }

    if (ev.type === 'm.reaction' && rel?.rel_type === 'm.annotation') {
      let byKey = room.reactions.get(rel.event_id);
      if (!byKey) room.reactions.set(rel.event_id, (byKey = new Map()));
      let bySender = byKey.get(rel.key);
      if (!bySender) byKey.set(rel.key, (bySender = new Map()));
      bySender.set(ev.sender, ev.event_id);
      room.reactionIndex.set(ev.event_id, [rel.event_id, rel.key, ev.sender]);
      return;
    }

    if (ev.type === 'm.room.redaction') {
      const target = ev.redacts ?? ev.content?.redacts;
      const reaction = room.reactionIndex.get(target);
      if (reaction) {
        room.reactions.get(reaction[0])?.get(reaction[1])?.delete(reaction[2]);
        room.reactionIndex.delete(target);
      } else {
        room.events = room.events.map((m) => (m.id === target ? deletedMessage(m) : m));
        room.edits.delete(target);
      }
      return;
    }

    if (rel?.rel_type === 'm.replace' && ev.content['m.new_content']) {
      const prev = room.edits.get(rel.event_id);
      if (!prev || prev.ts <= ev.origin_server_ts) {
        const content = ev.content['m.new_content'];
        // Bridges post a placeholder for media, then edit it into a notice if the download fails.
        const failed = content.msgtype === 'm.notice' ? unavailableText(content.body ?? '') : undefined;
        room.edits.set(
          rel.event_id,
          failed
            ? { text: failed, unavailable: true, ts: ev.origin_server_ts }
            : { ...this.formatted(room, content, content.body ?? ''), ts: ev.origin_server_ts },
        );
      }
      return;
    }

    const msg = this.toMessage(room, ev);
    if (!msg || room.eventIds.has(msg.id)) return;
    room.eventIds.add(msg.id);
    if (mode === 'append') {
      room.events.push(msg);
      const txn = ev.unsigned?.transaction_id;
      if (txn) room.pending = room.pending.filter((p) => p.id !== txn);
    } else {
      room.events.unshift(msg);
    }
  }

  private toMessage(room: Room, ev: MxEvent): BaseMessage | undefined {
    const fromMe = ev.sender === this.session.userId;
    const base = {
      id: ev.event_id,
      chatId: room.id,
      senderId: ev.sender,
      senderName: fromMe ? 'You' : this.memberName(room, ev.sender),
      fromMe,
      ts: ev.origin_server_ts,
    };
    if (ev.unsigned?.redacted_because) {
      const visible = ev.type === 'm.room.message' || ev.type === 'm.sticker' || POLL_START_TYPES.includes(ev.type);
      return visible ? deletedMessage({ ...base, kind: 'text', text: '' }) : undefined;
    }

    if (ev.type === 'm.room.encrypted') {
      return { ...base, kind: 'encrypted', text: 'Encrypted message — this client cannot decrypt it yet' };
    }
    if (ev.type === 'm.sticker') {
      return { ...base, kind: 'image', text: ev.content.body ?? 'Sticker', image: this.imageFrom(ev.content) };
    }
    // WhatsApp sends polls as text messages with the poll attached; other bridges send poll events.
    const poll = pollFrom(ev.content);
    if (poll && (ev.type === 'm.room.message' || POLL_START_TYPES.includes(ev.type))) {
      return { ...base, kind: 'poll', text: poll.question, poll };
    }
    if (ev.type !== 'm.room.message' || !ev.content?.msgtype) return undefined;

    const c = ev.content;
    const replyToId: string | undefined = c['m.relates_to']?.['m.in_reply_to']?.event_id;
    let text: string = c.body ?? '';
    if (replyToId) text = stripReplyFallback(text);

    // "* Failed to bridge photo…", sometimes followed by the photo's caption.
    const failed = c.msgtype === 'm.notice' ? unavailableText(text) : undefined;
    if (failed) {
      return { ...base, kind: 'unavailable', text: failed, replyToId };
    }

    let kind: MessageKind = 'text';
    let image: ImageRef | undefined;
    let media: MediaInfo | undefined;
    let formatting: Pick<BaseMessage, 'text' | 'mentions' | 'rich'> = { text };
    switch (c.msgtype) {
      case 'm.text':
        formatting = this.formatted(room, c, text);
        break;
      case 'm.notice':
        kind = 'notice';
        formatting = this.formatted(room, c, text);
        break;
      case 'm.emote':
        kind = 'emote';
        formatting = this.formatted(room, c, text);
        break;
      case 'm.image':
        kind = 'image';
        image = this.imageFrom(c);
        media = this.mediaFrom(c);
        break;
      case 'm.video':
        kind = 'video';
        media = this.mediaFrom(c);
        break;
      case 'm.audio':
        kind = 'audio';
        media = this.mediaFrom(c);
        break;
      case 'm.file':
        kind = 'file';
        media = this.mediaFrom(c);
        break;
    }
    // Instagram shares arrive as the reel's thumbnail (or video) with a link to the original.
    const share = media ? sharedPostFrom(c.external_url) : undefined;
    if (share) formatting = { text: stripLinks(text) };
    // Media captions: body is the file name unless a separate filename is given.
    else if (media && !(c.filename && c.filename !== c.body)) formatting = { text: '' };
    return {
      ...base,
      ...formatting,
      kind,
      image,
      media,
      share,
      linkPreview: this.linkPreviewFrom(c),
      replyToId,
      status: fromMe ? 'sent' : undefined,
    };
  }

  /** Beeper-style link previews the bridges attach (title, description, image). */
  private linkPreviewFrom(content: any): LinkPreview | undefined {
    const p = (content['com.beeper.linkpreviews'] ?? []).find((x: any) => x?.matched_url);
    if (!p || !(p['og:title'] || p['og:description'])) return undefined;
    const url: string = p['og:url'] ?? p.matched_url;
    let site = url;
    try {
      site = new URL(url).hostname.replace(/^www\./, '');
    } catch {}
    return {
      url: p.matched_url,
      title: p['og:title'],
      description: p['og:description'],
      image: typeof p['og:image'] === 'string' ? this.mediaRef(p['og:image'], 600, 'scale') : undefined,
      site,
    };
  }

  /** Bubble-sized image: a scaled server thumbnail rather than the full original. */
  private imageFrom(content: any): ImageRef | undefined {
    const ref = this.mediaRef(content.url ?? content.info?.thumbnail_url, 800, 'scale');
    if (!ref) return undefined;
    return { ...ref, width: content.info?.w, height: content.info?.h };
  }

  private mediaFrom(content: any): MediaInfo | undefined {
    const ref = this.mediaRef(content.url);
    if (!ref) return undefined;
    const info = content.info ?? {};
    return {
      ...ref,
      name: content.filename ?? content.body,
      mimeType: info.mimetype,
      size: info.size,
      duration: info.duration ?? content['org.matrix.msc1767.audio']?.duration,
      width: info.w,
      height: info.h,
      voice: !!content['org.matrix.msc3245.voice'],
      gif: !!(info['fi.mau.gif'] || info['fi.mau.autoplay']),
      contact: /^text\/(x-)?vcard/i.test(info.mimetype ?? '') || /\.vcf$/i.test(content.filename ?? content.body ?? ''),
      thumbnail: this.mediaRef(info.thumbnail_url, 800, 'scale'),
    };
  }

  // ---------------------------------------------------------------- derived views

  private bridgeInfo(room: Room) {
    for (const type of BRIDGE_TYPES) {
      const byKey = room.state.get(type);
      if (byKey?.size) return byKey.values().next().value;
    }
    return undefined;
  }

  private classify(room: Room): { network: NetworkId; control?: NetworkId; dm: boolean } {
    const info = this.bridgeInfo(room);
    const members = [...(room.state.get('m.room.member') ?? new Map()).entries()]
      .filter(([, c]) => c.membership === 'join' || c.membership === 'invite')
      .map(([id]) => id);
    const others = members.filter((id) => id !== this.session.userId);

    // The bridge bot is the most specific signal: two instances of one bridge (e.g. Meta for
    // Instagram and for Messenger) share a protocol id but have different bots.
    let network: NetworkId | undefined =
      (info?.bridgebot && networkFromBotUserId(info.bridgebot)) ||
      (info?.protocol?.id && networkFromProtocol(info.protocol.id)) ||
      undefined;
    if (!network) {
      for (const id of [...others, ...room.heroes]) {
        network = networkFromUserId(id);
        if (network) break;
      }
    }

    const bots = others.filter((id) => networkFromBotUserId(id));
    const control = !info && bots.length === 1 && others.length === 1 ? networkFromBotUserId(bots[0]) : undefined;
    const roomType = info?.['com.beeper.room_type'];
    const humanCount = Math.max(room.joinedCount, members.length) - bots.length;
    const dm = roomType ? roomType === 'dm' : this.direct.has(room.id) || humanCount <= 2;
    return { network: network ?? 'matrix', control, dm };
  }

  private buildChat(room: Room): Chat {
    const { network, control, dm } = this.classify(room);
    const rawName: string | undefined = this.stateContent(room, 'm.room.name')?.name;
    const name = rawName && withoutNetworkSuffix(rawName);
    const heroes = room.heroes.filter((h) => h !== this.session.userId && !networkFromBotUserId(h));
    let title = name || heroes.map((h) => this.memberName(room, h)).join(', ');
    title ||= this.stateContent(room, 'm.room.canonical_alias')?.alias ?? '';
    // Bridges create a portal before they fill in its name and members.
    const incomplete = !title && !control && network !== 'matrix';
    if (!title) title = 'Empty chat';
    if (control) title = `${NETWORKS[control].name} bridge`;

    let avatarMxc: string | undefined = this.stateContent(room, 'm.room.avatar')?.url;
    if (!avatarMxc && dm && heroes[0]) avatarMxc = this.stateContent(room, 'm.room.member', heroes[0])?.avatar_url;

    const all = [...room.events, ...room.pending];
    const last = all[all.length - 1];
    const lastEdit = last && room.edits.get(last.id);
    const lastText = lastEdit?.text ?? last?.text;

    return {
      id: room.id,
      network: control ?? network,
      title,
      avatar: this.mediaRef(avatarMxc, 96),
      isGroup: !dm,
      memberCount: room.joinedCount || undefined,
      lastMessage: last && {
        text: lastEdit?.unavailable
          ? previewText('unavailable', lastText ?? '')
          : previewText(last.kind, lastText ?? '', last.media, last.share),
        ts: last.ts,
        senderName: last.senderName,
        fromMe: last.fromMe,
      },
      lastActivity: last?.ts ?? room.createdTs,
      unreadCount: room.notificationCount,
      markedUnread: room.markedUnread,
      pinned: 'm.favourite' in room.tags,
      lowPriority: 'm.lowpriority' in room.tags,
      muted: this.mutedRooms.has(room.id),
      archivedAt: room.archivedAt,
      isBridgeControl: !!control,
      encrypted: !!this.stateContent(room, 'm.room.encryption'),
      incomplete,
      typing: room.typing.length ? room.typing.map((u) => this.memberName(room, u).split(' ')[0]) : undefined,
    };
  }

  private buildAccounts(chats: Chat[]): Account[] {
    return CONNECTABLE_NETWORKS.filter((id) => NETWORKS[id].botLocalpart).map((id) => {
      const control = chats.find((c) => c.isBridgeControl && c.network === id);
      const portals = chats.filter((c) => !c.isBridgeControl && c.network === id).length;
      return {
        network: id,
        available: this.availableNetworks.has(id),
        connected: portals > 0,
        label: portals > 0 ? `${portals} chat${portals === 1 ? '' : 's'}` : control ? 'Setup started' : undefined,
        controlChatId: control?.id,
      };
    });
  }

  private publish(status = this.snapshot.status, statusDetail?: string) {
    const touched = new Set<NetworkId>();
    for (const id of this.dirty) {
      const room = this.rooms.get(id);
      if (!room) continue;
      // Bridges group each account's chats into a space (e.g. "WhatsApp (+353…)"). It's a folder, not a chat.
      if (this.stateContent(room, 'm.room.create')?.type === 'm.space') {
        this.chatCache.delete(id);
        continue;
      }
      const chat = this.buildChat(room);
      this.chatCache.set(id, chat);
      if (!chat.isBridgeControl && chat.network !== 'matrix') touched.add(chat.network);
    }
    this.dirty.clear();
    const chats = [...this.chatCache.values()];
    for (const n of touched) {
      this.imports.activity(n, chats.filter((c) => c.network === n && !c.isBridgeControl && !c.incomplete).length);
    }
    // Networks that already have chats once we've caught up (or restored the cache) aren't imports.
    if (status === 'ready' || status === 'syncing') {
      this.imports.setBaseline(chats.filter((c) => !c.isBridgeControl).map((c) => c.network));
    }
    this.snapshot = {
      status,
      statusDetail,
      userId: this.session.userId,
      displayName: this.displayName,
      chats,
      accounts: this.buildAccounts(chats),
      importing: this.imports.list(),
    };
    this.emit();
  }

  private touch(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) room.built = undefined;
    this.dirty.add(roomId);
    this.publish();
  }

  getSnapshot() {
    return this.snapshot;
  }

  getMessages(chatId: string): Message[] {
    const room = this.rooms.get(chatId);
    if (!room) return NO_MESSAGES;
    if (room.built) return room.built;
    const byId = new Map(room.events.map((m) => [m.id, m]));
    room.built = [...room.events, ...room.pending].map(({ replyToId, ...m }) => {
      const edit = room.edits.get(m.id);
      const target = replyToId ? byId.get(replyToId) : undefined;
      const reactions = [...(room.reactions.get(m.id) ?? new Map()).entries()]
        .map(([key, senders]) => ({
          key,
          count: senders.size,
          mine: senders.has(this.session.userId),
          senders: [...senders.keys()]
            .sort((a, b) => Number(b === this.session.userId) - Number(a === this.session.userId))
            .map((s) => (s === this.session.userId ? 'You' : this.memberName(room, s))),
        }))
        .filter((r) => r.count > 0);
      if (edit?.unavailable) {
        return {
          ...m,
          kind: 'unavailable' as const,
          text: edit.text,
          image: undefined,
          media: undefined,
          reactions,
          replyTo: undefined,
        };
      }
      return {
        ...m,
        poll: m.poll && this.tallyPoll(room, m.id, m.poll),
        text: edit?.text ?? m.text,
        mentions: edit ? edit.mentions : m.mentions,
        rich: edit ? edit.rich : m.rich,
        edited: !!edit,
        reactions,
        status: m.fromMe && m.status === 'sent' && m.ts <= room.othersReadTs ? 'read' : m.status,
        replyTo: replyToId
          ? {
              id: replyToId,
              senderName: target?.senderName ?? '',
              text: target ? (room.edits.get(target.id)?.text ?? target.text) : 'Original message',
            }
          : undefined,
      };
    });
    return room.built;
  }

  private tallyPoll(room: Room, pollId: string, poll: Poll): Poll {
    const votes = [...(room.pollVotes.get(pollId) ?? new Map()).entries()]
      // A vote over the limit is spoiled, as is one for options that don't exist.
      .map(([voter, v]) => [voter, v.answers.slice(0, poll.maxSelections)] as const)
      .filter(([, answers]) => answers.length > 0)
      .sort(([a], [b]) => Number(b === this.session.userId) - Number(a === this.session.userId));
    return {
      ...poll,
      totalVoters: votes.length,
      options: poll.options.map((o) => {
        const voters = votes.filter(([, answers]) => answers.includes(o.id)).map(([voter]) => voter);
        return {
          ...o,
          mine: voters.includes(this.session.userId),
          voters: voters.map((v) => (v === this.session.userId ? 'You' : this.memberName(room, v))),
        };
      }),
    };
  }

  hasMoreHistory(chatId: string) {
    return this.rooms.get(chatId)?.hasMore ?? false;
  }

  async loadOlder(chatId: string) {
    const room = this.rooms.get(chatId);
    if (!room?.hasMore) return;
    if (room.trimmed) {
      // The cache dropped older events, so ask the server for a token just before the oldest one we kept.
      const oldest = room.events[0];
      room.trimmed = false;
      if (oldest) {
        const ctx = await this.api('GET', `/v3/rooms/${this.enc(chatId)}/context/${this.enc(oldest.id)}`, undefined, {
          limit: 0,
        }).catch(() => undefined);
        if (ctx?.start) room.prevBatch = ctx.start;
      }
    }
    if (!room.prevBatch) return;
    const from = room.prevBatch;
    const res = await this.api('GET', `/v3/rooms/${this.enc(chatId)}/messages`, undefined, {
      dir: 'b',
      from,
      limit: 40,
      filter: JSON.stringify({ lazy_load_members: true }),
    });
    if (room.prevBatch !== from) return; // a sync gap reset this room meanwhile
    for (const ev of res.state ?? []) this.applyState(room, ev);
    for (const ev of res.chunk ?? []) this.applyTimelineEvent(room, ev, 'prepend');
    room.prevBatch = res.end;
    room.hasMore = !!res.end && (res.chunk?.length ?? 0) > 0;
    this.touch(chatId);
  }

  // ---------------------------------------------------------------- actions

  async sendText(chatId: string, text: string, replyToId?: string, mentions?: Member[]) {
    const room = this.rooms.get(chatId);
    if (!room) return;
    const txn = this.newTxn();
    const local: BaseMessage = {
      id: txn,
      chatId,
      senderId: this.session.userId,
      senderName: 'You',
      fromMe: true,
      ts: Date.now(),
      kind: 'text',
      text,
      mentions: mentions?.length ? mentions.map((m) => `@${m.name}`) : undefined,
      replyToId,
      status: 'sending',
    };
    room.pending.push(local);
    this.touch(chatId);

    const content: any = { msgtype: 'm.text', body: text, ...mentionContent(text, mentions) };
    if (replyToId) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyToId } };
    try {
      await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/send/m.room.message/${txn}`, content);
      room.pending = room.pending.map((p) => (p.id === txn ? { ...p, status: 'sent' } : p));
    } catch {
      room.pending = room.pending.map((p) => (p.id === txn ? { ...p, status: 'failed' } : p));
    }
    this.touch(chatId);
  }

  async sendMedia(chatId: string, media: OutgoingMedia) {
    const room = this.rooms.get(chatId);
    if (!room) return;
    const txn = this.newTxn();
    const localRef = { uri: media.uri, width: media.width, height: media.height };
    room.pending.push({
      id: txn,
      chatId,
      senderId: this.session.userId,
      senderName: 'You',
      fromMe: true,
      ts: Date.now(),
      kind: media.kind,
      text: '',
      image: media.kind === 'image' ? localRef : undefined,
      media: { ...localRef, name: media.name, mimeType: media.mimeType, size: media.size, duration: media.duration, voice: media.voice },
      status: 'sending',
    });
    this.touch(chatId);

    try {
      const blob = await (await fetch(media.uri)).blob();
      const upload = await fetch(
        `${this.session.homeserver}/_matrix/media/v3/upload?filename=${this.enc(media.name)}`,
        { method: 'POST', headers: { ...this.authHeaders, 'Content-Type': media.mimeType }, body: blob },
      );
      const uploaded = await upload.json();
      if (!upload.ok || !uploaded.content_uri) throw new Error(uploaded.error ?? 'Upload failed');

      const info: Record<string, unknown> = { mimetype: media.mimeType, size: media.size ?? blob.size };
      if (media.width && media.height) Object.assign(info, { w: media.width, h: media.height });
      if (media.duration) info.duration = Math.round(media.duration);
      const content: Record<string, unknown> = {
        msgtype: MSGTYPES[media.kind],
        body: media.voice ? 'Voice message' : media.name,
        filename: media.name,
        url: uploaded.content_uri,
        info,
      };
      if (media.voice) {
        // Bridges turn these into native voice notes (e.g. WhatsApp's push-to-talk messages).
        content['org.matrix.msc3245.voice'] = {};
        content['org.matrix.msc1767.audio'] = { duration: Math.round(media.duration ?? 0) };
      }
      await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/send/m.room.message/${txn}`, content);
      room.pending = room.pending.map((p) => (p.id === txn ? { ...p, status: 'sent' } : p));
    } catch {
      room.pending = room.pending.map((p) => (p.id === txn ? { ...p, status: 'failed' } : p));
    }
    this.touch(chatId);
  }

  async setPushToken(token: string | null) {
    await this.configReady;
    const previous = this.pushToken;
    this.pushToken = token;
    const url = this.config?.push_gateway_url;
    if (token && !url) throw new Error('Your server has no push gateway. Run the Comms server setup to add one.');
    if (token && url) {
      await this.api('POST', '/v3/pushers/set', {
        kind: 'http',
        app_id: PUSH_APP_ID,
        pushkey: token,
        app_display_name: 'Comms',
        device_display_name: this.session.deviceId,
        lang: 'en',
        data: { url },
        append: false,
      });
    } else if (!token && previous) {
      await this.api('POST', '/v3/pushers/set', { kind: null, app_id: PUSH_APP_ID, pushkey: previous });
    }
  }

  // ---------------------------------------------------------------- local cache

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flushSave(), 5000);
  }

  private flushSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.since) return;
    const rooms: CachedRoom[] = [...this.rooms.values()].map((r) => {
      const { events, trimmed } = trimEvents(r.events);
      return {
        id: r.id,
        state: [...r.state.entries()].map(([type, byKey]) => [type, [...byKey.entries()]]),
        events,
        reactions: [...r.reactions.entries()].map(([target, byKey]) => [
          target,
          [...byKey.entries()].map(([key, bySender]) => [key, [...bySender.entries()]]),
        ]),
        edits: [...r.edits.entries()],
        pollVotes: [...r.pollVotes.entries()].map(([poll, byVoter]) => [poll, [...byVoter.entries()]]),
        prevBatch: trimmed ? undefined : r.prevBatch,
        hasMore: r.hasMore,
        trimmed: trimmed || r.trimmed,
        heroes: r.heroes,
        joinedCount: r.joinedCount,
        notificationCount: r.notificationCount,
        tags: r.tags,
        markedUnread: r.markedUnread,
        archivedAt: r.archivedAt,
        othersReadTs: r.othersReadTs,
        createdTs: r.createdTs,
      };
    });
    saveCache({
      userId: this.session.userId,
      since: this.since,
      direct: [...this.direct],
      mutedRooms: [...this.mutedRooms],
      rooms,
    });
  }

  private restore(data: NonNullable<Awaited<ReturnType<typeof loadCache>>>) {
    this.since = data.since;
    this.direct = new Set(data.direct);
    this.mutedRooms = new Set(data.mutedRooms);
    for (const c of data.rooms) {
      const room = this.room(c.id);
      room.state = new Map(c.state.map(([type, entries]) => [type, new Map(entries)]));
      room.events = c.events.map((m: BaseMessage) => this.refreshAuth(m));
      room.eventIds = new Set(room.events.map((m) => m.id));
      room.reactions = new Map(
        c.reactions.map(([target, byKey]) => [target, new Map(byKey.map(([key, senders]) => [key, new Map(senders)]))]),
      );
      for (const [target, byKey] of room.reactions)
        for (const [key, bySender] of byKey)
          for (const [sender, eventId] of bySender) room.reactionIndex.set(eventId, [target, key, sender]);
      room.edits = new Map(c.edits);
      room.pollVotes = new Map((c.pollVotes ?? []).map(([poll, byVoter]) => [poll, new Map(byVoter)]));
      Object.assign(room, {
        prevBatch: c.prevBatch,
        hasMore: c.hasMore,
        trimmed: c.trimmed,
        heroes: c.heroes,
        joinedCount: c.joinedCount,
        notificationCount: c.notificationCount,
        tags: c.tags,
        markedUnread: c.markedUnread,
        archivedAt: c.archivedAt,
        othersReadTs: c.othersReadTs,
        createdTs: c.createdTs,
      });
      this.dirty.add(c.id);
    }
    this.publish('syncing');
  }

  /** Cached media URLs carry the token they were built with; use the current session's. */
  private refreshAuth(m: BaseMessage): BaseMessage {
    const h = this.authHeaders;
    return {
      ...m,
      image: m.image && { ...m.image, headers: h },
      media: m.media && {
        ...m.media,
        headers: h,
        thumbnail: m.media.thumbnail && { ...m.media.thumbnail, headers: h },
      },
    };
  }

  async editMessage(chatId: string, messageId: string, text: string) {
    const room = this.rooms.get(chatId);
    if (!room) return;
    room.edits.set(messageId, { text, ts: Date.now() });
    this.touch(chatId);
    await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/send/m.room.message/${this.newTxn()}`, {
      msgtype: 'm.text',
      body: `* ${text}`,
      'm.new_content': { msgtype: 'm.text', body: text },
      'm.relates_to': { rel_type: 'm.replace', event_id: messageId },
    });
  }

  async deleteMessage(chatId: string, messageId: string) {
    const room = this.rooms.get(chatId);
    if (!room) return;
    room.events = room.events.map((m) => (m.id === messageId ? deletedMessage(m) : m));
    this.touch(chatId);
    await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/redact/${this.enc(messageId)}/${this.newTxn()}`, {});
  }

  async setTyping(chatId: string, typing: boolean) {
    await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/typing/${this.enc(this.session.userId)}`, {
      typing,
      ...(typing ? { timeout: 6000 } : {}),
    }).catch(() => {});
  }

  private members = new Map<string, Promise<Member[]>>();

  getMembers(chatId: string): Promise<Member[]> {
    // Sync only loads members who've spoken recently, so ask for the full list (once per chat).
    let list = this.members.get(chatId);
    if (!list) {
      list = this.api<{ joined: Record<string, { display_name?: string; avatar_url?: string }> }>(
        'GET',
        `/v3/rooms/${this.enc(chatId)}/joined_members`,
      ).then(({ joined }) =>
        Object.entries(joined)
          .filter(([userId]) => userId !== this.session.userId && !networkFromBotUserId(userId))
          .map(([userId, p]) => ({
            userId,
            name: withoutNetworkSuffix(p.display_name ?? userId.replace(/^@/, '').split(':')[0]),
            avatar: this.mediaRef(p.avatar_url, 96),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      list.catch(() => this.members.delete(chatId));
      this.members.set(chatId, list);
    }
    return list;
  }

  async votePoll(chatId: string, messageId: string, optionIds: string[]) {
    const room = this.rooms.get(chatId);
    if (!room) return;
    // Show the vote straight away; the server echo replaces it.
    let byVoter = room.pollVotes.get(messageId);
    if (!byVoter) room.pollVotes.set(messageId, (byVoter = new Map()));
    byVoter.set(this.session.userId, { answers: optionIds, ts: Date.now() });
    this.touch(chatId);
    await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/send/${POLL_RESPONSE}/${this.newTxn()}`, {
      'm.relates_to': { rel_type: 'm.reference', event_id: messageId },
      [POLL_RESPONSE]: { answers: optionIds },
    });
  }

  async react(chatId: string, messageId: string, key: string) {
    const room = this.rooms.get(chatId);
    const mine = room?.reactions.get(messageId)?.get(key)?.get(this.session.userId);
    if (mine) {
      await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/redact/${this.enc(mine)}/${this.newTxn()}`, {});
    } else {
      await this.api('PUT', `/v3/rooms/${this.enc(chatId)}/send/m.reaction/${this.newTxn()}`, {
        'm.relates_to': { rel_type: 'm.annotation', event_id: messageId, key },
      });
    }
  }

  async markRead(chatId: string) {
    const room = this.rooms.get(chatId);
    if (!room) return;
    const last = [...room.events].reverse().find((m) => !m.fromMe) ?? room.events[room.events.length - 1];
    const wasUnread = room.notificationCount > 0 || room.markedUnread;
    room.notificationCount = 0;
    if (room.markedUnread) await this.setFlags(chatId, { markedUnread: false });
    if (wasUnread) this.touch(chatId);
    if (last && !last.id.startsWith('comms')) {
      await this.api('POST', `/v3/rooms/${this.enc(chatId)}/read_markers`, {
        'm.fully_read': last.id,
        'm.read': last.id,
      }).catch(() => {});
    }
  }

  async setFlags(chatId: string, flags: ChatFlags) {
    const room = this.rooms.get(chatId);
    if (!room) return;
    const me = this.enc(this.session.userId);
    const rid = this.enc(chatId);
    const tasks: Promise<unknown>[] = [];

    const setTag = (tag: string, on: boolean) => {
      if (on) room.tags = { ...room.tags, [tag]: { order: 0.5 } };
      else {
        const { [tag]: _, ...rest } = room.tags;
        room.tags = rest;
      }
      tasks.push(
        on
          ? this.api('PUT', `/v3/user/${me}/rooms/${rid}/tags/${tag}`, { order: 0.5 })
          : this.api('DELETE', `/v3/user/${me}/rooms/${rid}/tags/${tag}`),
      );
    };
    if (flags.pinned !== undefined) setTag('m.favourite', flags.pinned);
    if (flags.lowPriority !== undefined) setTag('m.lowpriority', flags.lowPriority);

    if (flags.markedUnread !== undefined) {
      room.markedUnread = flags.markedUnread;
      if (!flags.markedUnread) room.notificationCount = 0;
      tasks.push(
        this.api('PUT', `/v3/user/${me}/rooms/${rid}/account_data/m.marked_unread`, { unread: flags.markedUnread }),
      );
    }
    if (flags.archived !== undefined) {
      room.archivedAt = flags.archived ? Date.now() : undefined;
      tasks.push(
        this.api('PUT', `/v3/user/${me}/rooms/${rid}/account_data/${ARCHIVE_TYPE}`, {
          archived_at: room.archivedAt ?? null,
        }),
      );
      if (flags.archived) tasks.push(this.markRead(chatId));
    }
    if (flags.muted !== undefined) {
      if (flags.muted) this.mutedRooms.add(chatId);
      else this.mutedRooms.delete(chatId);
      tasks.push(
        flags.muted
          ? this.api('PUT', `/v3/pushrules/global/room/${rid}`, { actions: [] })
          : this.api('DELETE', `/v3/pushrules/global/room/${rid}`).catch(() => {}),
      );
    }
    this.touch(chatId);
    await Promise.all(tasks);
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const chats = this.snapshot.chats.filter((c) => !c.isBridgeControl);
    const results: SearchResult[] = chats
      .filter((c) => c.title.toLowerCase().includes(q.toLowerCase()))
      .map((chat) => ({ type: 'chat', chat }));
    try {
      const res = await this.api('POST', '/v3/search', {
        search_categories: { room_events: { search_term: q, order_by: 'recent' } },
      });
      for (const r of res.search_categories?.room_events?.results ?? []) {
        const chat = this.chatCache.get(r.result.room_id);
        const room = this.rooms.get(r.result.room_id);
        const message = room && this.toMessage(room, r.result);
        if (chat && message) results.push({ type: 'message', chat, message: { ...message, reactions: [] } });
      }
    } catch {}
    return results;
  }

  async connectNetwork(network: NetworkId) {
    const bot = `@${NETWORKS[network].botLocalpart}:${this.domain}`;
    let roomId = this.snapshot.accounts.find((a) => a.network === network)?.controlChatId;
    if (!roomId) {
      const res = await this.api('POST', '/v3/createRoom', {
        invite: [bot],
        is_direct: true,
        preset: 'trusted_private_chat',
      });
      roomId = res.room_id as string;
      const created = roomId;
      // The bot must join before it will see our command.
      this.waitForJoin(created, bot).then(() => this.sendText(created, 'login'));
    } else {
      await this.sendText(roomId, 'login');
    }
    return roomId;
  }

  beginImport(network: NetworkId) {
    const hasChats = [...this.chatCache.values()].some((c) => c.network === network && !c.isBridgeControl);
    this.imports.begin(network, hasChats);
  }

  async disconnectNetwork(network: NetworkId) {
    const roomId = this.snapshot.accounts.find((a) => a.network === network)?.controlChatId;
    if (roomId) await this.sendText(roomId, 'list-logins');
    return roomId;
  }

  private waitForJoin(roomId: string, userId: string, timeoutMs = 15000) {
    return new Promise<void>((resolve) => {
      const started = Date.now();
      const check = () => {
        const room = this.rooms.get(roomId);
        const membership = room && this.stateContent(room, 'm.room.member', userId)?.membership;
        if (membership === 'join' || Date.now() - started > timeoutMs) resolve();
        else setTimeout(check, 500);
      };
      check();
    });
  }
}

/** Removes the legacy "> <@user> quoted text" fallback that older clients prepend to replies. */
function stripReplyFallback(body: string) {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('> ')) i++;
  if (i === 0) return body;
  if (lines[i] === '') i++;
  return lines.slice(i).join('\n');
}
