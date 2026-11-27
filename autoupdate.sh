#!/bin/sh
# Prüft alle 10 Minuten (per Cron), ob es auf GitHub eine neue Version gibt, und spielt sie ein.
cd /opt/badplaner || exit 0
AUTH="credential.helper=!f() { echo username=token; echo \"password=\$(cat /root/.github-token)\"; }; f"
git -c "$AUTH" fetch -q origin main || exit 0
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "$(date '+%F %T') neue Version gefunden"
  /bin/sh /opt/badplaner/update.sh
fi
