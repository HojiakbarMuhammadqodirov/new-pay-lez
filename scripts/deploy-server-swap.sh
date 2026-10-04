#!/usr/bin/env bash
# Step 3 of DEPLOY.md "Backend": swap the staged server in and restart.
# The old one is kept as server.prev.<TS>; the rollback is printed at the end.
set -euo pipefail
HOST=root@87.106.247.180
cd "$(dirname "$0")/.."
TS=$(cat .deploy-ts)

echo "== 3. swapping in server.$TS"
ssh "$HOST" "set -e
  test -d /opt/paylez/server.$TS
  systemctl stop paylez
  mv /opt/paylez/server /opt/paylez/server.prev.$TS
  mv /opt/paylez/server.$TS /opt/paylez/server
  systemctl start paylez
  sleep 4; systemctl is-active paylez
  journalctl -u paylez -n 15 --no-pager"

echo "== 4. checks"
curl -s https://api.pay-lez.com/v1/health; echo
curl -s https://api.pay-lez.com/v1 | grep -o '"[A-Z]* /v1/\(gate/passes\|missions\|auth/email\)[^"]*"' | sort -u

echo
echo "Rollback if needed:"
echo "  ssh $HOST 'systemctl stop paylez; cd /opt/paylez; mv server server.bad; mv server.prev.$TS server; systemctl start paylez'"
