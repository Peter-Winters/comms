# Moving the server to the cloud

Goal: run the Comms server on a rented EU server with a real domain and HTTPS, deployed from
GitHub, instead of on a home PC reached over Tailscale.

Plan: start on **Hetzner Cloud** (cheap, EU, generous bandwidth). Everything runs in Docker, so
moving to Azure later (for example with startup credits, or for its Dublin region) is a migration,
not a rebuild.

## Part 1: what you do (about an hour, needs your card)

### 1. Pick the name and buy a domain
The domain becomes part of every user's ID (for example `@peter:getcomms.app`) and **can't be
changed later** without resetting all accounts, so choose something you're happy to keep.

- Buy it from an at-cost registrar such as **Cloudflare Registrar** or **Porkbun** (a `.app`
  domain is about €15/year). Turn on auto-renew.
- Check the name isn't already used by another messaging app or trademark.

### 2. Create the server on Hetzner
1. Sign up at <https://www.hetzner.com/cloud> and create a project called `comms`.
2. Make an SSH key on this PC (it lets the server recognise you without a password). In a
   terminal: `ssh-keygen -t ed25519 -C "comms-server"`, press Enter at each question, then add
   the contents of `C:\Users\pfwin\.ssh\id_ed25519.pub` in Hetzner under *Security → SSH keys*.
3. *Add server* with:
   - **Location:** Falkenstein, Nuremberg or Helsinki (all EU)
   - **Image:** Ubuntu 24.04
   - **Type:** shared vCPU with **4 vCPU and 8 GB RAM** (about €8–20/month depending on the line).
     Enough for the bridges and a few dozen users; it can be resized later in a couple of minutes.
   - **Networking:** public IPv4 and IPv6
   - **SSH key:** the one you just added
   - **Backups:** on (about 20% extra; nightly snapshots of the whole server)
   - **Name:** `comms-prod`
4. *Firewalls → Create firewall* allowing inbound TCP **22** (SSH), **80** and **443** (web), and
   UDP **443**. Apply it to `comms-prod`.

### 3. Point the domain at the server
In your registrar's DNS settings, add (replace the IPs with the server's, shown in Hetzner):

| Type | Name | Value |
| --- | --- | --- |
| A | `matrix` | server IPv4 |
| AAAA | `matrix` | server IPv6 |
| A | `@` (the bare domain) | server IPv4 |

If you use Cloudflare, set these records to **DNS only** (grey cloud), not proxied.

### 4. Send Claude
- the domain
- the server's IPv4 address
- confirmation that the SSH key is added (never send the private key `id_ed25519`)

## Part 2: what Claude does

1. **Harden the server:** a non-root admin user, SSH key-only login, firewall, automatic
   security updates, and fail2ban against password guessing.
2. **Install Docker** and deploy the stack with **automatic HTTPS** (Caddy gets and renews
   certificates itself). Public sign-up stays **off** until the app has its own sign-up screen.
3. **Deploy from GitHub:** a workflow that updates the server whenever server changes merge to
   `main`, using a deploy key stored as a GitHub secret.
4. **Backups beyond snapshots:** nightly database dumps copied off the server (Hetzner Storage
   Box, about €4/month).
5. **Monitoring:** an uptime check that emails you if the server or a bridge goes down.
6. **Point the app at the new server** and switch off its plain-HTTP exception (only HTTPS from now on).

## Part 3: switching over

The new server starts empty: new user IDs on your domain, and each chat network connected again
(scan the WhatsApp QR code again and so on). Chat history comes back through the bridges' history
sync, like the first time. Once you're happy, the PC server can be switched off.

## In parallel (no need to wait)

- **Push notifications:** the Firebase setup in `README.md` (about 10 minutes).
- **Google Play developer account:** decide personal (US$25, needs 12 testers for 14 days before
  public release) or organisation (needs a free D-U-N-S number; no 12-tester rule).
- **Privacy policy:** start a draft. It will need a lawyer's review before public launch.

## Running costs at this stage

| Item | Cost |
| --- | --- |
| Hetzner server (4 vCPU, 8 GB) | about €8–20/month |
| Server backups | about 20% of the server price |
| Storage Box for database dumps | about €4/month |
| Domain | about €15/year |
| Google Play account (once) | US$25 |
