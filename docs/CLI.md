![Influence](assets/logo-wordmark.svg)

# Influence per CLI

## Überblick

Die CLI ist der technische Arbeitszugang zu Influence. Sie deckt Validierung, Gerüst-Erzeugung, Content-Generierung, QA, Bildverarbeitung, Rendering, Chat-Revisionen und den Start der Review-Oberfläche ab.

Aufgerufen wird sie im Projekt üblicherweise so:

```bash
influence <kommando>
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
PUBLICATION_PLATFORMS=facebook,instagram,mastodon,linkedin
PUBLICATION_DEFAULT_TIME=07:00
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_ACCESS_TOKEN=EAAB...
INSTAGRAM_ACCOUNT_ID=17841400000000000
INSTAGRAM_ACCESS_TOKEN=...
PUBLIC_BASE_URL=https://example.org
# Optional: override the Graph API host/version when Meta changes defaults.
# INSTAGRAM_GRAPH_API_URL=https://graph.instagram.com
# INSTAGRAM_GRAPH_API_VERSION=v23.0
# Optional: override the Facebook Graph API host/version.
# FACEBOOK_GRAPH_API_URL=https://graph.facebook.com
# FACEBOOK_GRAPH_API_VERSION=v23.0
LINKEDIN_AUTHOR_URN=urn:li:organization:123456789
LINKEDIN_ACCESS_TOKEN=...
# Optional; default: 202606.
# LINKEDIN_API_VERSION=202606
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
influence calendar validate content/content-plan.json
```

### Content-Plan validieren

```bash
influence plan validate
influence plan validate content/content-plan.json
```

### Woche auflisten

```bash
influence calendar list-week 2026-08-10
```

### Monat auflisten

```bash
influence calendar list-month 2026-08
```

## Content

### Gerüst für einen Beitrag erzeugen

```bash
influence content scaffold --post-id post-0001
```

### Gerüst für eine Woche erzeugen

```bash
influence content scaffold-week --date 2026-08-10
```

### Content für einen Beitrag generieren

```bash
influence content generate --post-id post-0001

# Mark manually authored content as generated
influence content mark-generated --post-id post-0001
```

Wichtige Optionen:

- `--dry-run`
- `--force`
- `--model <name>`
- `--language <language>`

### Content für eine Woche generieren

```bash
influence content generate-week --date 2026-08-10
```

### Content für einen Monat generieren

```bash
influence content generate-month --month 2026-08
```

## Gebete

Die universellen Gebets-Scaffolds in `assets/prayers/` werden mit einem Datum
versehen und als normale, noch nicht freigegebene Beiträge in den Content-Kalender
übernommen. Ohne `--date` erzeugt der Morgenlauf den nächsten Tag, der Abendlauf
den aktuellen Tag:

Für Morgengebet und Abendgebet aktiviert Influence automatisch die Websuche der
Responses API. Dadurch kann das Modell vor dem Entwurf aktuelle Situationen aus
der Nachrichtenlage prüfen. Dafür ist keine zusätzliche Anwendungskonfiguration
nötig; der verwendete OpenAI API-Schlüssel muss Zugriff auf die Responses API mit
Websuche haben.

```bash
influence prayer generate --kind morning
influence prayer generate --kind evening

# equivalent npm invocation
npm run prayer:generate -- --kind morning
```

Für Cron (aus dem Projektverzeichnis, mit der gewünschten `.env`-Konfiguration):

```cron
0 16 * * * cd /path/to/influence && ./node_modules/.bin/influence prayer generate --kind morning >> /var/log/influence-prayers.log 2>&1
0 11 * * * cd /path/to/influence && ./node_modules/.bin/influence prayer generate --kind evening >> /var/log/influence-prayers.log 2>&1
```

Mit `--date YYYY-MM-DD` lässt sich ein Lauf gezielt wiederholen; `--force` ist
nötig, wenn ein vorhandenes Content-Paket überschrieben werden soll. Die
generierten Beiträge bleiben in Arbeit und müssen weiterhin in der Review-UI
geprüft, durch QA geführt und ausdrücklich zur Veröffentlichung freigegeben
werden.

## Qualitätssicherung

### QA für einen Beitrag

```bash
influence qa post --post-id post-0001
```

### QA für eine Woche

```bash
influence qa week --date 2026-08-10
```

## Bilder

### Standard-Bilder für einen Beitrag erzeugen

```bash
influence image generate --post-id post-0001
```

Optionen:

- `--dry-run`
- `--force`
- `--model <name>`
- `--seed <number>`

### Standard-Bilder für eine Woche erzeugen

```bash
influence image generate-week --date 2026-08-10
```

### Reel-Bilder für einen Beitrag erzeugen

```bash
influence image generate-reel --post-id post-0001
```

### Reel-Bilder für eine Woche erzeugen

```bash
influence image generate-reel-week --date 2026-08-10
```

## Rendering

### Social-Bilder für einen Beitrag rendern

```bash
influence render post --post-id post-0001
```

### Social-Bilder für eine Woche rendern

```bash
influence render week --date 2026-08-10
```

### Reel für einen Beitrag rendern

```bash
influence render reel --post-id post-0001
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
influence render reel-week --date 2026-08-10
```

## Chat und JSON-Revision

Die Chat-Kommandos arbeiten mit persistenten Sitzungen in `content/chat-sessions/`.

### Sitzung für einen Beitrag starten

```bash
influence chat start --post-id post-0001
```

### Sitzung für eine Woche starten

```bash
influence chat start --date 2026-08-10
```

### Sitzung für einen Plan starten

```bash
influence chat start --plan examples/content-package.example.json
```

Optional:

- `--prompt <text>`
- `--model <name>`

### Nachricht senden

```bash
influence chat message --session-id <id> --text "Bitte kürze den Facebook-Text."
```

### Revision anfordern

```bash
influence chat revise --session-id <id>
```

### Letzte gültige Revision anwenden

```bash
influence chat apply --session-id <id>
```

### Sitzung anzeigen

```bash
influence chat show --session-id <id>
```

## Review-Oberfläche starten

```bash
influence review serve
```

Optionen:

- `--host <host>` Standard: `127.0.0.1`
- `--port <port>` Standard: `3040`

Beispiel:

```bash
influence review serve --host 127.0.0.1 --port 3040
```

`Auf Facebook teilen` in der Review-Oberfläche verwendet `PUBLIC_BASE_URL`.
Ohne diesen Wert würde Facebook sonst eine lokale URL wie `127.0.0.1`
bekommen.

## Veröffentlichung planen

Sobald ein Beitrag in der Review-Oberfläche mit `Veröffentlichung freigeben`
freigegeben wird, legt Influence automatisch Publication-Jobs für die in
`PUBLICATION_PLATFORMS` konfigurierten Kanäle an. Die Uhrzeiten kommen aus den
der `PUBLICATION_DEFAULT_TIME`-Variable; ein abweichender Zeitpunkt kann pro Beitrag im Feld `veroeffentlichungszeit` gesetzt werden.

Wenn der Beitrags-Termin später verschoben wird, werden bestehende geplante
Kanaltermine auf das neue Datum übernommen, die lokale Uhrzeit pro Kanal bleibt
dabei erhalten.

Die Freigabe kann auch direkt über die CLI erfolgen:

```bash
influence publish approve --post-id post-0007
```

Dabei gelten dieselben Voraussetzungen wie in der Review-Oberfläche. Mit
`--force` lässt sich die Statusprüfung des Beitrags übergehen:

```bash
influence publish approve --post-id post-0007 --force
```

Die konfigurierten Plattformen werden dabei automatisch zum vorgesehenen
Zeitpunkt eingeplant.

## Typische Arbeitssequenzen

### Einzelner Beitrag

```bash
influence content scaffold --post-id post-0001
influence content generate --post-id post-0001
influence qa post --post-id post-0001
influence image generate --post-id post-0001
influence render post --post-id post-0001
```

### Beitrag mit Reel

```bash
influence content generate --post-id post-0001
influence image generate --post-id post-0001
influence image generate-reel --post-id post-0001
influence render post --post-id post-0001
influence render reel --post-id post-0001
```

### Ganze Woche

```bash
influence content scaffold-week --date 2026-08-10
influence content generate-week --date 2026-08-10
influence qa week --date 2026-08-10
influence image generate-week --date 2026-08-10
influence render week --date 2026-08-10
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
influence publish preview --post-id post-0007 --platform instagram
influence publish preview --post-id post-0007 --platform instagram --format story
influence publish schedule --post-id post-0007 --platform mastodon --at 2026-08-16T08:05:00+02:00
influence publish schedule --post-id post-0007 --platform instagram --format story --at 2026-08-16T07:00:00+02:00
influence publish schedule --post-id post-0007 --platform mastodon --at now
influence publish run
influence publish retry --job-id <id>
```

Aktive Jobs werden in `content/publication-jobs.json` mit Text, Assets, Status und Retry-Historie gespeichert. Nach erfolgreicher Veröffentlichung wird der vollständige Job nach `content/<datum>/<post>/published.json` verschoben; dadurch bleibt die Warteschlange klein und die Veröffentlichungshistorie beim Beitrag erhalten. `influence publish run` zeigt beim Prüfen, Starten und Beenden jedes Jobs einen Status an. Zugangsdaten werden nicht in Jobs oder API-Metadaten abgelegt.

Instagram-Posts verwenden die gerenderten `instagram-feed`-Bilder als Carousel (2–10 Seiten). Instagram Stories verwenden mit `--format story` jeweils ein gerendertes `instagram-story`-Bild pro Job. Die Bilder müssen über `PUBLIC_BASE_URL/files/...` öffentlich erreichbar sein; Meta akzeptiert keine lokalen Dateipfade.

Facebook-Profile bleiben manuell:

```bash
influence publish facebook --post-id post-0007
influence publish mark-published --post-id post-0007 --platform facebook
```

Die Ausgabe enthält Text, Assets und – bei gesetztem `PUBLIC_BASE_URL` – den Facebook-Sharer-Link. Der Share-Dialog wird nicht automatisiert bedient.
