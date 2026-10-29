import type {
  BridgeLogin,
  BridgeManager,
  BridgeStatus,
  Contact,
  LoginStep,
} from '../bridges';
import type { ImageRef, NetworkId } from '../types';

/** Served by the Comms server's Caddy front door (see server/setup.mjs). */
export type CommsServerConfig = {
  version: number;
  push_gateway_url?: string;
  bridges?: Partial<Record<NetworkId, { bot: string; provisioning: string | null }>>;
};

type Deps = {
  homeserver: string;
  userId: string;
  accessToken: string;
  getConfig: () => CommsServerConfig | undefined;
  /** Resolves once the server config has been fetched (or found to be absent). */
  configLoaded: () => Promise<void>;
  mediaRef: (mxc: string | undefined, size?: number) => ImageRef | undefined;
};

export class ProvisioningError extends Error {
  constructor(
    public status: number,
    public errcode: string,
    message: string,
  ) {
    super(message);
  }
}

/** Client for the mautrix bridgev2 provisioning API, reached through the Comms server. */
export class MatrixBridges implements BridgeManager {
  constructor(private deps: Deps) {}

  supports(network: NetworkId) {
    return !!this.deps.getConfig()?.bridges?.[network]?.provisioning;
  }

  private async call<T = any>(
    network: NetworkId,
    method: string,
    path: string,
    body?: unknown,
    query: Record<string, string | undefined> = {},
  ): Promise<T> {
    await this.deps.configLoaded();
    const base = this.deps.getConfig()?.bridges?.[network]?.provisioning;
    if (!base) throw new ProvisioningError(0, 'COMMS_UNSUPPORTED', 'This bridge has no native login support.');
    const qs = Object.entries({ ...query, user_id: this.deps.userId })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join('&');
    const res = await fetch(`${this.deps.homeserver}${base}/v3${path}?${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.deps.accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ProvisioningError(res.status, json.errcode ?? 'M_UNKNOWN', json.error ?? `Bridge error (HTTP ${res.status})`);
    }
    return json as T;
  }

  async status(network: NetworkId): Promise<BridgeStatus> {
    const res = await this.call(network, 'GET', '/whoami');
    const logins: BridgeLogin[] = (res.logins ?? []).map((l: any) => ({
      id: l.id,
      name: l.name || l.profile?.name || l.profile?.phone || l.profile?.username || l.id,
      state: l.state?.state_event,
      stateMessage: l.state?.message ?? l.state?.error,
    }));
    return { flows: res.login_flows ?? [], logins };
  }

  startLogin(network: NetworkId, flowId: string) {
    return this.call<LoginStep>(network, 'POST', `/login/start/${encodeURIComponent(flowId)}`, {});
  }

  submitStep(network: NetworkId, step: LoginStep, values: Record<string, string> = {}) {
    const path = `/login/step/${encodeURIComponent(step.login_id)}/${encodeURIComponent(step.step_id)}/${step.type}`;
    return this.call<LoginStep>(network, 'POST', path, step.type === 'display_and_wait' ? {} : values);
  }

  async logout(network: NetworkId, loginId: string) {
    await this.call(network, 'POST', `/logout/${encodeURIComponent(loginId)}`, {});
  }

  private toContact = (c: any): Contact => ({
    id: c.id,
    name: c.name,
    avatar: this.deps.mediaRef(c.avatar_url, 96),
    identifiers: c.identifiers,
    roomId: c.dm_room_mxid,
  });

  async contacts(network: NetworkId) {
    const res = await this.call(network, 'GET', '/contacts');
    return ((res.contacts ?? res.results ?? []) as any[]).map(this.toContact);
  }

  async search(network: NetworkId, query: string) {
    const res = await this.call(network, 'POST', '/search_users', { query });
    return ((res.results ?? res.contacts ?? []) as any[]).map(this.toContact);
  }

  async startChat(network: NetworkId, identifier: string) {
    const res = await this.call(network, 'POST', `/create_dm/${encodeURIComponent(identifier)}`, {});
    if (!res.dm_room_mxid) throw new ProvisioningError(0, 'COMMS_NO_ROOM', 'The bridge did not create a chat.');
    return res.dm_room_mxid as string;
  }
}
