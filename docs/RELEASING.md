# Releasing Comms

## How changes ship

| What you do | What happens |
| --- | --- |
| Open a pull request | GitHub Actions checks it: app typecheck, lint and tests; server scripts and compose file. |
| Merge to `main` | EAS Workflows (`mobile/.eas/workflows/deploy-preview.yml`) re-runs the checks, then ships to testers. JavaScript-only changes go out as an over-the-air update to the `preview` channel (testers get them next time the app opens). If native code changed, it builds a new preview APK instead. |
| Push a `v*` tag | `release.yml` builds a signed app bundle and submits it to the Google Play **internal testing** track (or, if native code didn't change, sends an over-the-air update to production installs). |
| Promote in Play Console | Internal → closed → open testing → production, by hand. |

The *fingerprint* (a hash of everything that ends up in the native app: native modules, permissions,
`app.json`) decides between an update and a build. An over-the-air update can only reach apps whose
fingerprint matches, so it can never break an installed app's native code.

```sh
# Cut a release
git tag v1.1.0
git push origin v1.1.0
```

## One-time setup

### GitHub
1. Create an empty private repository and push this one to it.
2. Optional, needs GitHub Pro for private repos: protect `main` so pull requests must pass CI.

### Expo (EAS)
1. expo.dev → project **comms** → *GitHub* → install the Expo GitHub app and connect the repository.
2. Set the **base directory** to `mobile` (the app isn't at the repository root).
3. That's it: workflows in `mobile/.eas/workflows` now run on pushes and tags.

### Google Play (before the first `v*` tag)
1. Create a Google Play developer account (one-off US$25, plus identity verification).
2. Create the app with package name `com.pfwin.comms`.
3. **Upload the first bundle by hand.** Google requires the first upload through the Play Console:
   run `npx eas-cli build -p android --profile production` and upload the `.aab`.
4. Create a Google Cloud service account with access to the Play Console, download its JSON key,
   and upload it to EAS: `npx eas-cli credentials -p android` → *Google Service Account* →
   *Play Store submissions*. From then on `release.yml` submits automatically.
5. New personal developer accounts must run a **closed test with at least 12 testers for 14 days**
   before Google allows a production release. Plan for this.

### Push notifications
Firebase project with an Android app for `com.pfwin.comms`; `google-services.json` in `mobile/`;
the FCM V1 service-account key uploaded with `npx eas-cli credentials -p android`. See the root README.

## Before a public Play Store release

The app currently talks to a server each user runs themselves. A public, hosted service (users
just sign up) needs, roughly in order:

1. **Infrastructure.** A cloud server (or cluster) with a domain and HTTPS. Then turn off
   `usesCleartextTraffic` in `app.json`, which only exists for Tailscale/home use.
2. **Accounts.** Sign-up and login in the app (Synapse registration with email verification),
   password reset, and account deletion, which Google Play requires.
3. **Multi-user bridges.** The mautrix bridges already support many users per bridge; permissions,
   rate limits and resource sizing need to be set for strangers, not just you.
4. **Encryption between app and server.** When you host everyone's messages, end-to-end encryption
   from the app to the bridges (as Beeper does) is what keeps them out of reach of the server
   operator and attackers. This becomes worth its complexity once the server isn't yours alone.
5. **Server CI/CD.** Build and deploy the server stack from GitHub (staging, then production),
   pin bridge versions, back up databases, and monitor.
6. **Legal and policy.** Privacy policy and Play *Data safety* form; terms of service; GDPR (you
   process EU users' messages); and the risk that WhatsApp, Meta and others suspend accounts that
   connect through unofficial clients. Google Play's policies on apps that access other apps'
   messages need a careful read before submission.
7. **Play policy items in this app.** Justify or remove the `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
   permission; fill in the content rating; provide screenshots and a store listing.
