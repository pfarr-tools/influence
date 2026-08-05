# CLI-Nutzung Phase 1 und 2

Diese Dokumentation beschreibt den aktuell umgesetzten Stand des Projekts. Sie deckt ausschließlich Phase 1 und Phase 2 aus `docs/CODEX_PLAN.md` ab.

## Voraussetzungen

- Node.js 22 als Zielversion des Projekts
- npm

Hinweis: Die CLI wurde so umgesetzt, dass sie mit Node.js 22 kompatibel bleibt. In einer neueren lokalen Laufzeit kann npm bei der Installation lediglich eine Engine-Warnung ausgeben.

## Installation

Im Projektverzeichnis ausführen:

```bash
npm install
```

## Verfügbare Skripte

```bash
npm run dev -- --help
npm run typecheck
npm test
npm run lint
```

## Kalenderbefehle

### Kalenderdatei validieren

```bash
npm run dev -- calendar validate data/redaktionskalender-2026-2027.json
```

Der Befehl lädt die angegebene JSON-Datei, prüft sie vollständig gegen das Zod-Schema und meldet anschließend den Titel sowie den deklarierten Umfang.

### Woche zu einem Datum anzeigen

```bash
npm run dev -- calendar list-week 2026-08-10
```

Der Befehl verwendet standardmäßig die Datei `data/redaktionskalender-2026-2027.json`. Ausgegeben werden:

- die gefundene Kalenderwoche
- ihr Zeitraum
- ihr redaktioneller Fokus
- alle Beiträge dieser Woche in chronologischer Reihenfolge

### Monat anzeigen

```bash
npm run dev -- calendar list-month 2026-09
```

Der Befehl listet alle Beiträge des angegebenen Monats aus der Standard-Kalenderdatei auf.

## Fehlermeldungen

Die CLI liefert absichtlich lesbare Fehlermeldungen. Typische Fälle:

- Datei nicht gefunden oder nicht lesbar
- ungültiges JSON
- Schemafehler mit konkretem Pfad, zum Beispiel `wochen.0.beitraege.0.datum`
- ungültiges Datumsformat
- ungültiges Monatsformat
- kein Treffer für Woche oder Monat

## Testabdeckung

Die vorhandenen Tests decken in Phase 2 diese Fälle ab:

- gültiges Laden der vorhandenen Kalenderdatei
- Fehler bei absichtlich ungültigen Daten
- Wochenauflösung anhand eines Datums
- Monatsauflösung anhand eines Monatswertes
