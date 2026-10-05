#!/usr/bin/env bash
# Step 3 of DEPLOY.md "Backend": swap the staged server in and restart.
# The old one is kept as server.prev.<TS>.
#
# A first boot can run the legacy re-import before it listens (minutes on
# Postgres), so this waits for /v1/health rather than checking once. If the
# service restarts while it waits, the new server is crash-looping: the old
# one is put back automatically (2026-10-05: a boot loop took the API down
# until it was rolled back by hand).
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
  systemctl reset-failed paylez 2>/dev/null || true
  systemctl start paylez"

echo "== 4. waiting for the new server (up to 10 minutes; a boot that re-imports takes ~3)"
healthy=no
for i in $(seq 1 120); do
  sleep 5
  if curl -sf -m 5 https://api.pay-lez.com/v1/health >/dev/null; then healthy=yes; break; fi
  restarts=$(ssh "$HOST" "systemctl show -p NRestarts --value paylez")
  if [ "${restarts:-0}" -gt 0 ]; then
    echo "!! the new server crashed and restarted ($restarts) — rolling back"
    break
  fi
  echo "   …still starting ($((i * 5)) s)"
done

if [ "$healthy" != yes ]; then
  ssh "$HOST" "journalctl -u paylez -n 40 --no-pager" || true
  echo "== rolling back to the previous server"
  ssh "$HOST" "systemctl stop paylez
    cd /opt/paylez
    rm -rf server.bad.$TS
    mv server server.bad.$TS
    mv server.prev.$TS server
    systemctl reset-failed paylez 2>/dev/null || true
    systemctl start paylez"
  sleep 8
  curl -s https://api.pay-lez.com/v1/health; echo
  echo "Rolled back. The failed server is kept as /opt/paylez/server.bad.$TS; the log is above."
  exit 1
fi

echo "== 5. up"
ssh "$HOST" "journalctl -u paylez -n 15 --no-pager"
curl -s https://api.pay-lez.com/v1/health; echo
curl -s https://api.pay-lez.com/v1 | grep -o '"[A-Z]* /v1/\(gate/passes\|missions\|auth/email\)[^"]*"' | sort -u

echo
echo "Rollback if needed later:"
echo "  ssh $HOST 'systemctl stop paylez; cd /opt/paylez; mv server server.bad; mv server.prev.$TS server; systemctl start paylez'"
