import type { NetworkId } from './types';

export type NetworkInfo = {
  id: NetworkId;
  name: string;
  color: string;
  /** FontAwesome6 icon name. */
  icon: string;
  iconStyle: 'brand' | 'solid';
  /** Localpart of the bridge bot on the homeserver, if this network is bridged. */
  botLocalpart?: string;
  /** Protocol ids reported by bridges in m.bridge state events. */
  protocolIds: string[];
  /** Prefixes bridges use for puppet user localparts. */
  puppetPrefixes: string[];
};

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  whatsapp: {
    id: 'whatsapp', name: 'WhatsApp', color: '#25D366', icon: 'whatsapp', iconStyle: 'brand',
    botLocalpart: 'whatsappbot', protocolIds: ['whatsapp'], puppetPrefixes: ['whatsapp_'],
  },
  signal: {
    id: 'signal', name: 'Signal', color: '#3A76F0', icon: 'signal-messenger', iconStyle: 'brand',
    botLocalpart: 'signalbot', protocolIds: ['signal'], puppetPrefixes: ['signal_'],
  },
  telegram: {
    id: 'telegram', name: 'Telegram', color: '#2AABEE', icon: 'telegram', iconStyle: 'brand',
    botLocalpart: 'telegrambot', protocolIds: ['telegram'], puppetPrefixes: ['telegram_'],
  },
  instagram: {
    id: 'instagram', name: 'Instagram', color: '#E1306C', icon: 'instagram', iconStyle: 'brand',
    botLocalpart: 'instagrambot', protocolIds: ['instagram'], puppetPrefixes: ['instagram_'],
  },
  messenger: {
    id: 'messenger', name: 'Messenger', color: '#0084FF', icon: 'facebook-messenger', iconStyle: 'brand',
    botLocalpart: 'messengerbot', protocolIds: ['facebook', 'messenger', 'facebook-messenger'], puppetPrefixes: ['messenger_', 'facebook_'],
  },
  gmessages: {
    id: 'gmessages', name: 'Text messages (SMS)', color: '#1A73E8', icon: 'comment-sms', iconStyle: 'solid',
    botLocalpart: 'gmessagesbot', protocolIds: ['gmessages', 'googlemessages'], puppetPrefixes: ['gmessages_'],
  },
  gvoice: {
    id: 'gvoice', name: 'Google Voice', color: '#188038', icon: 'phone', iconStyle: 'solid',
    botLocalpart: 'gvoicebot', protocolIds: ['gvoice', 'googlevoice'], puppetPrefixes: ['gvoice_'],
  },
  discord: {
    id: 'discord', name: 'Discord', color: '#5865F2', icon: 'discord', iconStyle: 'brand',
    botLocalpart: 'discordbot', protocolIds: ['discord', 'discordgo'], puppetPrefixes: ['discord_'],
  },
  slack: {
    id: 'slack', name: 'Slack', color: '#4A154B', icon: 'slack', iconStyle: 'brand',
    botLocalpart: 'slackbot', protocolIds: ['slack', 'slackgo'], puppetPrefixes: ['slack_'],
  },
  linkedin: {
    id: 'linkedin', name: 'LinkedIn', color: '#0A66C2', icon: 'linkedin', iconStyle: 'brand',
    botLocalpart: 'linkedinbot', protocolIds: ['linkedin'], puppetPrefixes: ['linkedin_'],
  },
  twitter: {
    id: 'twitter', name: 'X', color: '#14171A', icon: 'x-twitter', iconStyle: 'brand',
    botLocalpart: 'twitterbot', protocolIds: ['twitter'], puppetPrefixes: ['twitter_'],
  },
  bluesky: {
    id: 'bluesky', name: 'Bluesky', color: '#1185FE', icon: 'bluesky', iconStyle: 'brand',
    botLocalpart: 'blueskybot', protocolIds: ['bluesky'], puppetPrefixes: ['bluesky_'],
  },
  imessage: {
    id: 'imessage', name: 'iMessage', color: '#34C759', icon: 'apple', iconStyle: 'brand',
    botLocalpart: 'imessagebot', protocolIds: ['imessage', 'imessagego'], puppetPrefixes: ['imessage_'],
  },
  matrix: {
    id: 'matrix', name: 'Matrix', color: '#0DBD8B', icon: 'hashtag', iconStyle: 'solid',
    protocolIds: [], puppetPrefixes: [],
  },
};

/** Networks offered on the "Accounts" screen, in display order. */
export const CONNECTABLE_NETWORKS: NetworkId[] = [
  'whatsapp', 'signal', 'telegram', 'messenger', 'instagram', 'gmessages', 'gvoice', 'discord',
  'slack', 'linkedin', 'twitter', 'bluesky',
];

export function networkFromProtocol(protocolId: string): NetworkId | undefined {
  const id = protocolId.toLowerCase();
  return (Object.values(NETWORKS).find((n) => n.protocolIds.includes(id)) ?? undefined)?.id;
}

export function networkFromUserId(userId: string): NetworkId | undefined {
  const localpart = userId.replace(/^@/, '').split(':')[0].toLowerCase();
  for (const n of Object.values(NETWORKS)) {
    if (n.botLocalpart === localpart) return n.id;
    if (n.puppetPrefixes.some((p) => localpart.startsWith(p))) return n.id;
  }
  return undefined;
}

export function networkFromBotUserId(userId: string): NetworkId | undefined {
  const localpart = userId.replace(/^@/, '').split(':')[0].toLowerCase();
  return Object.values(NETWORKS).find((n) => n.botLocalpart === localpart)?.id;
}
