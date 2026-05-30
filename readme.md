# Schulden v21

Railway-Version mit automatischer Synchronisierung.

Die App speichert lokal und synchronisiert zusätzlich über `/api/sync` auf dem Railway-Server.

Wichtig für dauerhafte Daten: In Railway am besten ein Volume einrichten und als Variable `DATA_DIR=/data` setzen. Ohne Volume können die Serverdaten bei Redeploy/Neustart verloren gehen; die lokalen Daten im Browser bleiben trotzdem erhalten.


## Version v24
- Google Drive/Korrespondenz aus v22 enthalten.
- Service-Worker-Cache aktualisiert, damit Railway nach Deploy die neue Oberfläche ausliefert.


V24: Korrespondenz-Button wird nach jedem Rendern sichtbar nachgerüstet.
