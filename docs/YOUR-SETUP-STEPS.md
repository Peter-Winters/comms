# Your setup steps

Four jobs, all doable in parallel. About 1–2 hours in total, plus waiting for Google's ID check.
When you're done, send Claude the items listed under **Send Claude** at the end.

Website menus change from time to time. If a button has a slightly different name, look for the
closest match.

---

## 1. Buy the domain (Porkbun, about 10 minutes, about €15/year)

1. Go to <https://porkbun.com>.
2. Type the name you chose (for example `usecomms.app`) in the big search box and press Enter.
3. Next to the name, click the **cart** icon, then **Checkout** (top right).
4. Create an account when asked (email and password), then pay.
   - **WHOIS privacy** (hides your home address) is free and on by default. Leave it on.
   - Choose **1 year**, and leave **auto-renew** on so it never lapses.
5. You'll set up the DNS in step 3, once the server exists.

## 2. Create the server (Hetzner, about 30 minutes, about €10–20/month)

### 2a. Make an SSH key on your PC
This is the "key" that lets your PC (and Claude, working on your PC) log into the server without a
password.

1. In VS Code, open **Terminal → New Terminal**.
2. Run:
   ```
   ssh-keygen -t ed25519 -C "comms-server"
   ```
3. Press **Enter** three times: default location, and no passphrase. A passphrase would stop
   Claude from connecting automatically.
4. Copy the *public* half to your clipboard:
   ```
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
   ```
   Never share the other file (`id_ed25519` without `.pub`). It's the private key.

### 2b. Sign up
1. Go to <https://www.hetzner.com/cloud> and click **Sign up** (or **Register**).
2. Enter your email, confirm it from the email they send, then fill in your address and payment
   details. New accounts sometimes need ID verification or a small prepayment. Follow their prompts.
3. Once in, you're at the **Cloud Console** (<https://console.hetzner.cloud>).

### 2c. Create a project and add your key
1. Click **+ New project**, name it `comms`, then click the project to open it.
2. In the left sidebar, click **Security**, then the **SSH keys** tab, then **Add SSH key**.
3. Paste (Ctrl+V) the key you copied in 2a, name it `comms-pc`, and click **Add SSH key**.

### 2d. Create the firewall
1. Left sidebar: **Firewalls → Create Firewall**.
2. Name: `comms-web`.
3. Under **Inbound rules** there are already rules for SSH (port 22) and ICMP. Keep them. Add:
   - **TCP**, port **80**, sources Any IPv4 and Any IPv6
   - **TCP**, port **443**, sources Any IPv4 and Any IPv6
   - **UDP**, port **443**, sources Any IPv4 and Any IPv6
4. Leave "Apply to" empty for now, then click **Create Firewall**.

### 2e. Create the server
1. Left sidebar: **Servers → Add Server**.
2. Choose:
   - **Location:** Falkenstein, Nuremberg or Helsinki (all in the EU)
   - **Image:** Ubuntu **24.04**
   - **Type:** **Shared vCPU**, **x86** (Intel/AMD), the option with **4 vCPU and 8 GB RAM**
   - **Networking:** leave **Public IPv4** and **Public IPv6** both ticked
   - **SSH keys:** tick **comms-pc**
   - **Volumes:** none
   - **Firewalls:** tick **comms-web**
   - **Backups:** tick it (about 20% extra; nightly copies of the whole server)
   - **Name:** `comms-prod`
3. Click **Create & Buy now**. After about a minute it shows as running.
4. In the **Servers** list, note the **IPv4 address** (four numbers like `91.98.12.34`).
   Click the server, then **Networking**, to see the **IPv6** address too.

## 3. Point the domain at the server (Porkbun, about 5 minutes)

1. On Porkbun, click **Account → Domain Management**.
2. Find your domain and click **DNS** (or the small "DNS records" link under it).
3. **Delete** the records Porkbun added for its parking page (usually an ALIAS and a CNAME
   pointing at `pixie.porkbun.com`): click the bin icon next to each.
4. Add four records, one at a time, using the form at the top (leave TTL at the default):

   | Type | Host | Answer |
   | --- | --- | --- |
   | A | `matrix` | your IPv4 address |
   | AAAA | `matrix` | your IPv6 address |
   | A | *(leave empty)* | your IPv4 address |
   | AAAA | *(leave empty)* | your IPv6 address |

   Click **Add** after each one.

## 4. Push notifications (Firebase, about 10 minutes, free)

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it `Comms` and continue.
   When asked about **Google Analytics**, switch it **off**, then **Create project**. Click **Continue**.
3. On the project overview page, click the **Android** icon (or **+ Add app → Android**).
   - **Android package name:** `com.pfwin.comms` (exactly this)
   - **App nickname:** `Comms`
   - Leave the SHA-1 box empty, then click **Register app**.
4. Click **Download google-services.json** and save it into
   `C:\Users\pfwin\Code\Comms\mobile\`. Then click **Next**, **Next**, **Continue to console**
   and skip the code steps, which Claude handles.
5. Click the **gear icon** (top left, next to "Project Overview") → **Project settings** → the
   **Service accounts** tab → **Generate new private key** → **Generate key**. A second JSON file
   downloads.
6. Move that second file somewhere safe **outside the code folder**, for example
   `C:\Users\pfwin\Documents\keys\`. It's a password. Don't email or upload it anywhere.

## 5. Google Play developer account (about 20 minutes, then a few days' wait)

1. Go to <https://play.google.com/console/signup> and sign in with the Google account that will
   own the app. A dedicated account (for example a new Gmail for Comms) keeps it separate from your
   personal one.
2. Choose **Yourself** (a personal account). Choose an organisation only if you've formed a company.
3. Fill in:
   - **Developer name:** shown publicly on the Play Store (your name or "Comms")
   - Contact email, phone, and whether you've built Android apps before
4. Pay the **US$25** one-off fee.
5. Complete **identity verification** (upload photo ID) and phone verification. Google may also ask
   you to install the **Play Console** app on your Android phone to confirm you own an Android
   device.
6. Wait for the "account verified" email. It usually takes a few days. Don't create the app
   listing yet; Claude will walk you through it with the first build.

---

## Send Claude

- [ ] The **domain** you bought
- [ ] The server's **IPv4** (and IPv6) address
- [ ] "SSH key added" (just confirm; never send the private key)
- [ ] "google-services.json is in the mobile folder"
- [ ] Where you saved the Firebase **service account key** (just the path)
- [ ] When Google Play says your account is verified
