# CLI-Nutzung Phase 9

Diese Dokumentation beschreibt den in Phase 9 ergänzten Stand des Projekts. Das System kann jetzt aus freigegebenen Contentpaketen einfache Reels als `1080x1920`-MP4 mit FFmpeg erzeugen.

## Voraussetzungen

- freigegebene `content.json`-Datei
- vorhandenes vertikales Basisbild aus `image generate` oder mehrere Reel-Shot-Bilder aus `image generate-reel`
- lokal installiertes FFmpeg oder ein expliziter Pfad über `FFMPEG_BIN`
- optionale Audiodatei, wenn eine Sprechspur oder Musik mit exportiert werden soll

Audio wird in Phase 9 nicht generiert. Die Audiospur bleibt bewusst ein extern geliefertes Asset und wird nur gemuxt, wenn sie beim Rendern angegeben wird.
Untertitel werden standardmäßig mit `Atkinson Hyperlegible Next` gerendert. Wenn die Schrift nicht systemweit installiert ist, kann ein Font-Verzeichnis über `REEL_SUBTITLE_FONTS_DIR` oder per CLI angegeben werden.

## Neue Befehle

### Reel-Shot-Bilder mit Flux erzeugen

```bash
npm run dev -- image generate-reel --post-id post-0001
```

Optional:

```text
--dry-run
--force
--model flux
--seed 42
```

Für eine ganze Woche:

```bash
npm run dev -- image generate-reel-week --date 2026-08-10
```

Die erzeugten Bilder liegen unter:

- `output/<datum>/<post-id>/assets/reel-shot-01.webp`
- `output/<datum>/<post-id>/assets/reel-shot-02.webp`
- ...

### Reel mit FFmpeg rendern

```bash
npm run dev -- render reel --post-id post-0001
```

Optional mit Audio:

```bash
npm run dev -- render reel --post-id post-0001 --audio /pfad/zur/sprechspur.mp3
```

Optionale Parameter:

```text
--audio <path>
--ffmpeg-bin <path>
--subtitle-font-name <name>
--subtitle-fonts-dir <path>
--force
--rerun
```

Für eine ganze Woche:

```bash
npm run dev -- render reel-week --date 2026-08-10
```

Nur den finalen FFmpeg-Schritt mit vorhandenen Bildern erneut ausführen:

```bash
npm run dev -- render reel --post-id post-0001 --rerun
```

Das erzeugt keine neuen Flux-Bilder. Es verwendet die vorhandenen `assets/reel-shot-*.webp`-Dateien beziehungsweise `background-9x16.webp` erneut und überschreibt nur die Reel-Ausgabe.

## Schriftkonfiguration

Per `.env`:

```text
REEL_SUBTITLE_FONT_NAME=Atkinson Hyperlegible Next
REEL_SUBTITLE_FONTS_DIR=/pfad/zu/fonts
```

Per CLI:

```bash
npm run dev -- render reel --post-id post-0001 \
  --subtitle-font-name "Atkinson Hyperlegible Next" \
  --subtitle-fonts-dir /pfad/zu/fonts
```

## Ergebnisdateien

Pro Beitrag entstehen:

- `output/<datum>/<post-id>/reel/reel-1080x1920.mp4`
- `output/<datum>/<post-id>/reel/reel-subtitles.srt`
- `output/<datum>/<post-id>/reel-render-results.json`

Wenn Reel-Shot-Bilder fehlen, verwendet der Renderer automatisch `assets/background-9x16.webp` als durchgehenden Hintergrund.

## Exportverhalten

- langsamer Zoom pro Segment
- eingebrannte Untertitel aus `platforms.reel.script`
- Segmentaufteilung über vorhandene Reel-Shot-Bilder oder Fallback auf ein einzelnes vertikales Bild
- optionale Audiospur per `--audio`

## Verifikation

Mindestens diese Befehle sollten erfolgreich laufen:

```bash
npm run typecheck
npm test
npm run lint
```
