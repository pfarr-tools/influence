![Influence](assets/logo-wordmark.svg)

# Influence für Administratoren

## Überblick

Dieses Dokument beschreibt Installation, Konfiguration, Betrieb und Wartung von Influence aus technischer Sicht. Es richtet sich an Personen, die die lokale Umgebung bereitstellen, API-Zugänge verwalten und den laufenden Betrieb unterstützen.

## Systemvoraussetzungen

- Linux, macOS oder Windows mit funktionierender Node.js-Umgebung
- Node.js `22.x`
- `npm`
- Schreibzugriff auf das Projektverzeichnis
- Internetzugriff für:
  - `npm install`
  - `npx playwright install chromium`
  - optional OpenAI- und Flux-APIs
- optional `ffmpeg` im `PATH` oder über `FFMPEG_BIN`

## Installation

### 1. Repository bereitstellen

```bash
git clone <repo-url> influence
cd influence
```

### 2. Node-Abhängigkeiten installieren

```bash
npm install
```

### 3. Playwright-Browser installieren

Influence rendert Social-Grafiken über HTML/CSS und Playwright. Dafür wird mindestens Chromium benötigt.

```bash
npx playwright install chromium
```

### 4. Umgebungsdatei anlegen

```bash
cp config/.env.example config/.env
```

Danach die Werte in `config/.env` anpassen.

## Konfiguration

Influence liest Umgebungswerte aus:

- Prozessumgebung
- `config/.env`

### Wichtige Variablen

- `OPENAI_API_KEY`
  Für Content-Generierung und Chat/Revision.

- `OPENAI_MODEL`
  Standardmodell für OpenAI-Aufrufe. Beispiel: `gpt-5.6`

- `FLUX_API_KEY`
  API-Schlüssel für Bildgenerierung.

- `FLUX_API_BASE_URL`
  Basis-URL der Flux/BFL-API.

- `FLUX_API_GENERATE_PATH`
  Endpunktpfad für die Bildgenerierung.

- `FLUX_MODEL`
  Standardmodell für Bildgenerierung.

- `CONTENT_CALENDAR_PATH`
  Pfad zur Kalenderdatei. Standard: `./data/redaktionskalender-2026-2027.json`

- `OUTPUT_DIR`
  Zielverzeichnis für erzeugte Daten. Standard: `./output`

- `FFMPEG_BIN`
  Pfad zum `ffmpeg`-Binary, falls nicht global im `PATH` verfügbar.

- `REEL_SUBTITLE_FONT_NAME`
  Schriftname für eingebrannte Untertitel in Reels.

- `REEL_SUBTITLE_FONTS_DIR`
  Optionales Font-Verzeichnis für FFmpeg-Untertitel.

### Beispiel

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
FLUX_API_KEY=...
FLUX_API_BASE_URL=https://api.bfl.ai
FLUX_API_GENERATE_PATH=/v1
FLUX_MODEL=flux-2-pro-preview
CONTENT_CALENDAR_PATH=./data/redaktionskalender-2026-2027.json
OUTPUT_DIR=./output
FFMPEG_BIN=ffmpeg
TZ=Europe/Brussels
REEL_SUBTITLE_FONT_NAME=Atkinson Hyperlegible Next
REEL_SUBTITLE_FONTS_DIR=
```

## Laufende Verzeichnisse und Daten

### Eingabedaten

- `data/redaktionskalender-2026-2027.json`
  Redaktionskalender als Primärquelle.

### Ausgabedaten

Unter `output/` legt Influence pro Beitrag eine eigene Struktur an:

- `content.json`
- `raw-openai-response.json`
- `image-generation-results.json`
- `reel-image-generation-results.json`
- `qa-results.json`
- `render-results.json`
- `reel-render-results.json`
- gerenderte PNGs, HTML-Dateien und Assets
- `review-export.json`

Zusätzlich:

- `output/chat-sessions/`
  persistente JSON-Diskussionen und Revisionen

## Betriebsmodi

### CLI

Die CLI eignet sich für:

- Validierung des Kalenders
- Scaffolding und Generierung
- QA
- Bild- und Reel-Bild-Erzeugung
- Rendering
- Chat-basierte JSON-Revision

### Review-Oberfläche

Die lokale Review-Oberfläche dient für:

- Wochenübersicht
- Bearbeitung einzelner Beiträge
- QA-Sicht
- manuelle Asset-Uploads
- Voiceover-Aufnahme
- Vorschau und Export

Start:

```bash
npm run dev -- review serve --host 127.0.0.1 --port 3040
```

Standardadresse:

`http://127.0.0.1:3040/`

## Empfohlener Betriebsablauf

1. Kalender prüfen.
2. Inhalte per CLI oder UI generieren.
3. QA ausführen.
4. Bilder generieren.
5. Social-Grafiken rendern.
6. optional Reel-Bilder generieren.
7. optional Reel rendern.
8. in der UI redaktionell prüfen, korrigieren, Voiceover aufnehmen, exportieren.

## Build, Tests und Qualitätssicherung

### TypeScript-Prüfung

```bash
npm run typecheck
```

### Tests

```bash
npm test
```

### Frontend-Build der Review-Oberfläche

```bash
npm run review:frontend:build
```

## Update-Prozess

1. Änderungen einspielen.
2. Abhängigkeiten aktualisieren:

```bash
npm install
```

3. Typecheck und Tests ausführen:

```bash
npm run typecheck
npm test
```

4. Falls das Review-Frontend ausgeliefert oder versioniert wird:

```bash
npm run review:frontend:build
```

## Fehlerdiagnose

### OpenAI-Aufrufe schlagen fehl

Prüfen:

- `OPENAI_API_KEY`
- Netzwerkzugriff
- Modellname in `OPENAI_MODEL`

### Flux-Aufrufe schlagen fehl

Prüfen:

- `FLUX_API_KEY`
- `FLUX_API_BASE_URL`
- `FLUX_API_GENERATE_PATH`
- `FLUX_MODEL`

### Rendern schlägt fehl

Prüfen:

- ob Chromium via Playwright installiert ist
- ob das System lokale Browserprozesse starten darf

### Reel-Rendering schlägt fehl

Prüfen:

- ob `ffmpeg` installiert ist
- ob `FFMPEG_BIN` korrekt gesetzt ist
- ob Bild-Assets und optional Audio-Dateien vorhanden sind

### UI zeigt keine aktuellen Dateien

Die Post-Ansicht erzeugt cache-gebrochene Datei-URLs. Wenn trotzdem alte Artefakte erscheinen:

- Seite neu laden
- prüfen, ob die Aktion wirklich erfolgreich abgeschlossen wurde
- prüfen, ob die entsprechenden Dateien unter `output/` überschrieben wurden

## Sicherheit und Betriebshinweise

- API-Schlüssel nicht ins Repository einchecken.
- `output/` enthält redaktionelle Arbeitsstände und sollte regelmäßig gesichert werden.
- Die Review-Oberfläche ist für lokalen oder geschützten internen Betrieb gedacht.
- Bei Betrieb außerhalb von `127.0.0.1` sollte die Erreichbarkeit zusätzlich über Netzwerk- oder Reverse-Proxy-Regeln eingeschränkt werden.

## Verwandte Dokumente

- [Benutzer.md](Benutzer.md)
- [CLI.md](CLI.md)
- [CODEX_PLAN.md](CODEX_PLAN.md)
