![Influence](assets/logo-wordmark.svg)

# Influence per CLI

## Überblick

Die CLI ist der technische Arbeitszugang zu Influence. Sie deckt Validierung, Gerüst-Erzeugung, Content-Generierung, QA, Bildverarbeitung, Rendering, Chat-Revisionen und den Start der Review-Oberfläche ab.

Aufgerufen wird sie im Projekt üblicherweise so:

```bash
npm run dev -- <kommando>
```

## Voraussetzungen

- installierte Projektabhängigkeiten
- korrekt konfigurierte `config/.env`
- für Rendering: installierter Playwright-Chromium
- für Reel-Video-Rendering: optional `ffmpeg`

## Allgemeine Konventionen

- `--post-id <id>` arbeitet auf einem einzelnen Beitrag
- `--date <yyyy-mm-dd>` arbeitet auf der Woche, die dieses Datum enthält
- `--month <yyyy-mm>` arbeitet auf allen Beiträgen eines Monats
- `--force` überschreibt vorhandene Artefakte
- `--dry-run` erzeugt keine externen API-Aufrufe

## Kalender

### Kalender validieren

```bash
npm run dev -- calendar validate data/redaktionskalender-2026-2027.json
```

### Woche auflisten

```bash
npm run dev -- calendar list-week 2026-08-10
```

### Monat auflisten

```bash
npm run dev -- calendar list-month 2026-08
```

## Content

### Gerüst für einen Beitrag erzeugen

```bash
npm run dev -- content scaffold --post-id post-0001
```

### Gerüst für eine Woche erzeugen

```bash
npm run dev -- content scaffold-week --date 2026-08-10
```

### Content für einen Beitrag generieren

```bash
npm run dev -- content generate --post-id post-0001
```

Wichtige Optionen:

- `--dry-run`
- `--force`
- `--model <name>`
- `--language <language>`

### Content für eine Woche generieren

```bash
npm run dev -- content generate-week --date 2026-08-10
```

### Content für einen Monat generieren

```bash
npm run dev -- content generate-month --month 2026-08
```

## Qualitätssicherung

### QA für einen Beitrag

```bash
npm run dev -- qa post --post-id post-0001
```

### QA für eine Woche

```bash
npm run dev -- qa week --date 2026-08-10
```

## Bilder

### Standard-Bilder für einen Beitrag erzeugen

```bash
npm run dev -- image generate --post-id post-0001
```

Optionen:

- `--dry-run`
- `--force`
- `--model <name>`
- `--seed <number>`

### Standard-Bilder für eine Woche erzeugen

```bash
npm run dev -- image generate-week --date 2026-08-10
```

### Reel-Bilder für einen Beitrag erzeugen

```bash
npm run dev -- image generate-reel --post-id post-0001
```

### Reel-Bilder für eine Woche erzeugen

```bash
npm run dev -- image generate-reel-week --date 2026-08-10
```

## Rendering

### Social-Bilder für einen Beitrag rendern

```bash
npm run dev -- render post --post-id post-0001
```

### Social-Bilder für eine Woche rendern

```bash
npm run dev -- render week --date 2026-08-10
```

### Reel für einen Beitrag rendern

```bash
npm run dev -- render reel --post-id post-0001
```

Wichtige Optionen:

- `--audio <path>`
- `--ffmpeg-bin <path>`
- `--subtitle-font-name <name>`
- `--subtitle-fonts-dir <path>`
- `--force`
- `--rerun`

### Reels für eine Woche rendern

```bash
npm run dev -- render reel-week --date 2026-08-10
```

## Chat und JSON-Revision

Die Chat-Kommandos arbeiten mit persistenten Sitzungen in `output/chat-sessions/`.

### Sitzung für einen Beitrag starten

```bash
npm run dev -- chat start --post-id post-0001
```

### Sitzung für eine Woche starten

```bash
npm run dev -- chat start --date 2026-08-10
```

### Sitzung für einen Plan starten

```bash
npm run dev -- chat start --plan examples/content-package.example.json
```

Optional:

- `--prompt <text>`
- `--model <name>`

### Nachricht senden

```bash
npm run dev -- chat message --session-id <id> --text "Bitte kürze den Facebook-Text."
```

### Revision anfordern

```bash
npm run dev -- chat revise --session-id <id>
```

### Letzte gültige Revision anwenden

```bash
npm run dev -- chat apply --session-id <id>
```

### Sitzung anzeigen

```bash
npm run dev -- chat show --session-id <id>
```

## Review-Oberfläche starten

```bash
npm run dev -- review serve
```

Optionen:

- `--host <host>` Standard: `127.0.0.1`
- `--port <port>` Standard: `3040`

Beispiel:

```bash
npm run dev -- review serve --host 127.0.0.1 --port 3040
```

## Typische Arbeitssequenzen

### Einzelner Beitrag

```bash
npm run dev -- content scaffold --post-id post-0001
npm run dev -- content generate --post-id post-0001
npm run dev -- qa post --post-id post-0001
npm run dev -- image generate --post-id post-0001
npm run dev -- render post --post-id post-0001
```

### Beitrag mit Reel

```bash
npm run dev -- content generate --post-id post-0001
npm run dev -- image generate --post-id post-0001
npm run dev -- image generate-reel --post-id post-0001
npm run dev -- render post --post-id post-0001
npm run dev -- render reel --post-id post-0001
```

### Ganze Woche

```bash
npm run dev -- content scaffold-week --date 2026-08-10
npm run dev -- content generate-week --date 2026-08-10
npm run dev -- qa week --date 2026-08-10
npm run dev -- image generate-week --date 2026-08-10
npm run dev -- render week --date 2026-08-10
```

## Fehlerbehandlung

Die CLI beendet sich bei fachlichen oder technischen Fehlern mit Exit-Code `1` und gibt die Meldung auf `stderr` aus.

Häufige Ursachen:

- fehlende API-Schlüssel
- ungültige `post-id`
- fehlende Kalenderdatei
- fehlende Browser-Installation für Playwright
- fehlendes `ffmpeg`

## Verwandte Dokumente

- [Admin.md](Admin.md)
- [Benutzer.md](Benutzer.md)
- [CODEX_PLAN.md](CODEX_PLAN.md)
