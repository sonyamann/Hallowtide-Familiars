#!/bin/sh
# Deploys the committed state of main to the studio Droplet, installs its
# runtime dependencies there, and restarts the app. Uncommitted changes are
# not sent. The server's data/ folder (the database, snapshots, classifier
# answers and rendered cards) is never touched. The server must be set up
# first; see HOSTING.md (private).
#
#   sh tools/deploy.sh
set -eu

APP="/srv/hallowtide/app"

cd "$(dirname "$0")/.."
# The server's SSH address (user@host) comes from STUDIO_HOST, set in the
# environment or in .env, so it stays out of the repo.
HOST="${STUDIO_HOST:-$(sed -n 's/^STUDIO_HOST=//p' .env 2>/dev/null | tail -n 1)}"
[ -n "$HOST" ] || { echo "Set STUDIO_HOST=user@host in .env first." >&2; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "Note: uncommitted changes are not deployed." >&2
fi

tmp=$(mktemp -d) && chmod 755 "$tmp"
trap 'rm -rf "$tmp"' EXIT
git archive HEAD | tar -x -C "$tmp"

rsync -rlptz --delete --exclude /data/ --exclude /node_modules/ --exclude /art-incoming/ "$tmp/" "$HOST:$APP/"
ssh "$HOST" "cd $APP && npm ci --omit=dev --no-audit --no-fund --loglevel=error && sudo systemctl restart hallowtide && sleep 2 && systemctl is-active hallowtide && curl -fsS -o /dev/null -w 'the form answers %{http_code}\n' http://127.0.0.1:3000/hallowtide"
echo "Deployed $(git rev-parse --short HEAD)."
