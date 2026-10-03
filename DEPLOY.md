# Deploying Paylez

Pushing to `main` deploys **nothing**. There is no CI and no deploy hook: the
site and the backend are copied from a developer's machine to the VPS by the two
procedures below. Whatever is in *your* working tree is what goes live, so the
first rule is the one that stops two people overwriting each other:

> **Deploy from a clean, pushed `main`.** `git status` empty, `git pull` done,
> nothing ahead of `origin/main`. A deploy of uncommitted work is a live server
> nobody else can reproduce, and the next person to deploy from GitHub silently
> removes it.

And say in the team chat *before* you start, so two deploys never overlap.

No secret is in this file. The environment file lives on the box and is the
source of truth for every credential; local `.env.local` /
`.env.development.local` are handed over separately and are gitignored.

## Access

```
ssh root@87.106.247.180
```

Key-only (password login is off). Each person has their own key in
`/root/.ssh/authorized_keys`, one line each with a comment naming it — to revoke
somebody, delete their line.

Windows has no `rsync`, which is why everything below is `tar` over `ssh`. Run
the commands from Git Bash, from the repo root.

## What is where on the box

| | |
|---|---|
| **Site** | `/var/www/paylez/dist`, served by nginx for `www.pay-lez.com`, `new.pay-lez.com` and `pay-lez.com`, with an SPA fallback (any unknown path → `index.html`). Previous deploy kept as `dist.prev`. |
| **Backend** | `/opt/paylez/server`, run by `paylez.service` as user `paylez`: `node server/main.ts`, `WorkingDirectory=/opt/paylez`. nginx proxies `api.pay-lez.com` → `127.0.0.1:8787`. Previous deploys kept as `server.prev.<timestamp>`. |
| **Dependencies** | `/opt/paylez/package.json` + `node_modules` — `pg` only. Not part of the `server/` upload; touch only if `pg` itself is upgraded. |
| **Environment** | `/etc/paylez/paylez.env` — `PAYLEZ_PG_URL`, `PAYLEZ_SECRET`, Stripe, Google, admin. **Never copy a local env file over it.** |
| **Database** | Supabase Postgres (`PAYLEZ_PG_URL`). `/var/lib/paylez/paylez.db` is the old SQLite file — the rollback target, not live data. |
| **Backups** | `paylez-backup.timer` runs `/opt/paylez/backup.sh` nightly (~03:30 UTC): Supabase → a *bootable* SQLite file in `/var/backups/paylez/nightly/`, fourteen kept, `latest.db` symlinked. |
| **Inbound data** | `/opt/paylez/updates`, `/opt/paylez/new-data` — question banks the importer reads. Not part of the `server/` upload. |
| **Node** | v22 (runs TypeScript directly; no build step for the server). |

## Before either deploy

```
git status                  # must be empty
git pull                    # and nothing ahead of origin/main
npx tsc -b                  # type check, all four projects
npm run verify              # front-end suite
npm run verify:api          # backend suite
```

All three must be clean. A merge in particular can pass `tsc` and the build and
still fail `verify` — that has happened.

**`verify:api` needs `new-data/`, and a clone does not have it.** It is the
Base44 export the backend's test database is seeded from, gitignored because it
holds real people's records, and without it the suite crashes at "the import is
repeatable". The box carries the same files — copy them once into the repo root:

```
ssh root@87.106.247.180 'tar -czf - -C /opt/paylez new-data' | tar -xzf -
```

Treat the folder like the database it came from: not in git, not in a chat, not
on a shared drive.

## Front end

The API address and the Google client id are **baked into the bundle at build
time**, so a build without them ships a site that cannot sign anybody in.

```
VITE_API_URL=https://api.pay-lez.com npm run build
grep -c 'api.pay-lez.com'           dist/assets/index-*.js   # must be 1
grep -c 'apps.googleusercontent.com' dist/assets/index-*.js  # must be 1
```

`VITE_GOOGLE_CLIENT_ID` comes from `.env.local`; if the second grep says 0, that
file is missing or incomplete — stop.

Then upload and swap:

```
tar -czf - -C dist . | ssh root@87.106.247.180 'set -e
  rm -rf /var/www/paylez/dist.new
  mkdir -p /var/www/paylez/dist.new
  tar -xzf - -C /var/www/paylez/dist.new
  test -s /var/www/paylez/dist.new/index.html
  test -d /var/www/paylez/dist.new/assets
  rm -rf /var/www/paylez/dist.prev
  mv /var/www/paylez/dist /var/www/paylez/dist.prev
  mv /var/www/paylez/dist.new /var/www/paylez/dist
  chown -R www-data:www-data /var/www/paylez/dist
  systemctl reload nginx'
```

**Keep the two `test` lines.** A local `tar` failure once streamed nothing, the
remote side did not fail loudly, and the swap put an empty directory live
(nginx answered 403). The tests turn that into a no-op.

Check it:

```
curl -s https://www.pay-lez.com/ | grep -o 'index-[^"]*\.js'   # = the file in dist/assets
curl -sI https://www.pay-lez.com/sitemap.xml | grep -i content-type   # XML, not text/html
```

A 403 in the first second or two is the swap window, not a failure — check again.

**Then hard-refresh (Ctrl+Shift+R) before judging it.** `index.html` is served
without `Cache-Control`, so an open browser keeps loading the *previous* bundle
for a while and a successful deploy looks like it did nothing. Tell whoever asked
for the change to do the same.

Rollback: `mv dist dist.bad && mv dist.prev dist && systemctl reload nginx`.

## Backend

Three steps, deliberately separate: back up, stage beside the running copy,
then swap. Nothing is deleted, so every step is reversible.

**1. Back up the database** (takes about a minute):

```
ssh root@87.106.247.180 'systemctl start paylez-backup.service &&
  journalctl -u paylez-backup.service -n 3 --no-pager'
```

It should end with `kept: N backup(s), newest …`. Today's file is now in
`/var/backups/paylez/nightly/`.

**2. Stage** the new server beside the running one:

```
TS=$(date +%Y%m%d-%H%M%S)
tar -czf - --exclude=./data -C server . | ssh root@87.106.247.180 "set -e
  mkdir -p /opt/paylez/server.$TS
  tar -xzf - -C /opt/paylez/server.$TS
  test -s /opt/paylez/server.$TS/main.ts
  test -d /opt/paylez/server.$TS/domain
  chown -R paylez:paylez /opt/paylez/server.$TS
  echo staged server.$TS"
```

`--exclude=./data` matters: `server/data/` is your *local* dev database.

**3. Swap and restart**, using the same `$TS`:

```
ssh root@87.106.247.180 "systemctl stop paylez
  mv /opt/paylez/server /opt/paylez/server.prev.$TS
  mv /opt/paylez/server.$TS /opt/paylez/server
  systemctl start paylez
  sleep 3; systemctl is-active paylez
  journalctl -u paylez -n 20 --no-pager"
curl -s https://api.pay-lez.com/v1/health
```

**Schema changes need no separate step.** On boot the server runs
`schema.pg.sql` and `rls.pg.sql` against Supabase, and both are written as
`CREATE … IF NOT EXISTS`, so a new table arrives on its own. That only holds for
*additive* changes — a dropped or retyped column is a migration and needs its own
plan, and a backup taken immediately before.

Rollback: `systemctl stop paylez; mv server server.bad; mv server.prev.<TS> server; systemctl start paylez`.
Old `server.prev.*` directories accumulate; delete them by hand once a deploy
has proved itself.

**If the API response shape changed, run the mobile app's `test/live_test.dart`
against it** — the Flutter app already on phones cannot be updated with the
server, and `server/FLUTTER-BRIEF.md` is where a change it must know about goes.

## Database emergencies

Supabase down or the data damaged: the nightly backup is a working database.

```
cp /var/backups/paylez/nightly/latest.db /var/lib/paylez/paylez.db
chown paylez:paylez /var/lib/paylez/paylez.db
# comment out PAYLEZ_PG_URL in /etc/paylez/paylez.env
systemctl restart paylez
```

The server boots on SQLite when `PAYLEZ_PG_URL` is unset. Uncomment and restart
to go back. Anything written while on SQLite stays in SQLite; copying it back is
a decision, not an automatic step.

## Things that are not deployed by the above

- `updates/` (question-bank exports). Copy a single file with
  `cat file | ssh root@… 'cat > /opt/paylez/updates/<name>; chown paylez:paylez /opt/paylez/updates/<name>'`,
  then run `npm run server:import` on the box if the banks need re-reading.
- `/etc/paylez/paylez.env` — edit on the box, then `systemctl restart paylez`.
- nginx config — `/etc/nginx/sites-enabled/paylez`; `nginx -t` before
  `systemctl reload nginx`, always.
- Stripe products (`npm run stripe:setup`) and the Flutter app, which is its own repo.

## Email codes (sign-up confirmation, password reset)

Off until a key is set: without `PAYLEZ_RESEND_KEY` codes go to the server log,
and nothing is gated on them. To switch it on, once:

1. Create a Resend account and add the domain `pay-lez.com` (Domains → Add).
   Put the DNS records it shows (an SPF `TXT`, the DKIM `TXT`/`CNAME`s and the
   optional `MX` for bounces) at the DNS host, and wait until Resend says
   *Verified*. Until it does, every send is refused with a 403 in the log.
2. Create an API key with *Sending access* only.
3. In `/etc/paylez/paylez.env` set `PAYLEZ_RESEND_KEY=re_…`,
   `PAYLEZ_MAIL_FROM=Paylez <no-reply@pay-lez.com>` and
   `PAYLEZ_VERIFY_SINCE=` the current UTC time (accounts older than that are
   never asked to confirm before spending). Then `systemctl restart paylez`.
4. Check: sign up with a real address and the code arrives; `journalctl -u
   paylez | grep email:` shows any provider refusal.

With the key set, buying a voucher and redeeming a gift card need a confirmed
address for accounts newer than `PAYLEZ_VERIFY_SINCE`. `PAYLEZ_VERIFY_TO_SPEND=off`
keeps the mail and drops that gate.
