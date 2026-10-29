import type { BridgeManager, BridgeStatus, Contact, LoginFlow, LoginStep } from '../bridges';
import { previewText } from '../format';
import { NETWORKS } from '../networks';
import type { Account, Chat, ChatFlags, Message, NetworkId, OutgoingMedia, SearchResult } from '../types';
import { BaseBackend, type Backend, type BackendSnapshot } from './backend';

const ME = '@me:demo';
const MIN = 60_000;
const HOUR = 60 * MIN;

type Seed = {
  network: NetworkId;
  title: string;
  group?: string[];
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
  lowPriority?: boolean;
  archived?: boolean;
  /** [minutes ago, sender ('me' | name), text] — oldest first. */
  lines: [number, string, string][];
};

const SEEDS: Seed[] = [
  {
    network: 'whatsapp', title: 'Mum', pinned: true, unread: 2,
    lines: [
      [190, 'me', 'Landed safely 👍'],
      [185, 'Mum', 'Oh good! How was the flight?'],
      [180, 'me', 'Bumpy but fine. Will call tonight'],
      [14, 'Mum', 'Are you still coming for dinner Sunday?'],
      [13, 'Mum', "Dad's doing a roast 🍗"],
    ],
  },
  {
    network: 'signal', title: 'Sam Chen',
    lines: [
      [600, 'Sam Chen', 'Did you see the new draft?'],
      [590, 'me', 'Yeah, left some comments on section 3'],
      [42, 'Sam Chen', 'Thanks, pushing the fixes now'],
      [40, 'me', 'Legend 🙌'],
    ],
  },
  {
    network: 'whatsapp', title: 'Football Saturdays', group: ['Dan', 'Priya', 'Marcus', 'Leo'], unread: 7,
    lines: [
      [300, 'Dan', 'Pitch is booked for 10am'],
      [298, 'Priya', "I'm in"],
      [297, 'Marcus', 'In ⚽'],
      [120, 'Leo', 'Might be 10 mins late'],
      [60, 'Dan', 'Who has the bibs?'],
      [30, 'Priya', 'Not me this time'],
      [9, 'Marcus', 'I think Leo took them home'],
      [5, 'Dan', '@Leo bring the bibs pls'],
    ],
  },
  {
    network: 'telegram', title: 'Alex Rivera', unread: 1,
    lines: [
      [2000, 'me', 'Send me that article when you get a sec'],
      [1990, 'Alex Rivera', 'https://example.com/long-read'],
      [25, 'Alex Rivera', 'Did you end up reading it?'],
    ],
  },
  {
    network: 'instagram', title: 'jess.makes', unread: 1,
    lines: [
      [400, 'jess.makes', 'Thank you for the follow!'],
      [380, 'me', 'Your ceramics are amazing'],
      [70, 'jess.makes', 'Shared a reel with you 🎨'],
    ],
  },
  {
    network: 'messenger', title: 'Grandad',
    lines: [
      [3000, 'Grandad', 'HOW DO I TURN OFF CAPS'],
      [2990, 'me', 'There is a key on the left with an arrow 😂'],
      [2900, 'Grandad', 'thank you'],
    ],
  },
  {
    network: 'slack', title: '#design-review', group: ['Nora', 'Tomás', 'Ivy'], unread: 3,
    lines: [
      [240, 'Nora', 'New onboarding flows are up in Figma'],
      [200, 'Tomás', 'Love the empty states'],
      [100, 'Ivy', 'Can we revisit the colour contrast on step 2?'],
      [90, 'Nora', 'Good shout, will fix'],
    ],
  },
  {
    network: 'discord', title: 'Raid Night', group: ['Kai', 'Morgan', 'Zed'], muted: true, unread: 24,
    lines: [
      [80, 'Kai', 'anyone on tonight?'],
      [75, 'Zed', 'after 9'],
      [50, 'Morgan', 'same'],
    ],
  },
  {
    network: 'gmessages', title: '+44 7700 900123', lowPriority: true, unread: 1,
    lines: [[600, '+44 7700 900123', 'Your parcel is out for delivery today between 10:00-14:00.']],
  },
  {
    network: 'gmessages', title: 'Dentist', lowPriority: true,
    lines: [[3000, 'Dentist', 'Reminder: appointment Tue 3pm. Reply C to confirm.'], [2990, 'me', 'C']],
  },
  {
    network: 'linkedin', title: 'Riley Park', lowPriority: true, unread: 1,
    lines: [[2200, 'Riley Park', "Hi! I came across your profile and think you'd be a great fit for…"]],
  },
  {
    network: 'signal', title: 'Climbing crew', group: ['Ana', 'Ben', 'Chloe'], archived: true,
    lines: [
      [6000, 'Ana', 'Thursday at the wall?'],
      [5990, 'Ben', 'Yes'],
      [5900, 'me', "I'll be there"],
    ],
  },
  {
    network: 'telegram', title: 'Flat 4B', group: ['Ollie', 'Mia'],
    lines: [
      [1500, 'Ollie', 'Bins go out tonight'],
      [1440, 'Mia', "I'll do it"],
      [700, 'me', 'Rent transferred 💸'],
    ],
  },
  {
    network: 'whatsapp', title: 'Priya',
    lines: [
      [4000, 'Priya', 'Happy birthday!! 🎉'],
      [3990, 'me', 'Thank you!! ❤️'],
    ],
  },
];

const INCOMING = [
  'Sounds good!', 'Haha 😂', 'On my way', 'Can you call me?', 'Did you see this?', 'Perfect 👌',
  'What time works?', 'Running 5 mins late', 'Love it', 'Nice one', '👀', 'Sure thing',
];

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export class DemoBackend extends BaseBackend implements Backend {
  readonly kind = 'demo' as const;
  private chats = new Map<string, Chat>();
  private messages = new Map<string, Message[]>();
  private participants = new Map<string, string[]>();
  private accounts: Account[];
  private snapshot!: BackendSnapshot;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private olderLoaded = new Set<string>();
  readonly bridges: BridgeManager = new DemoBridges(this);

  constructor() {
    super();
    const now = Date.now();
    const connected = new Set<NetworkId>();
    SEEDS.forEach((s, i) => {
      const id = `demo-${i}`;
      connected.add(s.network);
      const msgs: Message[] = s.lines.map(([ago, who, text]) =>
        this.makeMessage(id, who, text, now - ago * MIN),
      );
      // Everything sent by me before the last incoming message has been read.
      msgs.forEach((m) => {
        if (m.fromMe) m.status = 'read';
      });
      this.messages.set(id, msgs);
      this.participants.set(id, s.group ?? [s.title]);
      const last = msgs[msgs.length - 1];
      this.chats.set(id, {
        id,
        network: s.network,
        title: s.title,
        isGroup: !!s.group,
        memberCount: s.group ? s.group.length + 1 : 2,
        lastMessage: preview(last),
        lastActivity: last.ts,
        unreadCount: s.unread ?? 0,
        markedUnread: false,
        pinned: !!s.pinned,
        muted: !!s.muted,
        lowPriority: !!s.lowPriority,
        archivedAt: s.archived ? now : undefined,
      });
    });
    this.accounts = Object.values(NETWORKS)
      .filter((n) => n.id !== 'matrix')
      .map((n) => ({
        network: n.id,
        connected: connected.has(n.id),
        available: true,
        label: connected.has(n.id) ? 'Demo account' : undefined,
      }));
    this.rebuild('ready');
  }

  private makeMessage(chatId: string, who: string, text: string, ts: number): Message {
    const fromMe = who === 'me';
    return {
      id: nextId('m'),
      chatId,
      senderId: fromMe ? ME : `@${who.replace(/\W/g, '').toLowerCase()}:demo`,
      senderName: fromMe ? 'You' : who,
      fromMe,
      ts,
      kind: 'text',
      text,
      reactions: [],
      status: fromMe ? 'sent' : undefined,
    };
  }

  private rebuild(status: BackendSnapshot['status'] = this.snapshot.status) {
    this.snapshot = {
      status,
      userId: ME,
      displayName: 'You',
      chats: [...this.chats.values()],
      accounts: [...this.accounts],
    };
    this.emit();
  }

  private updateChat(id: string, patch: Partial<Chat>) {
    const chat = this.chats.get(id);
    if (!chat) return;
    this.chats.set(id, { ...chat, ...patch });
  }

  private append(chatId: string, msg: Message, countUnread: boolean) {
    this.messages.set(chatId, [...(this.messages.get(chatId) ?? []), msg]);
    const chat = this.chats.get(chatId)!;
    this.updateChat(chatId, {
      lastMessage: preview(msg),
      lastActivity: msg.ts,
      unreadCount: countUnread ? chat.unreadCount + 1 : chat.unreadCount,
    });
    this.rebuild();
  }

  async start() {
    const tick = () => {
      // Someone in a random, non-muted chat says something every so often.
      const candidates = [...this.chats.values()].filter((c) => !c.muted && !c.lowPriority);
      const chat = candidates[Math.floor(Math.random() * candidates.length)];
      if (chat) {
        const people = this.participants.get(chat.id) ?? [chat.title];
        const who = people[Math.floor(Math.random() * people.length)];
        this.append(chat.id, this.makeMessage(chat.id, who, pick(INCOMING), Date.now()), true);
      }
      this.timers.push(setTimeout(tick, 30_000 + Math.random() * 30_000));
    };
    this.timers.push(setTimeout(tick, 20_000));
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  async logout() {
    this.stop();
  }

  getSnapshot() {
    return this.snapshot;
  }

  getMessages(chatId: string) {
    return this.messages.get(chatId) ?? EMPTY;
  }

  hasMoreHistory(chatId: string) {
    return !this.olderLoaded.has(chatId);
  }

  async loadOlder(chatId: string) {
    if (this.olderLoaded.has(chatId)) return;
    this.olderLoaded.add(chatId);
    const msgs = this.messages.get(chatId) ?? [];
    const first = msgs[0]?.ts ?? Date.now();
    const people = this.participants.get(chatId) ?? ['Someone'];
    const older = Array.from({ length: 6 }, (_, i) => {
      const who = i % 2 === 0 ? pick(people) : 'me';
      const m = this.makeMessage(chatId, who, pick(INCOMING), first - (6 - i) * 3 * HOUR);
      if (m.fromMe) m.status = 'read';
      return m;
    });
    await delay(400);
    this.messages.set(chatId, [...older, ...msgs]);
    this.emit();
  }

  async sendText(chatId: string, text: string, replyToId?: string) {
    const msgs = this.messages.get(chatId) ?? [];
    const target = replyToId ? msgs.find((m) => m.id === replyToId) : undefined;
    const msg: Message = {
      ...this.makeMessage(chatId, 'me', text, Date.now()),
      status: 'sending',
      replyTo: target && { id: target.id, senderName: target.senderName, text: target.text },
    };
    const chat = this.chats.get(chatId);
    // Sending into an archived chat brings it back, like any new activity.
    this.append(chatId, msg, false);
    this.updateChat(chatId, { markedUnread: false });
    await delay(300);
    this.patchMessage(chatId, msg.id, { status: 'sent' });

    if (!chat) return;
    const people = this.participants.get(chatId) ?? [chat.title];
    this.timers.push(
      setTimeout(() => this.patchMessage(chatId, msg.id, { status: 'read' }), 1500),
      setTimeout(() => {
        const reply = this.makeMessage(chatId, pick(people), pick(INCOMING), Date.now());
        this.append(chatId, reply, true);
      }, 3500 + Math.random() * 3000),
    );
  }

  private patchMessage(chatId: string, id: string, patch: Partial<Message>) {
    const msgs = this.messages.get(chatId);
    if (!msgs) return;
    this.messages.set(chatId, msgs.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    this.emit();
  }

  async react(chatId: string, messageId: string, key: string) {
    const msg = this.messages.get(chatId)?.find((m) => m.id === messageId);
    if (!msg) return;
    const existing = msg.reactions.find((r) => r.key === key);
    let reactions: Message['reactions'];
    if (existing?.mine) {
      reactions = msg.reactions
        .map((r) => (r.key === key ? { ...r, count: r.count - 1, mine: false } : r))
        .filter((r) => r.count > 0);
    } else if (existing) {
      reactions = msg.reactions.map((r) => (r.key === key ? { ...r, count: r.count + 1, mine: true } : r));
    } else {
      reactions = [...msg.reactions, { key, count: 1, mine: true }];
    }
    this.patchMessage(chatId, messageId, { reactions });
  }

  async markRead(chatId: string) {
    const chat = this.chats.get(chatId);
    if (!chat || (chat.unreadCount === 0 && !chat.markedUnread)) return;
    this.updateChat(chatId, { unreadCount: 0, markedUnread: false });
    this.rebuild();
  }

  async setFlags(chatId: string, flags: ChatFlags) {
    const { archived, ...rest } = flags;
    const patch: Partial<Chat> = { ...rest };
    if (archived !== undefined) patch.archivedAt = archived ? Date.now() : undefined;
    if (archived) {
      patch.unreadCount = 0;
      patch.markedUnread = false;
    }
    if (flags.markedUnread === false) patch.unreadCount = 0;
    this.updateChat(chatId, patch);
    this.rebuild();
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: SearchResult[] = [];
    for (const chat of this.chats.values()) {
      if (chat.title.toLowerCase().includes(q)) results.push({ type: 'chat', chat });
    }
    for (const chat of this.chats.values()) {
      for (const message of this.messages.get(chat.id) ?? []) {
        if (message.text.toLowerCase().includes(q)) results.push({ type: 'message', chat, message });
      }
    }
    return results;
  }

  async sendMedia(chatId: string, media: OutgoingMedia) {
    const ref = { uri: media.uri, width: media.width, height: media.height };
    const msg: Message = {
      ...this.makeMessage(chatId, 'me', '', Date.now()),
      kind: media.kind,
      image: media.kind === 'image' ? ref : undefined,
      media: { ...ref, name: media.name, mimeType: media.mimeType, size: media.size, duration: media.duration, voice: media.voice },
      status: 'sending',
    };
    this.append(chatId, msg, false);
    await delay(600);
    this.patchMessage(chatId, msg.id, { status: 'sent' });
  }

  async setPushToken() {}

  /** Opens an existing chat with this person on this network, or starts a new one. */
  createChat(network: NetworkId, title: string) {
    const existing = [...this.chats.values()].find((c) => c.network === network && c.title === title && !c.isGroup);
    if (existing) return existing.id;
    const id = nextId('demo');
    this.messages.set(id, []);
    this.olderLoaded.add(id); // a brand-new chat has no history to page back through
    this.participants.set(id, [title]);
    this.chats.set(id, {
      id,
      network,
      title,
      isGroup: false,
      memberCount: 2,
      lastActivity: Date.now(),
      unreadCount: 0,
      markedUnread: false,
      pinned: false,
      muted: false,
      lowPriority: false,
    });
    this.rebuild();
    return id;
  }

  async connectNetwork(network: NetworkId) {
    await delay(800);
    this.accounts = this.accounts.map((a) =>
      a.network === network ? { ...a, connected: true, label: 'Demo account' } : a,
    );
    this.rebuild();
    return undefined;
  }

  async disconnectNetwork(network: NetworkId) {
    this.accounts = this.accounts.map((a) =>
      a.network === network ? { ...a, connected: false, label: undefined } : a,
    );
    this.rebuild();
    return undefined;
  }
}

const EMPTY: Message[] = [];

function preview(m: Message) {
  return { text: previewText(m.kind, m.text, m.media), ts: m.ts, senderName: m.senderName, fromMe: m.fromMe };
}

const DEMO_CONTACTS = [
  'Ana Souza', 'Ben Okafor', 'Chloe Martin', 'Dev Patel', 'Elena Rossi', 'Felix Wagner', 'Grace Kim',
  'Hiro Tanaka', 'Isla Murphy', 'Jonah Levi', 'Kemi Adeyemi', 'Lucas Silva', 'Maya Cohen', 'Noah Brown',
];

/**
 * Simulates the bridge provisioning API so the native login and new-chat screens can be
 * tried without a server: QR and pairing-code logins complete on their own after a few seconds.
 */
class DemoBridges implements BridgeManager {
  constructor(private backend: DemoBackend) {}

  supports() {
    return true;
  }

  private flows(network: NetworkId): LoginFlow[] {
    switch (network) {
      case 'whatsapp':
        return [
          { id: 'qr', name: 'QR', description: 'Scan a QR code with the WhatsApp app' },
          { id: 'phone', name: 'Pairing code', description: 'Enter your phone number to get a pairing code' },
        ];
      case 'signal':
      case 'gmessages':
      case 'discord':
        return [{ id: 'qr', name: 'QR', description: `Scan a QR code with the ${NETWORKS[network].name} app` }];
      case 'telegram':
        return [{ id: 'phone', name: 'Phone number', description: 'Log in with your phone number and a code' }];
      default:
        return [{ id: 'password', name: 'Password', description: 'Log in with your username and password' }];
    }
  }

  async status(network: NetworkId): Promise<BridgeStatus> {
    await delay(300);
    const account = this.backend.getSnapshot().accounts.find((a) => a.network === network);
    return {
      flows: this.flows(network),
      logins: account?.connected ? [{ id: 'demo', name: 'Demo account', state: 'CONNECTED' }] : [],
    };
  }

  async startLogin(network: NetworkId, flowId: string): Promise<LoginStep> {
    await delay(500);
    const base = { login_id: `demo-${network}`, step_id: `demo.${flowId}` };
    if (flowId === 'qr') {
      return {
        ...base,
        type: 'display_and_wait',
        instructions: `Open ${NETWORKS[network].name} on your phone and scan this code. (Demo: it completes by itself.)`,
        display_and_wait: { type: 'qr', data: `comms-demo-login:${network}:${Date.now()}` },
      };
    }
    if (flowId === 'phone') {
      return {
        ...base,
        type: 'user_input',
        user_input: {
          fields: [{ type: 'phone_number', id: 'phone_number', name: 'Phone number', description: 'In international format, e.g. +44 7700 900123' }],
        },
      };
    }
    return {
      ...base,
      type: 'user_input',
      user_input: {
        fields: [
          { type: 'username', id: 'username', name: 'Username' },
          { type: 'password', id: 'password', name: 'Password' },
        ],
      },
    };
  }

  async submitStep(network: NetworkId, step: LoginStep): Promise<LoginStep> {
    const base = { login_id: step.login_id };
    if (step.step_id === 'demo.phone') {
      await delay(800);
      return {
        ...base,
        step_id: 'demo.code',
        type: 'display_and_wait',
        instructions: `On your phone, open ${NETWORKS[network].name} → Linked devices → Link with phone number, and enter this code.`,
        display_and_wait: { type: 'code', data: '4F7K-9QX2' },
      };
    }
    await delay(step.type === 'display_and_wait' ? 4000 : 800);
    await this.backend.connectNetwork(network);
    return { ...base, step_id: 'demo.complete', type: 'complete', complete: { user_login_id: 'demo' } };
  }

  async logout(network: NetworkId) {
    await this.backend.disconnectNetwork(network);
  }

  async contacts(): Promise<Contact[]> {
    await delay(300);
    return DEMO_CONTACTS.map((name) => ({ id: name.toLowerCase().replace(/\W/g, '.'), name }));
  }

  async search(_network: NetworkId, query: string) {
    const q = query.toLowerCase();
    return (await this.contacts()).filter((c) => c.name?.toLowerCase().includes(q));
  }

  async startChat(network: NetworkId, identifier: string) {
    await delay(600);
    const contact = DEMO_CONTACTS.find((n) => n.toLowerCase().replace(/\W/g, '.') === identifier);
    return this.backend.createChat(network, contact ?? identifier);
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
