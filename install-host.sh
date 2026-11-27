#!/bin/sh
# Richtet den Server ein bzw. hält die Einrichtung aktuell (wird beim Start und bei jedem Update ausgeführt).
set -e
mkdir -p /opt/badplaner-status
timedatectl set-timezone Europe/Berlin || true
ln -sf /opt/badplaner/update.sh /usr/local/bin/badplaner-update
ln -sf /opt/badplaner/passwort.sh /usr/local/bin/badplaner-passwort
cp /opt/badplaner/deploy/badplaner-update.service /etc/systemd/system/badplaner-update.service
cp /opt/badplaner/deploy/badplaner-update.timer /etc/systemd/system/badplaner-update.timer
rm -f /etc/cron.d/badplaner
systemctl daemon-reload
systemctl enable --now badplaner-update.timer
