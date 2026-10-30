import type { NetworkId, NetworkImport } from '../types';
import { IMPORT_EMPTY_MS, IMPORT_MAX_MS, IMPORT_QUIET_MS } from './backend';

type ActiveImport = { started: number; last: number; found: number };

/**
 * Tracks networks whose chats are arriving for the first time. A bridge creates chats one by one
 * (nameless at first, then named, then backfilled), so rather than show that, the inbox holds a
 * network's chats back until the bridge has gone quiet for a while.
 */
export class ImportTracker {
  private active = new Map<NetworkId, ActiveImport>();
  /** Networks that already had chats when the first sync finished. Unset until then. */
  private known?: Set<NetworkId>;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private onChange: () => void) {}

  /** Records which networks already have chats; only the first call counts. */
  setBaseline(networks: Iterable<NetworkId>) {
    this.known ??= new Set(networks);
  }

  /** A login just completed. Networks that already have chats (reconnects) aren't imports. */
  begin(network: NetworkId, hasChats: boolean) {
    if (hasChats || this.active.has(network)) return;
    this.start(network, 0);
    this.onChange();
  }

  /** A chat on this network changed; `found` is how many complete chats it now has. */
  activity(network: NetworkId, found: number) {
    const imp = this.active.get(network);
    if (imp) {
      imp.last = Date.now();
      imp.found = found;
    } else if (this.known && !this.known.has(network)) {
      // Chats for a network we've never seen, e.g. connected from another device.
      this.start(network, found);
    }
  }

  isImporting(network: NetworkId) {
    return this.active.has(network);
  }

  list(): NetworkImport[] {
    return [...this.active].map(([network, { found }]) => ({ network, found }));
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private start(network: NetworkId, found: number) {
    const now = Date.now();
    this.active.set(network, { started: now, last: now, found });
    this.timer ??= setInterval(() => this.check(), 2000);
  }

  private check() {
    const now = Date.now();
    let changed = false;
    for (const [network, imp] of this.active) {
      const done =
        imp.found > 0
          ? now - imp.last > IMPORT_QUIET_MS || now - imp.started > IMPORT_MAX_MS
          : now - imp.started > IMPORT_EMPTY_MS;
      if (done) {
        this.active.delete(network);
        this.known?.add(network);
        changed = true;
      }
    }
    if (!this.active.size) this.stop();
    if (changed) this.onChange();
  }
}
