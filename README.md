# Badplaner VR – Grundgerüst (Schritt 1)

Interne Web-App für die Badberatung beim Endkunden: Login nur für das eigene Team,
Kundenprojekte mit mehreren Planungsvarianten und der 3D/VR-Planer, der seine Daten
auf dem Server speichert.

## Was drin ist

| Datei | Zweck |
|---|---|
| `server.js` | Server: Login, Team, Kundenprojekte, Varianten, Datenbank (SQLite) |
| `public/index.html` | App: Anmeldung, Projektliste, Projektseite, Team, Konto |
| `public/planner.html` | Planer: Zeichnen, Maße, Einrichten, Material, Angebot, 3D/VR |
| `Dockerfile` | Zum Betrieb auf einem Server mit Docker |

Keine zusätzlichen Pakete nötig – nur **Node.js 22.13 oder neuer**.

## Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung |
|---|---|
| `ADMIN_EMAIL` | E-Mail des ersten Admin-Kontos (nur beim allerersten Start) |
| `ADMIN_PASSWORD` | Passwort dafür, mindestens 10 Zeichen |
| `ADMIN_NAME` | Anzeigename, optional |
| `PORT` | Port, Standard 8080 |
| `DATA_DIR` | Ordner für die Datenbank, Standard `./data` |
| `COOKIE_SECURE` | Auf `1` setzen, sobald die Seite über HTTPS läuft |

## Lokal starten

```bash
ADMIN_EMAIL=du@firma.de ADMIN_PASSWORD=EinLangesPasswort1 node server.js
```

Dann `http://localhost:8080` öffnen und anmelden. Weitere Mitarbeiter legst du unter **Team** an.

## Auf einem Server betreiben (Docker)

```bash
docker build -t badplaner .
docker run -d --name badplaner -p 8080:8080 \
  -v badplaner-daten:/app/data \
  -e ADMIN_EMAIL=du@firma.de -e ADMIN_PASSWORD=EinLangesPasswort1 \
  -e COOKIE_SECURE=1 badplaner
```

Wichtig für den Echtbetrieb:
- **HTTPS ist Pflicht** (für den Login und für den VR-Modus der Brille). Am einfachsten mit einem
  vorgeschalteten Proxy wie Caddy, der Zertifikate automatisch holt.
- **Server in der EU** wählen – es werden Kundendaten gespeichert (DSGVO).
- **Backups:** Der Ordner `data` enthält alle Kundendaten. Regelmäßig sichern.

## Betrieb auf dem Hetzner-Server

Der Server wird beim Anlegen per Startskript (Cloud config) eingerichtet: Docker, Firewall,
App und Caddy für HTTPS. Danach:

- **Adresse:** `https://<IP-mit-Bindestrichen>.sslip.io` – steht auf dem Server in `/root/ADRESSE.txt`
- **Updates:** kommen automatisch – ein systemd-Timer prüft alle 2 Minuten GitHub (`autoupdate.sh`). Status und Protokoll stehen in der App unter **Konto** (Datei `/opt/badplaner-status/`). Sofort: `badplaner-update`
- **Server-Einrichtung:** `install-host.sh` (wird beim ersten Start und bei jedem Update ausgeführt)
- **Passwort vergessen:** in der Hetzner-Konsole `badplaner-passwort` eingeben
- **Daten:** liegen im Docker-Volume `badplaner_daten`; Hetzner-Backups sichern den ganzen Server

## Fahrplan

1. ✅ Grundgerüst: Login, Team, Kundenprojekte, Varianten, Planer speichert auf dem Server
2. ✅ Online stellen: Hetzner-Server mit HTTPS (eigene Domain folgt)
3. ✅ KI-Planung: Raum → Kundenwunsch (Freitext/Diktat) → 3–5 Ideen mit Vorschau (`ai.js`). Trends recherchiert die KI wöchentlich selbst im Internet; Hausregeln unter „KI“
4. ✅ KI-Fotos: 3D-Ansicht → fotorealistisches Foto per OpenAI-Bild-KI (`ai.photo`, Schlüssel unter „KI“). Offen: 360°-Panoramen für die Brille
5. Produktkatalog: echte Produkte, Bilder und 3D-Modelle von Großhandel und Herstellern
