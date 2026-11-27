#!/bin/sh
# Prüft per systemd-Timer alle 2 Minuten, ob es auf GitHub eine neue Version gibt, und spielt sie ein.
# Ergebnis steht in $STATUS/status.json und wird in der App unter „Konto“ angezeigt.
BP_DIR=${BP_DIR:-/opt/badplaner}
STATUS=${STATUS:-/opt/badplaner-status}
TOKEN_FILE=${TOKEN_FILE:-/root/.github-token}
mkdir -p "$STATUS"
LOG="$STATUS/update.log"
exec 9>/tmp/badplaner-update.lock
flock -n 9 || exit 0
now() { date '+%Y-%m-%d %H:%M:%S'; }
write() { printf '{"checked":"%s","result":"%s","head":"%s"}\n' "$(now)" "$1" "$(git -C "$BP_DIR" rev-parse --short HEAD 2>/dev/null)" > "$STATUS/status.json.tmp" && mv "$STATUS/status.json.tmp" "$STATUS/status.json"; }
cd "$BP_DIR" || { write "Fehler: Ordner $BP_DIR fehlt"; exit 0; }
AUTH="credential.helper=!f() { echo username=token; echo \"password=\$(cat $TOKEN_FILE)\"; }; f"
if ! git -c "$AUTH" fetch -q origin main >>"$LOG" 2>&1; then
  echo "$(now) GitHub-Abruf fehlgeschlagen" >>"$LOG"
  write "Fehler: GitHub nicht erreichbar oder Schlüssel abgelaufen"; exit 0
fi
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then write "aktuell"; exit 0; fi
echo "$(now) neue Version gefunden, aktualisiere …" >>"$LOG"
if /bin/sh "$BP_DIR/update.sh" >>"$LOG" 2>&1; then write "aktualisiert"; echo "$(now) fertig" >>"$LOG"
else write "Fehler beim Aktualisieren (siehe Protokoll)"; echo "$(now) FEHLER" >>"$LOG"; fi
tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
