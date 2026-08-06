# CLI-Nutzung Phase 8

Diese Dokumentation beschreibt den in Phase 8 ergänzten Stand des Projekts. Das System stellt jetzt eine kleine lokale Review-Oberfläche mit dem Titel `influence` bereit, die auf vorhandenen `content.json`-, QA-, Bild- und Render-Dateien arbeitet.

## Voraussetzungen

- vorhandene Inhalte unter `output/<datum>/<post-id>/`
- lokale Nutzung auf einem gebundenen Interface wie `127.0.0.1`
- für `Neu generieren` eine gesetzte `OPENAI_API_KEY`

## Neuer Befehl

### Review-Server starten

```bash
npm run dev -- review serve
```

Optionale Parameter:

```text
--host 127.0.0.1
--port 3040
```

Beispiel:

```bash
npm run dev -- review serve --host 127.0.0.1 --port 3040
```

## Funktionen der Oberfläche

- Wochenansicht mit allen Beitragskarten einer Kalenderwoche
- deutsche Datumsdarstellung inklusive Kalenderwochennummer
- Detailansicht pro Beitrag
- sichtbare Workflow-Schritte für Gerüst, Inhaltsgenerierung, QA, Bildgenerierung, Rendering, Freigabe und Export
- Vorschau der Plattformtexte für Facebook, Instagram, Mastodon und Reel
- Bildvorschau aus `metadata.assets` und vorhandenen Bildjobs
- Render-Vorschau aus `render-results.json`
- Bearbeiten zentraler Text- und Bildfelder
- `Neu generieren` für den Beitrag mit erzwungenem Überschreiben
- `Freigeben`, wenn `qa-results.json -> ready_for_approval == true`
- `Exportieren` als `review-export.json`

## Statusverhalten

- Beim Speichern von Änderungen setzt die Oberfläche `qa.approved` auf `false`.
- Geänderte Inhalte wechseln zurück auf `in Arbeit`, damit QA und Freigabe bewusst erneut erfolgen.
- `Freigeben` setzt `status = "freigegeben"` und `qa.approved = true`.

## Export

Der Export erzeugt pro Beitrag:

- `output/<datum>/<post-id>/review-export.json`

Die Datei enthält unter anderem:

- Metadaten zum Beitrag
- den aktuellen `content.json`-Inhalt
- QA-Zusammenfassung
- Liste vorhandener Bilddateien
- Liste vorhandener Renderdateien

## Verifikation

Mindestens diese Befehle sollten erfolgreich laufen:

```bash
npm run typecheck
npm test
npm run lint
```
