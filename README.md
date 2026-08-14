![Influence](docs/assets/logo-wordmark.svg)

# Influence

Influence ist ein lokales Node.js-Werkzeug für die Planung, Erzeugung, Prüfung und redaktionelle Freigabe von Social-Media-Inhalten auf Basis eines strukturierten Redaktionskalenders. Das Projekt kombiniert CLI-Kommandos für automatisierte Verarbeitung mit einer lokalen Review-Oberfläche für Redakteurinnen und Redakteure.

## Zweck

Aus Kalenderdaten entstehen pro Beitrag unter anderem:

- Plattformtexte für Facebook, Instagram und Mastodon
- Story-Slides und Reel-Skripte
- Flux-Prompts und Bildkonzepte
- gerenderte Social-Grafiken in mehreren Formaten
- optional Reel-Videos mit Untertiteln und Voiceover

Die Datenhaltung bleibt dateibasiert. Die erzeugten Inhalte liegen standardmäßig unter `content/` und können dort nachvollzogen, geprüft und exportiert werden.

## Voraussetzungen

- Node.js `24.x`
- `npm`
- für Grafik-Rendering: installierter Chromium-Browser über Playwright
- optional für Reel-Video-Rendering: `ffmpeg`
- optional für produktive KI-Nutzung:
  - `OPENAI_API_KEY`
  - `FLUX_API_KEY`

## Installation

1. Abhängigkeiten installieren:

```bash
npm install
```

2. Playwright-Browser für das HTML/CSS-Rendering installieren:

```bash
npx playwright install chromium
```

3. Umgebungsdatei anlegen:

```bash
cp config/.env.example config/.env
```

4. `config/.env` an die lokale Umgebung anpassen.

## Schnellstart

Kalender prüfen:

```bash
influence calendar validate content/content-plan.json
```

Review-Oberfläche starten:

```bash
influence review serve --host 127.0.0.1 --port 3040
```

Danach ist die Oberfläche unter `http://127.0.0.1:3040/` erreichbar.

## Projektstruktur

- `src/` – CLI, Services und Review-Server
- `content/content-plan.json` – Redaktionsplan
- `content/` – erzeugte Inhalte, Bilder, Renderings, QA-Ergebnisse, Chat-Sitzungen

## Published feed

The review server exposes all successfully published posts as one JSON feed:

```text
GET /api/feed/published.json
```

Each post contains the editorial and platform texts, publication records with
remote IDs/URLs, and image URLs below `/files/`. Set `PUBLIC_BASE_URL` to the
public server URL so the image URLs are absolute and can be consumed by other
applications.
- `config/` – Umgebungs- und Beispielkonfiguration
- `docs/` – Dokumentation

## Dokumentation

- [docs/Admin.md](docs/Admin.md) – technische Dokumentation für Installation, Betrieb und Wartung
- [docs/Benutzer.md](docs/Benutzer.md) – Arbeitsablauf für Redakteurinnen und Redakteure in der UI
- [docs/CLI.md](docs/CLI.md) – Nutzung aller relevanten CLI-Kommandos
- [docs/CODEX_PLAN.md](docs/CODEX_PLAN.md) – ausführlicher Projekt- und Ausbauplan

## Hinweise

- Ohne API-Schlüssel funktionieren Gerüst, Dateistruktur, Review-UI und viele lokale Arbeitsabläufe weiterhin, produktive Generierung aber nicht.
- Für Reel-Rendering ist `ffmpeg` erforderlich.
- Die Review-Oberfläche arbeitet lokal und schreibt direkt in die Projektdateien unter `content/`.
- `content/` ist ein separates Git-Repository. Nach jeder CLI-Aktion beziehungsweise Review-Aktion werden Änderungen automatisch mit einer passenden Meldung committed und gepusht. Dafür muss im Repository ein Remote und ein Upstream-Branch eingerichtet sein.
