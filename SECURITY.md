# Paylez security guide

*Written 2026-10-09. Covers the API server (`server/`), the website (`src/`),
the Flutter app (`Pay-lez mobile`), the VPS and Supabase.*

This guide is for the owner, not for a security specialist. It has three parts:

1. **What we found and what is already fixed in code.** You do nothing here
   except deploy.
2. **What only you can do.** These are dashboard settings and server commands.
   Each one says why it matters in one line.
3. **Habits to keep.**

No secrets appear in this file.

---

## The short version

The system was in better shape than most. The database lockdown (RLS) already
existed and is applied automatically. Passwords are hashed properly, and there
are rate limits on almost everything.

This pass found **one high-severity issue** and fixed it in code: anyone holding
a guest's account id could take that guest's points. It also found a handful
of medium issues, all fixed in code.

The biggest risks that remain are **outside the code**:

- the VPS is managed as `root`;
- the Supabase dashboard and the other accounts need 2-step login;
- the backups have never been test-restored;
- the Android release signing key does not exist yet.

Part 2 covers each of these.

**Nothing below is live until the server and the app are deployed.** The whole
tree is uncommitted pending your review, as before.

---

## Part 1: findings

Severity scale:

- **High:** someone could take money, points or data today.
- **Medium:** a real hole, but it needs a precondition.
- **Low:** hardening.

### 1.1 Database (Supabase Postgres)

| Finding | Severity | Status |
|---|---|---|
| Supabase publishes a public "anon" key and serves every table in `public` over its REST API (PostgREST). A table with no row-level security (RLS) can be read by anyone with the project URL. | would be High | **Already closed.** `server/db/rls.pg.sql` enables RLS on all 100 tables, with no policies, and revokes every grant from `anon` and `authenticated`. It runs on every boot (`server/db/pg.ts`, `migrate()`), so a new table is locked the moment it exists. `verify.ts` checks that every table in the schema is covered. Re-checked in this pass: 100 of 100. |
| Is the anon key used anywhere (website bundle, app)? | none | No. Neither client talks to Supabase. Only the server does. |
| Which role does the server connect as? | info | The pooler's `postgres` role, which owns the tables, so RLS does not block the server itself. `rls.pg.sql` refuses to run as a role that would lock the server out. |
| SQL injection | none found | Every query uses `$name` parameters. Each place a table or column name is put into SQL takes it from a fixed list, never from a request. |
| TLS to Supabase | good | The connection is verified against Supabase's own root CA (`server/db/supabase-ca.crt`). It is not set to "accept anything". |

### 1.2 API server

| # | Finding | Severity | Status |
|---|---|---|---|
| S1 | **Taking over a guest's points.** Sign-up and Google sign-in accepted a `provisionalId` and merged that guest into the new account. The only check was that the target was a guest. Anyone who learned a guest's `usr_…` id could take their points, game history and username. | **High** | **Fixed.** A guest is merged only when the request is signed in as that guest (`ownGuest` in `server/http/routes/auth.ts`). The app already sends that token. Tested both ways in `verify.ts`. |
| S2 | **Server-side request forgery through venue photos.** A venue owner sets `imageUrl`, and the server fetches it. It would fetch internal addresses such as `127.0.0.1`, `10.x`, the cloud metadata address `169.254.169.254`, and redirects to them. | Medium | **Fixed.** Every hop of the fetch is checked: the hostname is resolved and refused if any address is private, loopback or link-local, with redirects followed by hand (`isPublicUrl` in `server/domain/media.ts`). |
| S3 | Any signed-in user could read any assistant conversation by its id (`GET /v1/assistant/sessions/:id`). | Medium (ids are random, 80 bits) | **Fixed.** Scoped to the owner. |
| S4 | Any partner could write into, or overwrite the draft of, another account's assistant conversation by its id (`/v1/partner/venues/:id/assistant/ask` and `/draft`). | Medium | **Fixed.** Both now call `partnerConversation`, which checks the user and the venue. |
| S5 | `GET /v1/deals/:id` is public and returned **draft** deals, including promo code, caps and spend. | Medium | **Fixed.** Drafts answer 404. Paused and expired deals stay readable, because customers hold links and passes to them. |
| S6 | Sign-in was throttled per email address only. One machine could try one common password against thousands of addresses ("password spraying"). | Medium | **Fixed.** Added 60 sign-ins per hour per connection, on top of the per-address limit. |
| S7 | The session cookie was marked `Secure` only when `NODE_ENV=production`, and nothing sets that on the VPS. | Low (nginx serves https only) | **Fixed.** The cookie is also `Secure` whenever a Postgres URL is configured. You should still set `NODE_ENV=production` (Part 2). |
| S8 | No security headers on API responses. | Low | **Fixed.** Every response now carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and HSTS. The image route keeps its own caching. |
| S9 | The server only *warned* when `PAYLEZ_SECRET` was missing. That key signs QR codes, and the default is in the repo. | Low (production has it set) | **Fixed.** The server now refuses to start with the repo's default key when it is connected to Postgres or `NODE_ENV=production`. |
| S10 | The `x-request-id` header was echoed back and logged whatever it contained. | Low | **Fixed.** Echoed only if it looks like an id (64 characters at most). |
| S11 | `GET /v1/media/constructor/x` returned a 500 error. | Low | **Fixed.** |
| S12 | **Friend requests need no consent.** `POST /v1/friends` makes two people friends at once. The victim's friends board then shows their name, avatar and weekly points to anyone who knows their id, even if they opted out of the leaderboard. | Medium | **Not fixed.** It is a product decision: either a request that the other person accepts, or only show friends who opted in. Owner to choose. |
| S13 | **The guest device id works like a password.** `POST /v1/auth/guest` gives back the session of whichever guest first used a given `device` string. The app's id is 128-bit random, so it cannot be guessed. But anyone who reads it off a phone gets that guest. | Low | Not fixed. It is acceptable while guests hold only points. |
| S14 | Web-push subscription endpoints are user-supplied URLs that the server POSTs to. They are https-only, the request is encrypted, and no response comes back. | Low | Not fixed. The firewall step in Part 2 (2.1, step 7) closes what is left. |
| S15 | The minimum password length is 6. | Low | Not changed, because the app and website forms enforce the same number. Recommended: 8, on the server and both clients together. |

**Already right before this pass:**

- **Passwords:** scrypt (N=32768), with a random salt and a constant-time compare.
- **Session tokens:**
  - 256-bit random, stored only as a hash, valid for 30 days;
  - revoked on sign-out, on a password change (all of them) and on a reset.
- **QR codes:** HMAC-signed.
- **Rate limits** on sign-up, guest, Google sign-in, email codes, password reset, username check, avatar upload, games, missions and referrals.
- **Request bodies:**
  - capped at 1 MB, and per route for uploads;
  - avatars checked by their magic bytes, not by the declared type.
- **CORS:** an allow-list, not `*`.
- **Errors:** they return a code and a request id, never a stack trace.
- **Admin routes:** every one of the 51 requires the admin role.
- **Object-level checks:** an object-by-object review found the per-object checks correct across venues, teams, passes, billing, missions, games and gift cards. The bugs in the table above are the exceptions.

### 1.3 Flutter app

| # | Finding | Severity | Status |
|---|---|---|---|
| A1 | The session token was stored in SharedPreferences, a plain XML file. | Medium | **Fixed.** It is now in `flutter_secure_storage` (Android Keystore encryption, iOS Keychain), in `lib/data/api/token_vault.dart`. Existing users are **moved across on first launch and stay signed in.** If a phone's secure store is broken, it falls back to the old place rather than locking the user out. A token left in the iOS Keychain by a previous install is deleted, not revived. Tests: `test/token_vault_test.dart`. |
| A2 | Android backups were on, so the token and device id went into Google Drive and `adb backup`. | Medium | **Fixed.** `allowBackup="false"`, plus `res/xml/data_extraction_rules.xml` for Android 12+, which also blocks device-to-device transfer. |
| A3 | Dart's networking is not covered by Android's cleartext policy, so a release build pointed at `http://` would have sent passwords unencrypted. | Low (the default is https) | **Fixed.** A release build ignores any non-https API address (`ApiConfig.pick`). |
| A4 | Release builds were not obfuscated. | Low | **Documented.** The command is in the app's `CLAUDE.md`, with `--obfuscate --split-debug-info`. Keep the symbols folder for each build. |
| A5 | Screenshots of the redemption-pass QR and the counter QR are possible. | Low | Not changed. A pass is single-use and checked at the till. If you want it, `FLAG_SECURE` can go on those two screens only. |
| A6 | Certificate pinning | not recommended now | If the pinned certificate rotates and the app isn't updated, **every user is locked out**. Let's Encrypt rotates every 90 days. Revisit only if the app ever handles real money. |
| A7 | Score cheating (a modified app sending fake game results) | info | Already mitigated by design: the server replays every move from its own seed and its result is the result, plus energy and hourly caps. **Recommended next step:** Play Integrity (Android) and App Attest (iOS) tokens on `/v1/games/sessions/:id/finish` and on sign-up. The server would verify them with Google and Apple and lower the limits for devices that fail, rather than blocking them. That needs a Google Cloud service account, so it is in Part 2 (2.5). |
| A8 | Invite links and NFC links | ok | Invite codes are checked against a strict pattern before use. The NFC tag code is being written now by another workstream. Its links must get the same pattern check. |
| A9 | Root/jailbreak detection | not recommended | It is easy to bypass and annoys honest users. The server-side checks above are the real defence. |

### 1.4 Website

- `npm audit --omit=dev`: **0 vulnerabilities.**
- No API keys in the bundle. The Google client id there is public by design.
- **Recommended:** security headers for the website itself, set in nginx (2.1, step 5).

### 1.5 Secrets in git

The full history of both repositories was searched for:

- Stripe, Anthropic, Resend and VAPID keys;
- Postgres URLs;
- private keys;
- the `PAYLEZ_SECRET` value.

**No real secret was found.** Every hit was a placeholder, documentation, or the
throwaway `throwaway` / `Admin12345!` test values.

`android/app/google-services.json` is committed. That is normal, but its API key
should be restricted (2.4, step 3).

---

## Part 2: what only you can do

In priority order. Commands are for the VPS over SSH unless they say otherwise.
**Take a backup before each server change** (2.3, step 1).

### 2.1 The VPS

You log in today as `root` with a key, and password login is already off.

1. **Install security updates now and reboot.** The box says "System restart required", which means a patched kernel is waiting.
   ```sh
   apt update && apt full-upgrade -y && reboot
   ```

2. **Turn on automatic security updates.** Security fixes then land without anyone remembering.
   ```sh
   apt install -y unattended-upgrades
   dpkg-reconfigure -plow unattended-upgrades
   ```

3. **Create a personal admin user and stop logging in as root.** A stolen root key is game over. A stolen user key still needs a password for `sudo`.
   ```sh
   adduser yourname
   usermod -aG sudo yourname
   mkdir -p /home/yourname/.ssh
   cp /root/.ssh/authorized_keys /home/yourname/.ssh/
   chown -R yourname:yourname /home/yourname/.ssh
   chmod 700 /home/yourname/.ssh
   ```
   **In a second terminal, check that `ssh yourname@87.106.247.180` works and that `sudo -v` asks for the password.** Then set:
   ```sh
   # /etc/ssh/sshd_config.d/99-paylez.conf
   PermitRootLogin no            # or prohibit-password, if the deploy scripts must keep using root for now
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   MaxAuthTries 3
   ```
   Then run `systemctl reload ssh`. The deploy scripts in `scripts/` use `root@`, so either change them to `yourname@` with `sudo`, or use `prohibit-password` until you do.

4. **Firewall: only SSH and the web are open.** Port 8787, the API's own port, must never be reachable from outside, only through nginx.
   ```sh
   ufw default deny incoming
   ufw default allow outgoing
   ufw allow OpenSSH
   ufw allow 80,443/tcp
   ufw enable
   ```

5. **fail2ban.** Bots trying SSH all day get banned.
   ```sh
   apt install -y fail2ban && systemctl enable --now fail2ban
   ```

6. **nginx.**
   - **HSTS and headers on the website.** Browsers then always use https, and the site can't be framed by a phishing page. Add these to the `www.pay-lez.com` server block:
     ```nginx
     add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
     add_header X-Content-Type-Options nosniff always;
     add_header X-Frame-Options DENY always;
     add_header Referrer-Policy strict-origin-when-cross-origin always;
     ```
   - Also add `server_tokens off;` in the `http {}` block.
   - Test a `Content-Security-Policy` in `Content-Security-Policy-Report-Only` mode first. The site loads Google sign-in, map tiles and fonts, so a strict policy written blind would break it.
   - Check that the certificate auto-renews:
     ```sh
     certbot renew --dry-run
     ```
   - Check the TLS grade at <https://www.ssllabs.com/ssltest/> for both `www.pay-lez.com` and `api.pay-lez.com`. Aim for A.

7. **Optional: limit what the server process can reach.** This closes what is left of S2 and S14. In `/etc/systemd/system/paylez.service`, under `[Service]`:
   ```ini
   NoNewPrivileges=yes
   ProtectSystem=strict
   ProtectHome=yes
   PrivateTmp=yes
   ReadWritePaths=/var/lib/paylez /opt/paylez/updates
   IPAddressDeny=169.254.169.254
   ```
   Then run `systemctl daemon-reload && systemctl restart paylez` and watch `journalctl -u paylez -f` for a minute. Remove any line that breaks the boot.

8. **Set `NODE_ENV=production`** in `/etc/paylez/paylez.env`. It turns on the production behaviours, such as the `Secure` cookie flag.

9. **Check the env file's permissions.** It holds every secret, so only root and the service should read it.
   ```sh
   chown root:paylez /etc/paylez/paylez.env
   chmod 640 /etc/paylez/paylez.env
   ```

### 2.2 Supabase (dashboard at supabase.com)

1. **Turn on 2-step login for every member.** Whoever logs into this dashboard can read every customer. Go to **Account (top right) → Account preferences → Multi-factor authentication**. Then, under **Organization → Settings**, require MFA for all members if your plan offers it.

2. **Turn off the Data API.** The server talks to Postgres directly and nothing uses PostgREST, so turning it off removes the public REST door entirely, on top of RLS.
   - Go to **Project Settings → Data API** (or **API settings**).
   - Disable the Data API, or set **Exposed schemas** to empty.
   - Then, from your PC, run `curl https://<project>.supabase.co/rest/v1/users -H "apikey: <anon key>"`. It must not return rows.

3. **Restrict who can connect to the database.** Then a leaked database password is useless from anywhere else.
   - Go to **Project Settings → Database → Network Restrictions**.
   - Allow only the VPS address `87.106.247.180/32`, plus your own IP while you need it.

4. **Check the security advisor.** It lists anything still open.
   - Go to **Advisors → Security Advisor**, run it, and expect no "RLS disabled" errors.
   - "RLS enabled, no policy" notices are **intended**. That is the closed door.

5. **Point-in-time recovery (PITR).** Nightly backups lose up to a day, and PITR loses minutes. It is a paid add-on: **Project Settings → Add-ons → Point in Time Recovery**. Worth it once real money or many users are involved.

6. **Rotate the database password if it was ever pasted into a chat, an email or a screenshot.** A leaked password stays valid until it is changed.
   - Go to **Project Settings → Database → Reset database password**.
   - Update `PAYLEZ_PG_URL` in `/etc/paylez/paylez.env`, then run `systemctl restart paylez`.
   - Also update the backup script if it holds its own copy.

7. **Check Auth settings.** Supabase Auth is unused, so nobody should be able to create users there. Under **Authentication → Providers / Sign In**, disable sign-ups.

### 2.3 Backups

1. **Run a restore drill once now, then every quarter.** A backup that has never been restored is a hope, not a backup. `DEPLOY.md` §"Supabase down" already describes booting from `latest.db`, so do it **on your PC** with a copy:
   ```sh
   scp root@87.106.247.180:/var/backups/paylez/nightly/latest.db D:/restore-test.db
   ```
   Then run the server locally against it (`PAYLEZ_DB=D:/restore-test.db node server/main.ts`) and check that a known account's balance is right. Delete the file afterwards, because it holds real people's data.

2. **Keep a copy off the box.** If the VPS dies, today's backups die with it.
   - Copy `/var/backups/paylez` and `/var/lib/paylez/media` somewhere else every night: a storage bucket, or another server with `rclone`/`restic`, **encrypted**.
   - `restic` encrypts by default, which is why it's recommended here.

### 2.4 Keys and accounts

1. **Turn on 2-step login everywhere:**
   - Google (Cloud Console, Play Console, Firebase, the Gmail account);
   - GitHub;
   - Stripe;
   - Resend;
   - the VPS provider (IONOS);
   - the domain registrar and DNS;
   - Apple Developer, when you have it.

   Any one of these accounts can take over the product.

2. **Create the Android release keystore and keep two backups** (an offline USB stick and a password manager). Lose it and the app can never be updated. `CLAUDE.md` launch checklist item 1 has the steps. Then:
   - Enrol in **Play App Signing**. Google keeps the real signing key, and yours becomes an upload key that can be reset if lost.
   - Add both SHA-1s to the Android OAuth client, and both SHA-256s to `assetlinks.json`.

3. **Restrict the Firebase/Google API key.** The key in `google-services.json` is public by design, but unrestricted it can be used for other Google APIs on your bill.
   - Go to Google Cloud Console → **APIs & Services → Credentials** and open the "Android key".
   - Under **Application restrictions**, choose Android apps and add package `com.paylez.paylez` with its SHA-1s.
   - Under **API restrictions**, allow only the Firebase APIs it needs.

4. **Rotate secrets once a year, and immediately if a person with access leaves.** The secrets are:
   - `PAYLEZ_SECRET`;
   - the database password;
   - the Stripe keys and webhook secret;
   - `PAYLEZ_RESEND_KEY`;
   - `ANTHROPIC_API_KEY`;
   - the VAPID keys.

   Note: changing `PAYLEZ_SECRET` makes every printed venue QR code and any signed link invalid. Plan it with the venues.

5. **Remove leavers' SSH keys.** Delete their line in `authorized_keys` (one line per person, as `DEPLOY.md` says).

### 2.5 Play Console and App Store

1. **Play App Signing:** see 2.4, step 2.
2. **Data safety form and privacy labels.** They must match what the app collects:
   - email and name;
   - camera, for QR;
   - NFC;
   - game and visit activity;
   - Firebase Analytics.

   The privacy policy must be fixed first, because it still describes the old crypto wallet. See `CLAUDE.md`, "Left open".
3. **Optional: Play Integrity API.** It makes fake-app score abuse expensive. Enable it in Play Console → **App integrity**. Ask for the code: an app token is sent with each round finish and verified on the server.

---

## Part 3: habits

- **Before every deploy:** `npx tsc -b`, `npm run verify`, `npm run verify:api` and `bash scripts/pg-boot-test.sh`. All must pass.
- **Monthly:**
  - `npm audit --omit=dev` in Globe, and `flutter pub outdated` in the app;
  - `apt list --upgradable` on the VPS, which should be empty if unattended-upgrades works;
  - glance at `journalctl -u paylez --since "1 month ago" | grep -c " 5[0-9][0-9] "` for error spikes.
- **Quarterly:**
  - restore drill (2.3, step 1);
  - review who has SSH, Supabase, Play Console and Stripe access, and remove anyone who no longer needs it.
- **Never:**
  - paste a secret into chat, email, a ticket or a screenshot;
  - commit an `.env` file (git already ignores them);
  - give the website a `VITE_` variable holding a secret, because everything with that prefix is published in the bundle.
- **New code:**
  - every route that takes an id must check the object belongs to the caller. `verify.ts` has examples (`securityHardening`).
  - a new table needs nothing extra: RLS is generated with the schema (`npm run pg:schema`).
- **If something leaks:**
  1. rotate the affected key first;
  2. revoke sessions (`UPDATE sessions SET revoked_at = now()::text WHERE revoked_at IS NULL;` signs everyone out);
  3. then investigate.

  Under GDPR, a personal-data breach must be reported to the Polish regulator (UODO) **within 72 hours**.

---

## What changed in code in this pass

Server (`Globe/server`):

| File | Change |
|---|---|
| `http/server.ts` | security headers; the request-id check |
| `http/routes/auth.ts` | guest merge requires the guest's own session (`ownGuest`); `Secure` cookie; sign-in per-connection limit |
| `http/routes/consumer.ts` | transcript scoped to its owner; draft deals return 404 |
| `http/routes/partner.ts` | assistant session ownership on `ask` and `draft` |
| `domain/assistant.ts` | `transcript` takes the user |
| `domain/media.ts` | private-address guard with hop-by-hop redirects; `Object.hasOwn` for media kinds |
| `main.ts` | refuses to start with the default secret on a real deployment |
| `config.ts` | `limits.signInPerHour` |
| `verify.ts` | new `security hardening` section |

App (`Pay-lez mobile`):

| File | Change |
|---|---|
| `lib/data/api/token_vault.dart` | new |
| `lib/data/api/session.dart` | uses `TokenVault` |
| `lib/data/api/api_config.dart` | release builds use https only |
| `android/app/src/main/AndroidManifest.xml` | backups off |
| `android/app/src/main/res/xml/data_extraction_rules.xml` | new; blocks backup and device transfer on Android 12+ |
| `pubspec.yaml` | `flutter_secure_storage` |
| `test/token_vault_test.dart` | new |
| `CLAUDE.md` | release build command |
