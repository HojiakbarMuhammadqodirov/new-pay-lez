#!/usr/bin/env bash
# Does the server boot on Postgres in production's state? (Git Bash, repo root.)
#
# Production runs Postgres; verify.ts runs SQLite, and the two differ where it
# hurts: on 2026-10-05 the first deploy in October crash-looped at boot on
# `budgets_venue_id_period_key`, which SQLite cannot raise. This runs the real
# boot against a throwaway local Postgres:
#
#   1. a fresh database: schema + first import, then healthy;
#   2. live rows written under the server's own ids on the keys the import also
#      writes, the uz word bank emptied (production's re-import trigger), and a
#      reboot: it must come up healthy with the live rows intact;
#   3. the phone app's live_test against a fresh Postgres-backed server.
#
#   bash scripts/pg-boot-test.sh                 # all three
#   bash scripts/pg-boot-test.sh --no-app        # skip 3
#   TREE=/d/some/worktree bash scripts/pg-boot-test.sh --no-app   # test another checkout
#
# One-time setup (no Docker on this box; EnterpriseDB's portable binaries):
#   curl -L -o /d/flutter-temp/pg.zip https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip
#   unzip -q /d/flutter-temp/pg.zip -d /d/ && rm /d/flutter-temp/pg.zip      # -> D:\pgsql
#   /d/pgsql/bin/initdb.exe -D /d/pgdata -U postgres -A trust -E UTF8 --locale=C
# This script starts it on 55432 if it is not running. Never point it at a real
# database: it drops and rewrites rows. Trust auth on 127.0.0.1 only.
set -uo pipefail

PG_BIN=${PG_BIN:-/d/pgsql/bin}
PG_DATA=${PG_DATA:-/d/pgdata}
PGPORT=${PGPORT:-55432}
PORT=${PORT:-8851}
APP=${APP:-"/d/Other files/Projects/Pay-lez mobile"}
REPO=$(cd "$(dirname "$0")/.." && pwd)
TREE=${TREE:-$REPO}
SCRATCH=${SCRATCH:-/d/flutter-temp/pgboot}
RUN_APP=yes
[ "${1:-}" = "--no-app" ] && RUN_APP=no
mkdir -p "$SCRATCH"

psql() { "$PG_BIN/psql.exe" -h 127.0.0.1 -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
fail=0
note() { echo "== $*"; }
bad() { echo "!! $*"; fail=1; }

if ! "$PG_BIN/pg_ctl.exe" -D "$PG_DATA" status >/dev/null 2>&1; then
  note "starting local postgres on $PGPORT"
  "$PG_BIN/pg_ctl.exe" -D "$PG_DATA" -o "-p $PGPORT" -l "$PG_DATA/server.log" start >/dev/null 2>&1 </dev/null &
  for _ in $(seq 1 30); do psql -tc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
fi
psql -tc 'select 1' >/dev/null || { echo "postgres is not reachable on $PGPORT"; exit 2; }

# Boot `node server/main.ts` against database $1; wait until healthy or dead.
SERVER_PID=
boot() {
  local db=$1 log=$2
  ( cd "$TREE" && exec env PAYLEZ_PG_URL="postgres://postgres@127.0.0.1:$PGPORT/$db" PAYLEZ_PG_SSL=off \
      PAYLEZ_SECRET=throwaway PAYLEZ_ADMIN_EMAIL=admin@paylez.dev PAYLEZ_ADMIN_PASSWORD='Admin12345!' \
      PORT=$PORT node server/main.ts ) >"$log" 2>&1 &
  SERVER_PID=$!
  local start=$SECONDS
  while [ $((SECONDS - start)) -lt 900 ]; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "   exited after $((SECONDS - start)) s:"; grep -v -e ExperimentalWarning -e trace-warnings "$log" | tail -25
      return 1
    fi
    if curl -sf -m 3 "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1; then
      echo "   healthy after $((SECONDS - start)) s"; return 0
    fi
    sleep 2
  done
  echo "   not healthy after 900 s"; return 1
}
stop() {
  # Whoever listens on $PORT is our server; `kill` on a Git Bash job does not
  # always reach the native node.exe under it.
  local pid
  for pid in $(netstat -ano | awk -v p=":$PORT" '$2 ~ p"$" && $4 == "LISTENING" {print $5}' | sort -u); do
    taskkill //PID "$pid" //F >/dev/null 2>&1
  done
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  for _ in $(seq 1 15); do curl -s -m 1 "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1 || break; sleep 1; done
  SERVER_PID=
}

if curl -s -m 2 "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1; then
  echo "port $PORT is already answering; set PORT= to a free one"; exit 2
fi

DB=boot_$(date +%s)
psql -c "CREATE DATABASE $DB" >/dev/null
note "1. fresh database $DB: schema + first import (tree: $TREE)"
boot "$DB" "$SCRATCH/$DB.first.log" || bad "first boot failed"
grep -E '^(database|imported|re-importing)' "$SCRATCH/$DB.first.log" | sed 's/^/   /'
stop

if [ $fail = 0 ]; then
  note "2. live rows on the import's keys + uz word bank emptied, then reboot"
  ( cd "$TREE" && PAYLEZ_PG_SSL=off node scripts/pg-boot-collide.ts make "postgres://postgres@127.0.0.1:$PGPORT/$DB" "$SCRATCH/$DB.state.json" ) \
    2>&1 | grep -v -e ExperimentalWarning -e trace-warnings || bad "could not make the live rows"
  boot "$DB" "$SCRATCH/$DB.reboot.log" || bad "REBOOT FAILED — production's crash reproduces"
  grep -E '^(re-importing|imported)' "$SCRATCH/$DB.reboot.log" | sed 's/^/   /'
  stop
  if [ $fail = 0 ]; then
    ( cd "$TREE" && PAYLEZ_PG_SSL=off node scripts/pg-boot-collide.ts check "postgres://postgres@127.0.0.1:$PGPORT/$DB" "$SCRATCH/$DB.state.json" ) \
      2>&1 | grep -v -e ExperimentalWarning -e trace-warnings || bad "live rows did not survive"
  fi
fi

if [ $RUN_APP = yes ] && [ $fail = 0 ]; then
  APPDB=app_$(date +%s)
  psql -c "CREATE DATABASE $APPDB" >/dev/null
  note "3. the phone's live_test against a fresh Postgres-backed server ($APPDB)"
  if boot "$APPDB" "$SCRATCH/$APPDB.log"; then
    APPWIN=$(cygpath -w "$APP")
    powershell -NoProfile -Command "\$env:TMP='D:\\flutter-temp'; \$env:TEMP='D:\\flutter-temp'; Set-Location '$APPWIN'; flutter test test/live_test.dart --dart-define=PAYLEZ_API_BASE=http://127.0.0.1:$PORT 2>&1 | Select-Object -Last 4" \
      | tee "$SCRATCH/$APPDB.flutter.log"
    grep -q 'All tests passed' "$SCRATCH/$APPDB.flutter.log" || bad "live_test failed"
    n5=$(grep -cE '" 5[0-9]{2} | 5[0-9]{2} [0-9]+ms' "$SCRATCH/$APPDB.log" || true)
    echo "   5xx in the server log: $n5"; [ "${n5:-0}" = 0 ] || bad "server answered 5xx"
  else
    bad "app server did not boot"
  fi
  stop
fi

echo
if [ $fail = 0 ]; then echo "PG BOOT TEST: PASS"; else echo "PG BOOT TEST: FAIL (logs in $SCRATCH)"; fi
exit $fail
