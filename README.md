![Influence](docs/assets/logo-wordmark.svg)

# Influence

Influence ist ein lokales, dateibasiertes Werkzeug für Redaktionsplanung,
KI-gestützte Inhaltserstellung, Bildgenerierung, Social-Media-Rendering,
Qualitätssicherung und menschliche Freigabe. Es richtet sich an kleine
Redaktionen, Gemeinden, Organisationen und Einzelpersonen, die ihre Inhalte
transparent im eigenen Projektverzeichnis verwalten möchten.

Influence veröffentlicht nichts automatisch ohne einen expliziten Freigabe-
und Veröffentlichungsworkflow. Kalender, Contentpakete, QA-Ergebnisse,
Assets, Renderings und Veröffentlichungsjobs bleiben als nachvollziehbare
Dateien unter `content/` erhalten.

## Funktionen

- Jahres- oder Themenkalender als validiertes JSON
- Gerüste und strukturierte Contentpakete für einzelne Beiträge, Wochen oder Monate
- optionale OpenAI-Generierung mit validierten JSON-Ausgaben
- optionale Flux/BFL-Bildgenerierung für textfreie Motive
- HTML/CSS-Rendering für Feed-, Story-, Reel- und Querformate
- QA für Pflichtfelder, Quellen, Alt-Texte, Datenschutz und Plattformlängen
- lokale Review-Oberfläche zum Bearbeiten, Prüfen, Freigeben und Exportieren
- Chat-gestützte Revisionen strukturierter Beiträge
- optionale Reels mit ffmpeg und Voiceover
- Veröffentlichungsqueue mit Plattformadaptern und Retry-Historie

## Voraussetzungen

- Node.js `24.x`
- npm
- Chromium für Playwright-Rendering
- optional `ffmpeg` für Reels
- optional API-Zugänge für OpenAI, Flux/BFL und die gewünschten Plattformen

## Installation

```bash
npm install
npx playwright install chromium
cp config/.env.example config/.env
```

Anschließend `config/.env` ausfüllen. Die vollständige, kommentierte
Variablenliste steht in [config/.env.example](config/.env.example). Geheimnisse
gehören ausschließlich in diese lokale Datei oder in die Prozessumgebung; sie
dürfen nicht committed oder in Logs/Payloads gespeichert werden.

Für den ersten eigenen Kalender kann
[examples/content-plan.empty.json](examples/content-plan.empty.json) kopiert
und anschließend mit Wochen und Beiträgen befüllt werden:

```bash
cp examples/content-plan.empty.json content/content-plan.json
influence calendar validate content/content-plan.json
```

## Schnellstart

```bash
influence calendar validate content/content-plan.json
influence content scaffold --post-id post-0001
influence review serve --host 127.0.0.1 --port 3040
```

Die Oberfläche ist danach unter `http://127.0.0.1:3040/` erreichbar.
Im eigenen Betrieb sollte der Review-Server zusätzlich durch HTTP Basic Auth
oder eine gleichwertige Reverse-Proxy-Regel geschützt werden. Er ist damit
nicht als frei öffentlich zugängliche Oberfläche gedacht.

## Konfiguration und Branding

Persönliche oder organisationsbezogene Angaben werden nicht im Quellcode
vorausgesetzt. Verwende insbesondere `BRAND_NAME`, `BRAND_WEBSITE`,
`SOURCE_MARK` und `IMAGE_CREDITS`. `PUBLIC_BASE_URL` muss gesetzt werden, wenn
externe Plattformen auf gerenderte Assets zugreifen sollen. Plattformen werden
nur aktiviert, wenn ihre Zugangsdaten vollständig und rechtlich zulässig
konfiguriert sind.

## Typischer Workflow

1. Redaktionsplan anlegen und validieren.
2. Beiträge scaffolden oder aus Kalenderdaten erzeugen.
3. Texte, Quellen, Bildkonzepte und Alt-Texte in der Review-Oberfläche prüfen.
4. QA ausführen und kritische Befunde klären.
5. Bilder und Social-Grafiken erzeugen oder eigene Assets hochladen.
6. Ergebnis redaktionell freigeben.
7. Optional Veröffentlichungsjobs planen, Vorschauen prüfen und `publish run`
   ausdrücklich ausführen.

## Dokumentation

- [Admin.md](docs/Admin.md) – Installation, Konfiguration, Sicherheit, Betrieb und Plattformzugänge
- [Benutzer.md](docs/Benutzer.md) – Arbeit in der Review-Oberfläche
- [CLI.md](docs/CLI.md) – vollständige Kommandoübersicht und Beispiele
- [ARCHITECTURE.md](build/ARCHITECTURE.md) – Datenfluss und technische Grenzen
- [PROMPTS.md](build/PROMPTS.md) – redaktionelle und bildbezogene Promptregeln
- [CODEX_PLAN.md](build/CODEX_PLAN.md) – historischer Implementierungsplan und bekannte Ausbauideen

## Entwicklung

```bash
npm run typecheck
npm test
npm run lint
npm run review:frontend:build
```

## Releases

Commits sollten Conventional-Commit-Präfixe wie `feat:`, `fix:`, `docs:` oder
`chore:` verwenden. Ein lokaler Release-Lauf aktualisiert `package.json`,
`package-lock.json` und [CHANGELOG.md](CHANGELOG.md), erzeugt einen Git-Tag und
einen Release-Commit:

```bash
npm run release
# oder beim ersten Release:
npm run release:first
```

Der Befehl pusht weder Commits/Tags noch veröffentlicht er automatisch bei npm.
Nach Prüfung können Commit, Tag und gegebenenfalls ein GitHub-/npm-Release
separat veröffentlicht werden. `standard-version` ist bewusst nur ein lokales
Release-Werkzeug.

Die Tests verwenden Mocks für externe Dienste. Für echte API-Aufrufe und
öffentliche Veröffentlichungen sind eigene Konten, aktuelle Providerregeln,
Datenschutzprüfung und manuelle Tests erforderlich.

## Daten, Rechte und Verantwortung

Die mitgelieferten Fonts, Bilder, Losungen und sonstigen Beispieldaten können
eigenen Lizenzbedingungen unterliegen. Vor einer Weitergabe müssen ihre Rechte
und die Rechte aller zusätzlich verwendeten Quellen geprüft werden. Besonders
Bibelübersetzungen, Liedtexte, Personenfotos, Gemeindemeldungen und
personenbezogene Daten dürfen nicht ungeprüft veröffentlicht werden.

Influence ist freie Software unter der [GNU General Public License, Version 3
oder höher](LICENSE).
