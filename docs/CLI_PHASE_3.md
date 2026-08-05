# CLI-Nutzung Phase 3

Diese Dokumentation beschreibt den in Phase 3 ergänzten Stand des Projekts. Es werden nur lokale Content-Gerüste erzeugt. Es gibt noch keine OpenAI-, Flux- oder Publishing-Integration.

## Ziel von Phase 3

Aus einem Kalendereintrag entsteht ein valides `content.json`, das:

- die Kalenderdaten als Quelle übernimmt
- redaktionelle Metadaten in strukturierter Form weiterträgt
- leere Textfelder bewusst leer lässt
- Hinweise für noch fehlende Eingaben und Prüfungen speichert

## Neue Befehle

### Einzelnen Beitrag gerüstweise erzeugen

```bash
npm run dev -- content scaffold --post-id post-0001
```

Ausgabe:

```text
output/2026-08-10/post-0001/content.json
```

Der Befehl verwendet standardmäßig `data/redaktionskalender-2026-2027.json`.

### Ganze Woche gerüstweise erzeugen

```bash
npm run dev -- content scaffold-week --date 2026-08-10
```

Der Befehl erzeugt für alle Beiträge der gefundenen Woche jeweils eine `content.json` unterhalb von `output/<datum>/<post-id>/`.

## Was übernommen wird

Aus dem Kalender werden unter anderem diese Informationen übernommen:

- Beitrags-ID
- Datum
- Rubrik
- Thema
- konkrete Idee
- liturgische Quelle, falls vorhanden
- redaktionelle Hinweise zu Struktur, Ziel und benötigten Eingaben

## Was bewusst noch nicht erzeugt wird

Phase 3 erzeugt keine ausformulierten Plattformtexte. Deshalb bleiben diese Felder leer, sofern der Kalender selbst nichts eingetragen hat:

- Facebook-Text
- Instagram-Caption
- Mastodon-Text
- Reel-Hook
- Bildprompt
- Alt-Text

## Hinweise zu `needs_input`

`needs_input` wird auf `true` gesetzt, wenn im Kalender aktuelle Eingaben erforderlich sind, zum Beispiel bei:

- `Gemeinde lebt`
- `Reli fragt`
- `Predigt-Preview`

## Qualität und Sicherheit

Jedes Gerüst enthält bereits:

- `qa.approved = false`
- Warnhinweise für Datenschutz, Predigtinput oder Liedrechte, wenn passend
- einen negativen Standard-Prompt für textfreie Bilder

## Verifikation

Vor dem Weiterarbeiten sollten mindestens diese Befehle erfolgreich laufen:

```bash
npm run typecheck
npm test
npm run lint
```
