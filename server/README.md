# Comms server

Runs with Docker Compose:

- **Caddy**: the only exposed port. It routes the Matrix API to Synapse and each bridge's
  provisioning API (used by the app's native login screens) to that bridge.
- **Synapse + Postgres**: the Matrix homeserver.
- **Push gateway**: forwards Synapse's push notifications to phones through Expo
  ([pushgateway/gateway.mjs](pushgateway/gateway.mjs)).
- **One [mautrix](https://docs.mau.fi/bridges/) bridge per chat network.**

## Setup

Requirements: Docker Desktop (or Docker Engine) and Node.js 18+.

```sh
cd server
cp .env.example .env     # then edit it: passwords, which bridges to run
npm install
npm run setup
```

`npm run setup` does the following:

1. Generates the Synapse config and creates a database for Synapse and each bridge.
2. Configures each bridge: homeserver, database, permissions, history backfill, double puppeting,
   and the provisioning API.
3. Registers every bridge with Synapse.
4. Writes the Caddy routing and the app's discovery document (`/_comms/config`).
5. Starts everything and creates your user.

It's safe to re-run, for example after enabling more bridges in `COMPOSE_PROFILES`. At the end it
prints the address to type into the app, preferring your Tailscale address if Tailscale is
installed.

## Networks

| Bridge | Notes |
| --- | --- |
| `whatsapp` | Scan a QR code or use a pairing code |
| `signal` | Scan a QR code (Signal → Linked devices) |
| `telegram` | Phone number and code. Needs `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` from https://my.telegram.org/apps |
| `messenger` | Log in on messenger.com inside the app, or with username and password |
| `gmessages` | Google Messages (SMS/RCS): scan a QR code in Messages → Device pairing |
| `gvoice` | Google Voice |
| `discord` | Older bridge type: you log in by chatting with the bridge bot instead of a native screen |
| `slack`, `linkedin`, `twitter`, `bluesky` | Log in through the website or with a token |
| `instagram` | **Experimental.** Current Meta bridge releases dropped Instagram, so this pins the last one that had it (v0.5.2, July 2025). It may break as Instagram changes. If this server previously ran a newer Meta bridge as `instagram`, drop its `instagram` database first. |

## Day to day

```sh
npm run logs    # follow all logs
npm run down    # stop
npm run up      # start
```

Everything lives in `server/data/`. Back that folder up; deleting it resets the server.

## Notes

- **Reaching the server from your phone:** the Android app allows plain `http://` so that it works
  over Tailscale (which encrypts the connection itself) and your home network. For a public server,
  put HTTPS in front: run `tailscale serve --bg 8008`, or point a domain at Caddy.
- **Push content:** `PUSH_CONTENT=full` (the default) shows the sender and message text in
  notifications. That text passes through Expo and Google's push service. Set
  `PUSH_CONTENT=private` to show only "New message from X".
- **Encryption:** bridges run with Matrix encryption off. See "Security model" in the
  [root README](../README.md).
- `DOMAIN` is baked into every user ID and can't be changed after the first setup without deleting
  `data/`.
