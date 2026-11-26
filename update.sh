#!/bin/sh
# Holt die neueste Version von GitHub und startet die App neu. Aufruf auf dem Server: badplaner-update
set -e
cd /opt/badplaner
git -c credential.helper='!f() { echo username=token; echo "password=$(cat /root/.github-token)"; }; f' pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
ln -sf /opt/badplaner/passwort.sh /usr/local/bin/badplaner-passwort
echo "Badplaner aktualisiert."
