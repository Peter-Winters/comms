// Minimal Matrix push gateway: Synapse POSTs /_matrix/push/v1/notify, we forward to Expo's
// push service, which delivers through Firebase (Android) or APNs (iOS).
// https://spec.matrix.org/latest/push-gateway-api/

import { createServer } from 'node:http';

const PORT = 5000;
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
// "full" shows sender and message text; "private" only says that a message arrived, so no
// message content passes through Expo/Google/Apple.
const PRIVATE = process.env.PUSH_CONTENT === 'private';
const EXPO_TOKEN = process.env.EXPO_ACCESS_TOKEN;

function describe(n) {
  const sender = n.sender_display_name || n.sender || 'Someone';
  const isGroup = n.room_name && n.room_name !== n.sender_display_name;
  if (PRIVATE || !n.content) {
    return { title: 'Comms', body: isGroup ? `New message in ${n.room_name}` : `New message from ${sender}` };
  }
  const c = n.content;
  let text = c.body ?? '';
  if (c.msgtype === 'm.image') text = '📷 Photo';
  else if (c.msgtype === 'm.video') text = '🎥 Video';
  else if (c.msgtype === 'm.audio') text = c['org.matrix.msc3245.voice'] ? '🎤 Voice message' : '🎵 Audio';
  else if (c.msgtype === 'm.file') text = `📎 ${c.body ?? 'File'}`;
  else if (n.type === 'm.room.encrypted') text = 'Encrypted message';
  return isGroup ? { title: n.room_name, body: `${sender}: ${text}` } : { title: sender, body: text };
}

async function notify(n) {
  const devices = n.devices ?? [];
  // Count-only updates (no event) just tell us a chat was read elsewhere; nothing to show.
  if (!n.event_id || devices.length === 0) return [];
  const { title, body } = describe(n);
  const messages = devices.map((d) => ({
    to: d.pushkey,
    title,
    body,
    data: { room_id: n.room_id, event_id: n.event_id },
    sound: d.tweaks?.sound ? 'default' : undefined,
    channelId: 'messages',
    priority: 'high',
    badge: n.counts?.unread,
  }));
  const res = await fetch(EXPO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(EXPO_TOKEN ? { Authorization: `Bearer ${EXPO_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('expo push failed', res.status, JSON.stringify(json));
    return [];
  }
  // Tell Synapse to drop pushers whose app was uninstalled.
  const rejected = [];
  (json.data ?? []).forEach((ticket, i) => {
    if (ticket.status === 'error') {
      console.error('expo ticket error', ticket.message, ticket.details?.error);
      if (ticket.details?.error === 'DeviceNotRegistered') rejected.push(devices[i].pushkey);
    }
  });
  return rejected;
}

createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/_matrix/push/v1/notify') {
    res.writeHead(404).end();
    return;
  }
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', async () => {
    let rejected = [];
    try {
      rejected = await notify(JSON.parse(raw).notification ?? {});
    } catch (e) {
      console.error('notify error', e);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ rejected }));
  });
}).listen(PORT, () => console.log(`push gateway listening on :${PORT} (content: ${PRIVATE ? 'private' : 'full'})`));
