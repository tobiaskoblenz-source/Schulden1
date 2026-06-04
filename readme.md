# Schulden v39

Basis: Schulden v38.

Neu in v39:

- QR-Etikettenformate auswählbar: 30×30 mm und 35×35 mm
- 30×30 mm: 6 Spalten × 8 Reihen = 48 Etiketten pro A4-Seite
- 35×35 mm: 5 Spalten × 7 Reihen = 35 Etiketten pro A4-Seite
- Beide Bögen sind auf A4 angepasst und im Stil der großen PDF aufgebaut
- Pro Gläubiger gibt es Buttons für 30×30, 35×35 und QR Standard
- QR-Erstellung bleibt offline ohne externe QR-Bibliothek

Hinweis:
PDF-Erstellung nutzt weiterhin die in der App vorhandene jsPDF-Bibliothek.


## v59
- Linkes Desktop-Menü beruhigt: Übersicht, Neue Schulden, Bearbeiten mit Gläubiger/Kategorien, Papierkorb, Einstellungen.
- Sichtbare Texte „Schuld“ auf „Schulden“ geändert.
- Handy-Seite bleibt unverändert.


## v79
- Paperless-ngx-Anbindung in der Desktop-Schulden-Akte ergänzt.
- Neue Paperless-Sektion pro Akte: Dokumente suchen, PDF öffnen, in Paperless öffnen und Dokumente verknüpfen/lösen.
- Server-Proxy ergänzt: /api/paperless/status, /api/paperless/search und /api/paperless/document/:id.
- Empfohlen auf Railway: Variablen PAPERLESS_URL und PAPERLESS_TOKEN setzen. Alternativ können URL und Token im Browser gespeichert werden.
- Wichtig: Wenn Paperless nur lokal auf der Synology erreichbar ist, muss die Schulden-App auch im selben Netz laufen oder Paperless muss für Railway erreichbar gemacht werden, z. B. über sichere Domain/VPN/Tunnel.
- Handy-Seite wurde nicht verändert.


## v81 - Paperless 502 Diagnose

Diese Version verbessert die Paperless-Anbindung bei HTTP 502:
- Timeout statt endlosem Warten
- klare Fehlermeldung, wenn Railway Paperless nicht erreichen kann
- Hinweis bei lokalen Synology/LAN-Adressen wie 192.168.x.x
- Hinweise bei falschem Token, falscher URL oder Reverse-Proxy-Fehler

Wichtig: Läuft die Schulden-App auf Railway und Paperless nur lokal auf der Synology, kann Railway die lokale Adresse nicht erreichen. Nutze dann eine sichere HTTPS-Adresse für Paperless oder betreibe die Schulden-App im selben Netzwerk.


## Paperless HTTPS / Synology Zertifikat
Wenn Paperless mit einem selbstsignierten oder unvollständigen Zertifikat läuft und die Meldung `UNABLE_TO_VERIFY_LEAF_SIGNATURE` erscheint, gibt es zwei Wege:

1. Empfohlen: Im Reverse Proxy ein gültiges Let's-Encrypt-Zertifikat mit vollständiger Zertifikatskette/fullchain nutzen.
2. Nur für private Installationen: Railway Variable `PAPERLESS_ALLOW_SELF_SIGNED=true` setzen oder in der App den Haken „Selbstsigniertes/privates HTTPS-Zertifikat erlauben“ aktivieren.



## v82 - Paperless Zertifikat-Haken Fix
- Der Haken „Selbstsigniertes/privates HTTPS-Zertifikat erlauben“ wirkt jetzt auch, wenn PAPERLESS_URL und PAPERLESS_TOKEN über Railway-Variablen gesetzt sind.
- Alternative bleibt: PAPERLESS_ALLOW_SELF_SIGNED=true in Railway setzen.
- Handy-Seite wurde nicht bewusst verändert.


## v83 - Paperless Tag-Filter App

- Paperless-Suche filtert jetzt fest auf den Tag `App`.
- Es werden nur Dokumente angezeigt, die in Paperless mit `App` markiert sind.
- Optional kann der Tag in Railway mit `PAPERLESS_TAG=App` angepasst werden.
- Handy-Seite wurde nicht bewusst verändert.
