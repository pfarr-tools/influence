# Pfarr.Media – Codex-Startpaket

Dieses Paket enthält einen umsetzbaren Plan für ein lokales Node.js-Projekt, das aus einem kirchenjahresbasierten Redaktionskalender vollständige Social-Media-Contentpakete erzeugt.

## Ziel

Aus strukturierten Kalenderdaten entstehen mit OpenAI und Flux:

- Facebook-Texte
- Instagram-Captions
- Mastodon-Posts
- Story-Abläufe
- Reel-Skripte
- Bildkonzepte und Flux-Prompts
- Alt-Texte
- gerenderte Social-Media-Grafiken in mehreren Formaten

Canva ist nicht erforderlich. Das Layout wird reproduzierbar mit HTML/CSS und Playwright gerendert.

## Enthalten

- `docs/CODEX_PLAN.md` – vollständiger Arbeitsplan für Codex
- `docs/ARCHITECTURE.md` – Zielarchitektur und Datenfluss
- `docs/PROMPTS.md` – empfohlene Prompt-Struktur
- `docs/CONTENT_SCHEMA.md` – Struktur der erzeugten Contentpakete
- `config/.env.example` – benötigte Umgebungsvariablen
- `config/settings.example.json` – Beispielkonfiguration
- `data/redaktionskalender-2026-2027.json` – vorhandener Jahresplan
- `examples/content-package.example.json` – Beispiel für ein fertiges Contentpaket

## Empfohlener Einstieg

1. Paket entpacken.
2. Repository initialisieren.
3. Codex mit `docs/CODEX_PLAN.md` arbeiten lassen.
4. Zuerst nur Phase 1 bis 3 umsetzen.
5. Danach echte OpenAI- und Flux-Aufrufe ergänzen.

## Technologievorschlag

- Node.js 22+
- TypeScript
- Zod
- SQLite mit better-sqlite3 oder zunächst JSON-Dateien
- OpenAI SDK
- Flux-API per `fetch`
- Playwright
- optional FFmpeg
- Vitest
- Commander oder tsx für CLI-Kommandos

## Grundregel

Die Redaktionsdatenbank bleibt die Quelle der Wahrheit. KI-Ausgaben werden stets als strukturierte JSON-Daten gespeichert und nie direkt veröffentlicht.
