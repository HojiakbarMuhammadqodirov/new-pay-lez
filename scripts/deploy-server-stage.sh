#!/usr/bin/env bash
# Steps 1-2 of DEPLOY.md "Backend": back up the database, then stage the new
# server beside the running one. Changes nothing that is live. Run from Git
# Bash in the repo root; then run scripts/deploy-server-swap.sh.
set -euo pipefail
HOST=root@87.106.247.180
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain -- server)" ]; then
  echo "server/ has uncommitted changes; commit and push first." >&2
  exit 1
fi

echo "== 1. backing up the database (about a minute)"
ssh "$HOST" 'systemctl start paylez-backup.service && journalctl -u paylez-backup.service -n 3 --no-pager'

TS=$(date +%Y%m%d-%H%M%S)
echo "== 2. staging server.$TS"
tar -czf - --exclude=./data -C server . | ssh "$HOST" "set -e
  mkdir -p /opt/paylez/server.$TS
  tar -xzf - -C /opt/paylez/server.$TS
  test -s /opt/paylez/server.$TS/main.ts
  test -d /opt/paylez/server.$TS/domain
  chown -R paylez:paylez /opt/paylez/server.$TS
  echo staged server.$TS"
echo "$TS" > .deploy-ts
echo "Staged. Nothing live has changed. Next: bash scripts/deploy-server-swap.sh"
