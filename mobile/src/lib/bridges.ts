import type { ImageRef, NetworkId } from './types';

// Types for the mautrix "bridgev2" provisioning API, which drives native login screens,
// contact lists and starting new chats. https://docs.mau.fi/bridges/

export type LoginFlow = { id: string; name: string; description?: string };

export type InputField = {
  type: string; // username, phone_number, email, password, 2fa_code, token, url, domain, select…
  id: string;
  name: string;
  description?: string;
  pattern?: string;
  default_value?: string;
  options?: string[];
};

export type CookieSource = {
  type: 'cookie' | 'local_storage' | 'request_header' | 'request_body' | 'special';
  name: string;
  cookie_domain?: string;
};

export type CookieField = { id: string; required?: boolean; sources: CookieSource[] };

export type LoginStep = {
  login_id: string;
  step_id: string;
  type: 'user_input' | 'cookies' | 'display_and_wait' | 'complete';
  instructions?: string;
  user_input?: { fields: InputField[] };
  cookies?: {
    url: string;
    user_agent?: string;
    fields: CookieField[];
    wait_for_url_pattern?: string;
    extract_js?: string;
  };
  display_and_wait?: { type: 'qr' | 'emoji' | 'code' | 'nothing'; data?: string; image_url?: string };
  complete?: { user_login_id?: string };
};

export type BridgeLogin = {
  id: string;
  name: string;
  state?: string;
  stateMessage?: string;
};

export type BridgeStatus = {
  flows: LoginFlow[];
  logins: BridgeLogin[];
};

export type Contact = {
  id: string;
  name?: string;
  avatar?: ImageRef;
  identifiers?: string[];
  /** Existing DM room, if there is one. */
  roomId?: string;
};

/** Native (non-chat-command) bridge management. Optional: not every backend or bridge has it. */
export interface BridgeManager {
  /** Whether `network` supports native login/contacts on this server. */
  supports(network: NetworkId): boolean;
  status(network: NetworkId): Promise<BridgeStatus>;
  startLogin(network: NetworkId, flowId: string): Promise<LoginStep>;
  /** Submits a step. For display_and_wait this waits until the user acts (scans the QR…). */
  submitStep(network: NetworkId, step: LoginStep, values?: Record<string, string>): Promise<LoginStep>;
  logout(network: NetworkId, loginId: string): Promise<void>;
  contacts(network: NetworkId): Promise<Contact[]>;
  search(network: NetworkId, query: string): Promise<Contact[]>;
  /** Opens (creating if needed) a direct chat. Resolves to the chat id. */
  startChat(network: NetworkId, identifier: string): Promise<string>;
}
