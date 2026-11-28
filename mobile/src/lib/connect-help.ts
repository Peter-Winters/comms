import type { NetworkId } from './types';

// What to do in the other app while connecting it. Menu names are the apps' own (Android first).

export type PairingHelp = {
  steps: string[];
  /** Opens the other app, so you can switch to it in one tap. */
  open?: { label: string; url: string };
  note?: string;
};

type DisplayType = 'qr' | 'code' | 'emoji' | 'nothing';

const SAME_PHONE_QR =
  'A QR code needs a second screen. If Comms is on the phone you scan with, open Comms on another device to show the code, or use another way to log in if there is one.';

export function pairingHelp(network: NetworkId, display: DisplayType): PairingHelp | null {
  switch (network) {
    case 'whatsapp':
      if (display === 'code')
        return {
          steps: [
            'Tap the code above to copy it, then tap Open WhatsApp.',
            'In WhatsApp, tap ⋮ (top right) → Linked devices → Link a device. On iPhone: Settings → Linked devices.',
            'Confirm with your fingerprint or PIN if asked, then tap “Link with phone number instead” at the bottom.',
            'Type or paste the code, then come back to Comms. It finishes by itself.',
          ],
          open: { label: 'Open WhatsApp', url: 'whatsapp://' },
        };
      if (display === 'qr')
        return {
          steps: [
            'On the phone with WhatsApp, tap ⋮ (top right) → Linked devices → Link a device.',
            'Point the camera at the code above.',
          ],
          note: SAME_PHONE_QR,
        };
      return null;

    case 'signal':
      if (display === 'qr')
        return {
          steps: [
            'On the phone with Signal, tap your profile picture → Linked devices.',
            'Tap + (Link new device) and point the camera at the code above.',
          ],
          note: SAME_PHONE_QR,
        };
      return null;

    case 'gmessages':
      if (display === 'qr')
        return {
          steps: [
            'Open Google Messages on your phone and tap your profile picture (top right).',
            'Tap Device pairing → QR code scanner, and point the camera at the code above.',
          ],
          note: SAME_PHONE_QR,
        };
      if (display === 'emoji')
        return {
          steps: [
            'Google Messages on your phone shows a notification or a pairing screen.',
            'Tap the emoji that matches the one above, then come back to Comms.',
          ],
          open: { label: 'Open Messages', url: 'sms:' },
        };
      return null;

    case 'telegram':
      if (display === 'qr')
        return {
          steps: ['In Telegram, open Settings → Devices → Link Desktop Device.', 'Point the camera at the code above.'],
          note: SAME_PHONE_QR,
        };
      return null;

    case 'discord':
      if (display === 'qr')
        return {
          steps: ['In the Discord app, tap your profile picture → Scan QR Code.', 'Point the camera at the code above.'],
          note: SAME_PHONE_QR,
        };
      return null;

    default:
      return null;
  }
}

/** A line shown above a phone-number box, saying what happens next. */
export function phoneHelp(network: NetworkId): string | undefined {
  switch (network) {
    case 'whatsapp':
      return 'Enter the number your WhatsApp uses. Comms then shows a code for you to type into WhatsApp. You won’t get a text message.';
    case 'signal':
      return 'Enter the number your Signal uses.';
    case 'telegram':
      return 'Enter the number your Telegram uses. Telegram sends a login code to your Telegram app.';
    default:
      return undefined;
  }
}
