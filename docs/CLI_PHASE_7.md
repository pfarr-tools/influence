# CLI-Nutzung Phase 7

Diese Dokumentation beschreibt den in Phase 7 ergänzten Stand des Projekts. Das System kann jetzt regelbasierte Qualitätsprüfungen auf vorhandene `content.json`-Pakete anwenden, QA-Ergebnisse persistieren und nachgelagerte Schritte auf den Status `freigegeben` begrenzen.

## Voraussetzungen

- vorhandenes `content.json` pro Beitrag, zum Beispiel aus `content scaffold` oder `content generate`
- Schreibzugriff auf `output/<datum>/<post-id>/`

## Neue Befehle

### QA für einen einzelnen Beitrag

```bash
npm run dev -- qa post --post-id post-0001
```

### QA für eine ganze Woche

```bash
npm run dev -- qa week --date 2026-08-10
```

## Geprüfte Regeln

Die QA prüft derzeit diese Anforderungen aus Phase 7:

- Alt-Text vorhanden
- Bildprompt ohne Textanweisung
- keine leeren Pflichtfelder
- Plattformlänge plausibel
- keine erfundenen aktuellen Ereignisse
- Datenschutzwarnung bei `Reli fragt` und `Gemeinde lebt`
- Liedtextwarnung bei `Gebet oder Lied`
- Bibelstellenangabe vorhanden, wenn liturgischer oder Wochenspruch-Bezug vorliegt
- `Predigt-Preview` benötigt Predigtinput

## Statusübergänge

Die Content-Pakete verwenden diese Statuslogik:

```text
Idee -> in Arbeit -> zur Prüfung -> freigegeben -> terminiert -> veröffentlicht
```

Ein QA-Lauf setzt Beiträge ohne blockierende Fehler von `Idee` oder `in Arbeit` auf `zur Prüfung`.

Wichtig:

- QA setzt `qa.approved` nicht automatisch auf `true`.
- Die manuelle Freigabe auf `freigegeben` bleibt ein separater Schritt.
- Bildgenerierung und Rendering sind ab Phase 7 nur noch für Inhalte mit Status `freigegeben` erlaubt.

## Ausgaben

Für jeden geprüften Beitrag werden diese Dateien aktualisiert oder ergänzt:

- `output/<datum>/<post-id>/content.json`
- `output/<datum>/<post-id>/qa-results.json`

`qa-results.json` enthält unter anderem:

- `post_id`
- `content_path`
- `status_before_run`
- `status_after_run`
- `ready_for_approval`
- `warnings`
- `errors`
- `checks`

Zusätzlich wird `content.json` aktualisiert:

- `status` wechselt bei erfolgreicher QA auf `zur Prüfung`, falls der Beitrag vorher `Idee` oder `in Arbeit` war
- `qa.warnings` wird mit den aktuellen Warnungen überschrieben
- `qa.approved` bleibt `false`

## CLI-Ausgabe

Die CLI zeigt pro Beitrag:

- ob der Beitrag `ready` oder `blocked` ist
- Pfad zu `content.json`
- Pfad zu `qa-results.json`
- Status vor und nach dem QA-Lauf
- alle `error:`- und `warning:`-Zeilen

## Auswirkungen auf Folgeschritte

Die folgenden Befehle prüfen jetzt zusätzlich, ob `content.json -> status == "freigegeben"` ist:

- `npm run dev -- image generate --post-id ...`
- `npm run dev -- image generate-week --date ...`
- `npm run dev -- render post --post-id ...`
- `npm run dev -- render week --date ...`

Wenn ein Beitrag nur auf `Idee`, `in Arbeit` oder `zur Prüfung` steht, brechen diese Befehle mit einer klaren Fehlermeldung ab.

## Regeln

- QA ist regelbasiert und lokal reproduzierbar.
- Warnungen blockieren den Übergang nach `zur Prüfung` nicht automatisch.
- Fehler blockieren den Beitrag weiterhin.
- Für Rubriken mit Datenschutz- oder Aktualitätsrisiko bleiben bewusste manuelle Prüfungen Teil des Workflows.

## Verifikation

Mindestens diese Befehle sollten erfolgreich laufen:

```bash
npm run typecheck
npm test
npm run lint
```
