# Comms — mobile app

Expo (React Native) app. See the [root README](../README.md) for the overview.

```sh
npm install
npx expo start        # then scan with Expo Go, or press w for web
npx tsc --noEmit      # typecheck
npx expo lint         # lint
```

## Layout

```
src/
  app/                    expo-router screens
    index.tsx             inbox (filters, pinned, low priority and archive folders)
    chat/[id].tsx         conversation
    folder/[name].tsx     low priority and archive lists
    search.tsx, accounts.tsx, settings.tsx, welcome.tsx, signin.tsx
  components/             chat row (swipe actions), chat list and actions menu, message bubble, avatars
  lib/
    backends/backend.ts   the interface every chat source implements
    backends/demo.ts      offline demo with simulated activity
    backends/matrix.ts    Matrix client-server API client (sync, send, tags, bridges)
    networks.ts           per-network names, colours, icons, bridge bot names
    store.tsx             session, preferences, React hooks over the active backend
```

The UI only talks to `Backend`. To support another transport, implement that interface.

## Matrix specifics

- Network detection reads each room's `m.bridge` state (bridge bot, then protocol id). If that's
  missing, it falls back to the user IDs of bridged contacts.
- Pin maps to `m.favourite`, low priority to `m.lowpriority`, mark unread to `m.marked_unread`,
  and mute to a room push rule with no actions. Archive is stored in room account data
  (`com.comms.archive`) with a timestamp, so new activity un-archives the chat automatically.
- Bridge invites are auto-joined. Bridge management rooms are hidden from the inbox and reached
  from **Accounts**.
