#!/bin/sh
# Passwort eines App-Kontos zurücksetzen. Aufruf auf dem Server: badplaner-passwort
cd /opt/badplaner && docker compose exec app node --no-warnings passwort.js
