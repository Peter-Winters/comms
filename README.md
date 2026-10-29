# Comms

One inbox for every chat app: a Beeper-style unified messenger that you host yourself.

```
 ┌────────────┐  HTTPS / Tailscale  ┌───────┐   ┌─────────┐  appservice  ┌──────────────────┐
 │ Android app│ ──────────────────▶ │ Caddy │──▶│ Synapse │ ◀──────────▶ │ mautrix bridges  │──▶ WhatsApp, Signal,
 │ (Expo / RN)│ ◀── push ── Expo ◀──┤       │   └────┬────┘              │ (one per network)│    Messenger, SMS, …
 └────────────┘                     └───┬───┘        │ push              └──────────────────┘
                                        │      ┌─────▼──────┐                    ▲
                                        └─────▶│ push gateway│    native login / contacts (provisioning API)
                                               └────────────┘
```

Like Beeper, Comms is a Matrix client. Each chat network is connected through a
[mautrix bridge](https://docs.mau.fi/bridges/) running on your own server. The bridge logs in to
WhatsApp, Signal and the rest as you and mirrors every conversation into Matrix. The app shows them
all as one inbox.

| Folder | What it is |
| --- | --- |
| [mobile/](mobile/) | The Android app (Expo / React Native). |
| [server/](server/) | Docker Compose stack: Caddy, Synapse, Postgres, a push gateway, and the bridges. |

## Features

- **One inbox** with filters for All, Unread, and each network; pinned chats, Low priority, and
  Archive (archived chats come back when someone replies)
- **Swipe** right to toggle read, swipe left to archive. **Long-press** to pin, mute, mark unread,
  or move to low priority.
- **Native account setup:** QR codes, pairing codes and phone logins happen in the app. For
  Messenger, Instagram and Slack you log in on the service's own website inside the app, and Comms
  picks up the session.
- **New chats:** pick a network and search your contacts, or type a phone number or username
- **Rich messages:** photos, videos, files, and voice notes (sent and received), replies,
  reactions, edits, read receipts, and full-screen media viewing
- **Push notifications**, with an option to keep message text off Google's and Expo's servers
- **Instant start:** chats are cached on the phone, so the inbox appears immediately
- Search across everything, light and dark themes, and a built-in demo mode

## Put it on your phone

You need:

- **This PC:** Docker Desktop and Node.js (both already installed)
- **Your phone:** Android, with [Tailscale](https://tailscale.com/download/android) (free)
- **Accounts:**
  - a free [Expo](https://expo.dev/signup) account, to build the app in the cloud
  - a free [Firebase](https://console.firebase.google.com) project, for push notifications only

### 1. Server

```sh
cd server
cp .env.example .env    # set passwords; choose bridges in COMPOSE_PROFILES
npm install
npm run setup
```

Install Tailscale on this PC and on your phone, and sign in to both with the same account. Re-run
`npm run setup`. It prints a `http://100.x.y.z:8008` address, which is the one to use in the app.
It works from anywhere, because Tailscale encrypts the connection between your phone and PC.

### 2. Build and install the app

```sh
cd mobile
npx eas-cli login                                   # once
npx eas-cli init                                    # once; links the project to your Expo account
npx eas-cli build -p android --profile preview      # ~15 min in Expo's cloud
```

When the build finishes, open the link it prints on your phone (or scan its QR code) and install
the APK. Android will ask you to allow installs from your browser.

### 3. Turn on push notifications (optional, about 10 minutes)

1. In the [Firebase console](https://console.firebase.google.com), create a project and add an
   **Android app** with the package name `com.pfwin.comms`.
2. Download `google-services.json` and put it in `mobile/`.
3. In Firebase, go to *Project settings → Service accounts → Generate new private key*.
4. Run `npx eas-cli credentials -p android` and choose *Google Service Account → Push
   Notifications (FCM V1)*, then upload that key file.
5. Rebuild the app (step 2) and reinstall.

### 4. Use it

Open Comms and tap **Connect your server**. Enter the Tailscale address, `admin`, and the
password from `server/.env`. Then tap the grid icon (Accounts) and connect your networks.

## Security model

- **Phone ↔ server:** encrypted by Tailscale (WireGuard), or by HTTPS if you put Caddy on a
  public domain.
- **Server ↔ chat networks:** each bridge uses the network's own encryption. WhatsApp and Signal
  stay end-to-end encrypted up to your server.
- **On your server:** messages are stored decrypted in Postgres, on your own machine. Beeper adds
  Matrix end-to-end encryption between the app and the bridges because Beeper runs the servers.
  When you host the bridges yourself, their encryption keys sit on the same machine as the
  database, so that extra layer protects very little. That's why it isn't implemented. Protect
  the server: keep it patched, encrypt the disk, back up `server/data/`.
- **Push notifications:** with `PUSH_CONTENT=full`, the sender and message preview pass through
  Expo and Google to reach your phone. Set `PUSH_CONTENT=private` to send only "New message from X".

## Development

```sh
cd mobile && npm install && npx expo start    # press w for a browser; "Try the demo" needs no server
npx tsc --noEmit && npx expo lint             # typecheck + lint
```

Push notifications, voice recording, cookie login and the media pickers need the installed
Android app. They aren't available in a browser or in Expo Go.
