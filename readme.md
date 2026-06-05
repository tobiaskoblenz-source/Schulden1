# Schulden Manager v86

Paperless-ngx-Anbindung verbessert:

- Paperless-Tag ist jetzt in der App einstellbar.
- Neuer Button **Tags laden**: lädt die Tags direkt aus Paperless und du kannst den richtigen Tag anklicken.
- Neuer Button **Alle testen**: zeigt Dokumente ohne Tagfilter, um zu prüfen, ob Paperless-Dokumente grundsätzlich geliefert werden.
- Diagnose bleibt enthalten.
- Standard-Tag bleibt **App**, kann aber per App oder Railway-Variable geändert werden.

Railway-Variablen optional:

```text
PAPERLESS_URL=https://deine-paperless-adresse
PAPERLESS_TOKEN=dein_api_token
PAPERLESS_ALLOW_SELF_SIGNED=true
PAPERLESS_TAG=App
```

Hinweis: Wenn "Tag nicht gefunden: App" erscheint, heißt das, dass Paperless über die API keinen Tag mit diesem Namen meldet. Dann in der App **Tags laden** drücken und den dort angezeigten exakten Tag auswählen.
