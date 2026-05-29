# Schulden Manager Dark – Railway Version v6

Diese Version ist für Railway vorbereitet und läuft als kleine Node-App.

## Enthalten
- Nur Dark Mode
- Info-Fenster mit speicherbarem Notizfeld pro Schuld
- PWA-Dateien: `manifest.webmanifest` und `sw.js`
- `package.json` mit Start-Befehl
- `server.js` als statischer Webserver
- `railway.toml` für Railway

## Deployment auf Railway
1. ZIP entpacken
2. Inhalt in dein GitHub-Repository hochladen
3. Bei Railway ein neues Projekt aus diesem GitHub-Repo erstellen
4. Railway erkennt Node automatisch
5. Start-Befehl ist: `npm start`

Railway nutzt automatisch die Variable `PORT`. Du musst dafür nichts extra eintragen.

- Neuer Aktionen-Button „Ansprechpartner“ pro Schuld
