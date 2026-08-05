# CLI-Nutzung Phase 6

Diese Dokumentation beschreibt den in Phase 6 ergänzten Stand des Projekts. Das System kann jetzt aus vorhandenen `content.json`-Paketen und optional vorhandenen Hintergrundbildern fertige Social-Media-Grafiken per HTML/CSS und Playwright rendern.

Wichtig: Der Renderer erzeugt nicht mehr nur eine Grafik pro Seitenverhältnis. Er produziert jetzt alle konkret im `content.json` beschriebenen Seiten:

- jede Karte aus `platforms.instagram.carousel`
- jede Folie aus `platforms.story.slides`
- zusätzlich eine querformatige Einzelgrafik für Facebook/Mastodon

## Voraussetzungen

- vorhandenes `content.json` pro Beitrag, zum Beispiel aus `content scaffold` oder `content generate`
- optional vorhandene Hintergrundbilder aus Phase 5 unter `output/<datum>/<post-id>/assets/`
- installierte Playwright-Browser für produktive Renderläufe

## Playwright-Browser installieren

Der Renderer verwendet in diesem Repository `chromium.launch(...)`. Deshalb muss lokal mindestens ein funktionsfähiger Playwright-Chromium-Browser installiert sein.

Empfohlener Setup:

```bash
npx playwright install chromium
```

Wenn auf dem System zusätzlich noch Linux-Abhängigkeiten fehlen, ist auf Debian/Ubuntu-artigen Systemen meist dieser kombinierte Befehl sinnvoll:

```bash
npx playwright install --with-deps chromium
```

Wenn du alle von Playwright unterstützten Standardbrowser statt nur Chromium installieren willst:

```bash
npx playwright install
```

Prüfen kannst du die lokal installierte Playwright-Version mit:

```bash
npx playwright --version
```

Nach einem Upgrade des `playwright`-Pakets sollten die Browser erneut installiert werden, damit die zu dieser Paketversion passenden Browser-Binaries vorhanden sind.

## Neue Befehle

### Einzelnen Beitrag rendern

```bash
npm run dev -- render post --post-id post-0001
```

### Ganze Woche rendern

```bash
npm run dev -- render week --date 2026-08-10
```

## Optionen

```text
--force
```

## Unterstützte Templates

Die Rendererlogik ordnet die Kalender-Rubriken auf sechs wiederverwendbare Templatefamilien ab:

- `Mit dem Wochenspruch in die Woche` und `Wochenspruch – meditativ` -> `Wochenspruch`
- `Gebet oder Lied` -> `Gebet oder Liedgedanke`
- `Mittwochsserie` -> `Wissenskarussell`
- `Reli fragt` -> `Reli fragt`
- `Predigt-Preview` -> `Predigt-Preview`
- `Gemeinde lebt` -> `Gemeinde lebt`

## Unterstützte Ausgabeflächen

Für jeden Renderlauf werden immer alle drei Zielformate bedient:

- Instagram Feed: `1080x1350`
- Instagram Story/Reel Cover: `1080x1920`
- Facebook/Mastodon quer: `1200x630`

Die Anzahl der tatsächlich erzeugten Dateien hängt vom Inhalt des `content.json` ab:

- Instagram Feed: eine Datei pro Carousel-Karte, sonst eine einzelne Feed-Grafik
- Instagram Story/Reel Cover: eine Datei pro Story-Slide, sonst eine einzelne Story-Grafik
- Facebook/Mastodon quer: immer eine einzelne Landscape-Grafik

## Ausgaben

Für jeden Beitrag werden nummerierte Renderseiten gespeichert. Beispiel für einen Beitrag mit 4 Carousel-Karten und 4 Story-Slides:

- `output/<datum>/<post-id>/render-instagram-feed-01.html`
- `output/<datum>/<post-id>/render-instagram-feed-01.png`
- `output/<datum>/<post-id>/render-instagram-feed-02.html`
- `output/<datum>/<post-id>/render-instagram-feed-02.png`
- `output/<datum>/<post-id>/render-instagram-feed-03.html`
- `output/<datum>/<post-id>/render-instagram-feed-03.png`
- `output/<datum>/<post-id>/render-instagram-feed-04.html`
- `output/<datum>/<post-id>/render-instagram-feed-04.png`
- `output/<datum>/<post-id>/render-instagram-story-01.html`
- `output/<datum>/<post-id>/render-instagram-story-01.png`
- `output/<datum>/<post-id>/render-instagram-story-02.html`
- `output/<datum>/<post-id>/render-instagram-story-02.png`
- `output/<datum>/<post-id>/render-instagram-story-03.html`
- `output/<datum>/<post-id>/render-instagram-story-03.png`
- `output/<datum>/<post-id>/render-instagram-story-04.html`
- `output/<datum>/<post-id>/render-instagram-story-04.png`
- `output/<datum>/<post-id>/render-facebook-mastodon-01.html`
- `output/<datum>/<post-id>/render-facebook-mastodon-01.png`
- `output/<datum>/<post-id>/render-results.json`

Die HTML-Dateien bleiben absichtlich erhalten, damit Layoutprobleme lokal nachvollziehbar und testbar sind.

## Regeln

- Rendering erfolgt mit HTML/CSS, nicht mit Canvas-Pixelcode.
- Vorhandene liturgische oder thematische Farben bleiben Akzente, nicht Vollflächenlogik.
- Bibelzitate werden nicht automatisch gekürzt. Für Wochenspruch-Beiträge wird der eigentliche Vers in den gerenderten Feed-/Story-Seiten sichtbar gemacht.
- Textüberlauf wird erkannt und als Warnung in CLI-Ausgabe und `render-results.json` festgehalten.
- Wenn kein passendes Hintergrundbild vorhanden ist, rendert das System mit einer eingebauten Verlaufsgestaltung weiter.

## Verifikation

Mindestens diese Befehle sollten erfolgreich laufen:

```bash
npm run typecheck
npm test
npm run lint
```
