# Codex-Implementierungsplan für Pfarr.Media

## Rolle

Du arbeitest als erfahrener TypeScript- und Node.js-Entwickler. Baue ein lokales, transparentes und gut testbares Werkzeug zur KI-gestützten Erstellung von Social-Media-Inhalten für einen evangelischen Pfarrer.

Arbeite inkrementell. Nach jeder Phase müssen Tests laufen und die CLI benutzbar bleiben. Keine automatische Veröffentlichung in Phase 1–6.

## Projektziel

Das System liest den Jahres-Redaktionskalender aus `data/redaktionskalender-2026-2027.json`, ergänzt kirchenjahresbezogene Daten, erzeugt mit OpenAI strukturierte Contentpakete, generiert mit Flux textfreie Bildmotive und rendert daraus mit HTML/CSS und Playwright fertige Grafiken.

## Leitprinzipien

1. Die Redaktionsdatenbank ist die Quelle der Wahrheit.
2. KI-Ausgaben müssen dem JSON-Schema entsprechen.
3. Kein Text wird von Flux gerendert.
4. Veröffentlichung erfolgt nie ohne menschliche Freigabe.
5. Personenbezogene Inhalte aus Schule und Gemeinde dürfen nicht automatisch erzeugt oder erfunden werden.
6. Bibelzitate und Liedtexte müssen als sensible Quellenfelder behandelt werden.
7. Alle Schritte müssen wiederholbar sein.
8. Jeder Generator muss Dry-Run unterstützen.
9. Erstellter Code muss immer durch eine komplette, deutschsprachige End-User-Dokumentation in docs/ unterstützt werden.
10. Erstellter Code ist immer vollständig auf englisch dokumentiert (JSDoc oder äquivalent)

## Repository

Commits haben einen prefix wie "feat:", "fix:", usw. und eine sinnvolle, englischsprachige Beschreibung

# Phase 1 – Repository und Grundstruktur

Erzeuge ein TypeScript-Projekt mit dieser Struktur:

```text
src/
  cli/
  config/
  domain/
  services/
    calendar/
    openai/
    flux/
    render/
  templates/
  utils/
  index.ts
tests/
data/
output/
```

Installiere:

- typescript
- tsx
- zod
- commander
- dotenv
- openai
- playwright
- vitest
- prettier
- eslint

Erzeuge npm-Skripte:

```json
{
  "dev": "tsx src/index.ts",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "lint": "eslint .",
  "format": "prettier --write ."
}
```

Akzeptanzkriterien:

- `npm run typecheck` läuft fehlerfrei.
- `npm test` läuft fehlerfrei.
- `npm run dev -- --help` zeigt die CLI-Hilfe.

# Phase 2 – Kalenderdaten laden und validieren

Implementiere Zod-Schemas für die bestehende Jahres-JSON.

CLI:

```bash
npm run dev -- calendar validate data/redaktionskalender-2026-2027.json
npm run dev -- calendar list-week 2026-08-10
npm run dev -- calendar list-month 2026-09
```

Funktionen:

- Datei laden
- JSON validieren
- Woche anhand eines Datums finden
- alle Beiträge eines Monats ausgeben
- verständliche Validierungsfehler liefern

Akzeptanzkriterien:

- Die vorhandene JSON wird vollständig validiert.
- Falsche Daten führen zu klaren Fehlermeldungen.
- Tests decken mindestens Kalenderladen, Datumsauflösung und Fehlerfälle ab.

# Phase 3 – Contentpaket-Schema und lokale Entwürfe

Implementiere das Schema aus `docs/CONTENT_SCHEMA.md`.

CLI:

```bash
npm run dev -- content scaffold --post-id post-0001
npm run dev -- content scaffold-week --date 2026-08-10
```

Noch kein API-Aufruf. Erzeuge nur lokale Gerüste aus den Kalenderdaten.

Ausgabe:

```text
output/2026-08-10/post-0001/content.json
```

Akzeptanzkriterien:

- Für jeden Beitrag entsteht ein valides Contentpaket.
- Kalenderdaten und redaktionelle Metadaten werden übernommen.
- Freie Textfelder bleiben leer oder eindeutig als Platzhalter markiert.

# Phase 4 – OpenAI-Generator

Implementiere einen Dienst, der aus einem Kalenderbeitrag ein strukturiertes Contentpaket erzeugt.

Nutze die aktuelle OpenAI Responses API und Structured Outputs. Lies Modell und API-Key aus der Umgebung.

CLI:

```bash
npm run dev -- content generate --post-id post-0001
npm run dev -- content generate-week --date 2026-08-10
npm run dev -- content generate-month --month 2026-09
```

Optionen:

```text
--dry-run
--force
--model <name>
--language de
```

Vorgaben:

- JSON-Schema erzwingen.
- Bestehende Ergebnisse nicht überschreiben, außer mit `--force`.
- Rohantwort und validiertes Ergebnis getrennt speichern.
- Bei Reli- und Gemeinde-Beiträgen keine konkreten Ereignisse erfinden.
- Bei Predigt-Preview ohne Predigtinput nur ein unfertiges Paket mit `needs_input: true` erzeugen.

Akzeptanzkriterien:

- Strukturierte Antworten werden validiert.
- Fehlerhafte Antworten werden nicht als fertige Inhalte gespeichert.
- Tokenverbrauch und Modell werden protokolliert.
- Tests verwenden einen Mock-Client.

# Phase 5 – Flux-Bildgenerierung

Implementiere einen Flux-Client über konfigurierbare HTTP-Endpunkte.

CLI:

```bash
npm run dev -- image generate --post-id post-0001
npm run dev -- image generate-week --date 2026-08-10
```

Vorgaben:

- Immer textfreie Bilder generieren.
- Seitenverhältnis aus Zielplattform ableiten.
- Originalantwort und Bildmetadaten speichern.
- Bilddateien nach Post-ID und Format benennen.
- Wiederholbarkeit durch Seed unterstützen, sofern API verfügbar.

Beispiel:

```text
output/2026-08-10/post-0001/assets/background-4x5.webp
output/2026-08-10/post-0001/assets/background-9x16.webp
```

Akzeptanzkriterien:

- Dry-Run zeigt Request ohne API-Aufruf.
- Fehlgeschlagene Jobs werden mit Status und Fehlermeldung gespeichert.
- Kein Prompt darf Text im Bild verlangen.

# Phase 6 – HTML/CSS-Renderer

Erzeuge wiederverwendbare Templates:

1. Wochenspruch
2. Gebet oder Liedgedanke
3. Wissenskarussell
4. Reli fragt
5. Predigt-Preview
6. Gemeinde lebt

Unterstützte Formate:

- Instagram Feed: 1080×1350
- Instagram Story/Reel Cover: 1080×1920
- Facebook/Mastodon quer: 1200×630

CLI:

```bash
npm run dev -- render post --post-id post-0001
npm run dev -- render week --date 2026-08-10
```

Vorgaben:

- HTML/CSS statt Canvas-Pixelcode.
- Sichere Textabstände.
- Hoher Kontrast.
- Liturgische Farbe nur als Akzent.
- Keine automatische Kürzung von Bibelzitaten ohne Kennzeichnung.
- Textüberlauf muss erkannt werden.

Akzeptanzkriterien:

- Alle drei Formate werden erzeugt.
- Render-Snapshots oder Screenshottests vorhanden.
- Zu lange Texte führen zu einer klaren Warnung.

# Phase 7 – Qualitätsprüfung

Implementiere regelbasierte Checks vor einer möglichen Freigabe:

- Alt-Text vorhanden
- Bildprompt ohne Textanweisung
- keine leeren Pflichtfelder
- Plattformlänge plausibel
- keine erfundenen aktuellen Ereignisse
- Datenschutzwarnung bei Reli und Gemeinde
- Liedtextwarnung
- Bibelstellenangabe vorhanden
- Predigt-Preview benötigt Predigtinput

CLI:

```bash
npm run dev -- qa post --post-id post-0001
npm run dev -- qa week --date 2026-08-10
```

Statusübergang:

```text
Idee → in Arbeit → zur Prüfung → freigegeben → terminiert → veröffentlicht
```

Das System darf nur nach `freigegeben` weiterarbeiten.

# Phase 8 – Review-Oberfläche

Baue eine kleine lokale Weboberfläche, bevorzugt mit Fastify oder Express und einfacher serverseitiger UI.

Funktionen:

- Wochenansicht
- Vorschau aller Plattformtexte
- Bildvorschau
- Bearbeiten
- Neu generieren
- Freigeben
- Exportieren

Keine Authentifizierung nötig, solange die Anwendung nur lokal gebunden wird.

# Phase 9 – Video/Reels optional

Nutze FFmpeg für einfache Reels:

- Flux-Hintergrund
- langsamer Zoom
- Sprechtext als Untertitel
- optional Audiospur
- 1080×1920

Kein generatives Video in der ersten Version.

# Phase 10 – Veröffentlichung erst später

Veröffentlichung über Meta, Mastodon oder andere APIs ist ein getrenntes Modul. Niemals automatisch ohne explizite Freigabe. Zugangsdaten getrennt speichern.

# Zusätzliche Codex-Regeln

- Schreibe kleine, testbare Funktionen.
- Nutze keine `any`-Typen ohne Begründung.
- API-Antworten immer validieren.
- Geheimnisse niemals loggen.
- Beispiel- und Testdaten dürfen keine realen personenbezogenen Informationen enthalten.
- Änderungen am Kalender nur über explizite Befehle.
- Jede Phase mit einem kurzen Changelog abschließen.
