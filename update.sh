#!/bin/sh
# Holt die neueste Version von GitHub und startet die App neu. Aufruf auf dem Server: badplaner-update
set -e
BP_DIR=${BP_DIR:-/opt/badplaner}
TOKEN_FILE=${TOKEN_FILE:-/root/.github-token}
cd "$BP_DIR"
git -c "credential.helper=!f() { echo username=token; echo \"password=\$(cat $TOKEN_FILE)\"; }; f" pull --ff-only
[ -n "$SKIP_DOCKER" ] && exit 0
sh "$BP_DIR/install-host.sh"
docker compose up -d --build
docker image prune -f >/dev/null
echo "Badplaner aktualisiert."
