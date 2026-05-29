# Schulden v21

Railway-Version mit automatischer Synchronisierung.

Die App speichert lokal und synchronisiert zusätzlich über `/api/sync` auf dem Railway-Server.

Wichtig für dauerhafte Daten: In Railway am besten ein Volume einrichten und als Variable `DATA_DIR=/data` setzen. Ohne Volume können die Serverdaten bei Redeploy/Neustart verloren gehen; die lokalen Daten im Browser bleiben trotzdem erhalten.
