# CLI-Nutzung Phase 4

Diese Dokumentation beschreibt den in Phase 4 ergänzten Stand des Projekts. Das System kann jetzt aus einem Kalendereintrag ein strukturiertes Contentpaket mit der OpenAI Responses API erzeugen.

## Voraussetzungen

- eine gültige `OPENAI_API_KEY`-Umgebungsvariable für echte Generierung
- optional `OPENAI_MODEL`, Standard: `gpt-5.6`

## Neue Befehle

### Einzelnen Beitrag generieren

```bash
npm run dev -- content generate --post-id post-0001
```

### Ganze Woche generieren

```bash
npm run dev -- content generate-week --date 2026-08-10
```

### Ganzen Monat generieren

```bash
npm run dev -- content generate-month --month 2026-09
```

## Optionen

```text
--dry-run
--force
--model <name>
--language de
```

## Ausgaben

Für jeden Beitrag werden getrennt gespeichert:

- `output/<datum>/<post-id>/content.json`
- `output/<datum>/<post-id>/raw-openai-response.json`

## Dry-Run

Mit `--dry-run` wird kein API-Aufruf ausgeführt. Stattdessen zeigt die CLI:

- das ausgewählte Modell
- den Developer-Prompt
- die strukturierte Nutzlast für den Modellaufruf

## Überschreiben bestehender Ergebnisse

Wenn bereits ein `content.json` vorhanden ist, bricht der Befehl ohne `--force` mit einer klaren Fehlermeldung ab.

## Besondere Regel für Predigt-Preview

Beiträge der Rubrik `Predigt-Preview` werden in Phase 4 nicht künstlich vervollständigt, wenn kein Predigtinput vorliegt. In diesem Fall erzeugt das System bewusst ein unfertiges Paket mit:

- `needs_input: true`
- zusätzlicher Warnung in `qa.warnings`
- einem Rohantwort-Dokument mit einem Skip-Hinweis statt einer echten API-Antwort

## Sicherheit und Qualitätslogik

Die Generierung erzwingt weiterhin das Content-Schema. Zusätzlich werden diese Regeln nach der Modellantwort noch einmal technisch abgesichert:

- Kalenderdaten bleiben Quelle der Wahrheit
- `qa.approved` bleibt immer `false`
- `needs_input` bleibt erhalten, wenn der Kalender noch Eingaben verlangt
- problematische Bildprompt-Texte mit Schrift-/Logo-Hinweisen werden geleert

## Verifikation

Mindestens diese Befehle sollten erfolgreich laufen:

```bash
npm run typecheck
npm test
npm run lint
```
