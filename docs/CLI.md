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

Playwright-Chromium installierst du einmalig so:

```bash
npx playwright install chromium
```

Für öffentliche Share-Links und automatische Kanalplanung sind diese
`config/.env`-Werte relevant:

```dotenv
PUBLIC_BASE_URL=https://example.org
PUBLICATION_TIMEZONE=Europe/Berlin
PUBLICATION_PLATFORMS=facebook,instagram,mastodon
PUBLICATION_DEFAULT_TIME_FACEBOOK=12:00
PUBLICATION_DEFAULT_TIME_INSTAGRAM=08:00
PUBLICATION_DEFAULT_TIME_MASTODON=08:15
```

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

`Auf Facebook teilen` in der Review-Oberfläche verwendet `PUBLIC_BASE_URL`.
Ohne diesen Wert würde Facebook sonst eine lokale URL wie `127.0.0.1`
bekommen.

## Veröffentlichung planen

Sobald ein Beitrag in der Review-Oberfläche mit `Veröffentlichung freigeben`
freigegeben wird, legt Influence automatisch Publication-Jobs für die in
`PUBLICATION_PLATFORMS` konfigurierten Kanäle an. Die Uhrzeiten kommen aus den
jeweiligen `PUBLICATION_DEFAULT_TIME_*`-Variablen.

Wenn der Beitrags-Termin später verschoben wird, werden bestehende geplante
Kanaltermine auf das neue Datum übernommen, die lokale Uhrzeit pro Kanal bleibt
dabei erhalten.

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
## Veröffentlichen und terminieren

Freigegebene Inhalte können als lokale Publication Jobs geplant werden. Ohne den Status `freigegeben` wird kein Job angelegt.

```bash
npm run dev -- publish preview --post-id post-0007 --platform instagram
npm run dev -- publish schedule --post-id post-0007 --platform mastodon --at 2026-08-16T08:05:00+02:00
npm run dev -- publish run
npm run dev -- publish retry --job-id <id>
```

Jobs werden in `output/publication-jobs.json` mit Text, Assets, Status und Retry-Historie gespeichert. Zugangsdaten werden nicht in Jobs oder API-Metadaten abgelegt.

Facebook-Profile bleiben manuell:

```bash
npm run dev -- publish facebook --post-id post-0007
npm run dev -- publish mark-published --post-id post-0007 --platform facebook
```

Die Ausgabe enthält Text, Assets und – bei gesetztem `PUBLIC_BASE_URL` – den Facebook-Sharer-Link. Der Share-Dialog wird nicht automatisiert bedient.
