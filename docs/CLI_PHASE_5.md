# CLI-Nutzung Phase 5

Diese Dokumentation beschreibt den in Phase 5 ergänzten Stand des Projekts. Das System kann jetzt textfreie Bildjobs aus vorhandenen `content.json`-Paketen ableiten und über einen konfigurierbaren Flux-Endpunkt ausführen.

## Voraussetzungen

- vorhandenes `content.json` pro Beitrag, zum Beispiel aus `content scaffold` oder `content generate`
- optional `FLUX_API_KEY`
- `FLUX_API_BASE_URL`, für BFL typischerweise `https://api.bfl.ai`
- optional `FLUX_API_GENERATE_PATH`, Standard: `/v1`
- optional `FLUX_MODEL`, Standard: `flux-2-pro-preview`

## `FLUX_MODEL`

Aktuelle offizielle BFL-Modell-/Endpoint-Slugs laut Dokumentation vom 5. August 2026:

- `flux-2-max`
- `flux-2-pro-preview`
- `flux-2-pro`
- `flux-2-flex`
- `flux-2-klein-4b`
- `flux-2-klein-9b-preview`
- `flux-2-klein-9b`
- `flux-kontext-max`
- `flux-kontext-pro`
- `flux-pro-1.1-ultra`
- `flux-pro-1.1`
- `flux-pro`
- `flux-dev`

Empfehlung laut BFL: mit `flux-2-pro-preview` oder `flux-2-klein-9b-preview` starten, wenn kein fest gepinnter Snapshot nötig ist.

Die BFL-Integration in diesem Repository unterstützt jetzt den offiziellen asynchronen Ablauf:

- Submit an `POST https://api.bfl.ai/v1/<modell-slug>`
- `polling_url` aus der Antwort verwenden
- fertiges Bild von `result.sample` herunterladen

Beispielkonfiguration:

```bash
FLUX_API_BASE_URL=https://api.bfl.ai
FLUX_API_GENERATE_PATH=/v1
FLUX_MODEL=flux-2-pro-preview
```

## Neue Befehle

### Einzelnen Beitrag bebildern

```bash
npm run dev -- image generate --post-id post-0001
```

### Ganze Woche bebildern

```bash
npm run dev -- image generate-week --date 2026-08-10
```

## Optionen

```text
--dry-run
--force
--model <name>
--seed <integer>
```

## Ausgaben

Für jeden Beitrag werden getrennt gespeichert:

- `output/<datum>/<post-id>/assets/background-4x5.webp`
- `output/<datum>/<post-id>/assets/background-9x16.webp`
- `output/<datum>/<post-id>/assets/background-1.91x1.webp`
- `output/<datum>/<post-id>/raw-flux-response-<format>.json`
- `output/<datum>/<post-id>/image-generation-results.json`

Zusätzlich werden erfolgreiche Asset-Pfade in `content.json -> metadata.assets` ergänzt.

## Dry-Run

Mit `--dry-run` wird kein API-Aufruf ausgeführt. Stattdessen zeigt die CLI pro Zielformat:

- Modell
- Seitenverhältnis
- Pixelmaße
- Prompt
- Negative Prompt
- optionalen Seed

## Regeln

- Bildprompts bleiben textfrei.
- Die Zielformate werden aus den Zielplattformen abgeleitet:
  - Instagram Feed/Karussell -> `4:5`
  - Instagram Story -> `9:16`
  - Facebook und Mastodon Bildposts -> `1.91:1`
- Teilfehler bleiben sichtbar: Jeder Job speichert seinen Status und bei Fehlern die Fehlermeldung.

## Verifikation

Mindestens diese Befehle sollten erfolgreich laufen:

```bash
npm run typecheck
npm test
npm run lint
```
