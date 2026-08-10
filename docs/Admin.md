![Influence](assets/logo-wordmark.svg)

# Influence für Administratoren

## Überblick

Dieses Dokument beschreibt Installation, Konfiguration, Betrieb und Wartung von Influence aus technischer Sicht. Es richtet sich an Personen, die die lokale Umgebung bereitstellen, API-Zugänge verwalten und den laufenden Betrieb unterstützen.

## Systemvoraussetzungen

- Linux, macOS oder Windows mit funktionierender Node.js-Umgebung
- Node.js `22.x`
- `npm`
- Schreibzugriff auf das Projektverzeichnis
- Internetzugriff für:
  - `npm install`
  - `npx playwright install chromium`
  - optional OpenAI- und Flux-APIs
- optional `ffmpeg` im `PATH` oder über `FFMPEG_BIN`

## Installation

### 1. Repository bereitstellen

```bash
git clone <repo-url> influence
cd influence
```

### 2. Node-Abhängigkeiten installieren

```bash
npm install
```

### 3. Playwright-Browser installieren

Influence rendert Social-Grafiken über HTML/CSS und Playwright. Dafür wird mindestens Chromium benötigt.

```bash
npx playwright install chromium
```

### 4. Umgebungsdatei anlegen

```bash
cp config/.env.example config/.env
```

Danach die Werte in `config/.env` anpassen.

## Konfiguration

Influence liest Umgebungswerte aus:

- Prozessumgebung
- `config/.env`

### Wichtige Variablen

- `OPENAI_API_KEY`
  Für Content-Generierung und Chat/Revision.

- `OPENAI_MODEL`
  Standardmodell für OpenAI-Aufrufe. Beispiel: `gpt-5.6`

- `FLUX_API_KEY`
  API-Schlüssel für Bildgenerierung.

- `FLUX_API_BASE_URL`
  Basis-URL der Flux/BFL-API.

- `FLUX_API_GENERATE_PATH`
  Endpunktpfad für die Bildgenerierung.

- `FLUX_MODEL`
  Standardmodell für Bildgenerierung.

- `CONTENT_CALENDAR_PATH`
  Pfad zur Kalenderdatei. Standard: `./content/content-plan.json`

- `OUTPUT_DIR`
  Zielverzeichnis für erzeugte Daten. Standard: `./content`

- `FFMPEG_BIN`
  Pfad zum `ffmpeg`-Binary, falls nicht global im `PATH` verfügbar.

- `REEL_SUBTITLE_FONT_NAME`
  Schriftname für eingebrannte Untertitel in Reels.

- `REEL_SUBTITLE_FONTS_DIR`
  Optionales Font-Verzeichnis für FFmpeg-Untertitel.

### Veröffentlichung und Service-Adapter

`PUBLICATION_PLATFORMS` bestimmt, für welche Plattformen Influence Jobs anlegt.
Eine Plattform wird automatisch veröffentlicht, wenn ihre Zugangsdaten
vollständig konfiguriert sind. Für Instagram, Threads, Bluesky und LinkedIn
sind das `*_API_URL` und `*_ACCESS_TOKEN`; Mastodon verwendet den nativen
Adapter mit `MASTODON_SERVER_URL` und `MASTODON_ACCESS_TOKEN`. Nicht
konfigurierte Plattformen bleiben in der Oberfläche und in der Queue sichtbar,
können aber nicht automatisch veröffentlicht werden.

Facebook ist derzeit eine manuelle Veröffentlichung: Influence erstellt einen
Facebook-Share-Link, es gibt dafür keinen automatischen Adapter und daher auch
keine `FACEBOOK_*`-Variablen.

#### Gemeinsamer Adapter-Vertrag

Die vier generischen HTTP-Adapter verwenden denselben HTTP-Vertrag. Die URL in
`*_API_URL` muss deshalb auf einen eigenen kleinen Bridge-Service oder auf einen
bereits vorhandenen kompatiblen Publishing-Endpunkt zeigen; die nativen
Provider-Endpunkte sind für diese vier Adapter nicht automatisch kompatibel.

Mastodon ist die erste vollständig native Integration und benötigt keinen
Bridge-Service. Sie lädt Medien direkt beim Mastodon-Server hoch und legt den
Status anschließend über `/api/v1/statuses` an.

Bei jeder Veröffentlichung sendet Influence eine `POST`-Anfrage mit:

```http
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

```json
{
  "text": "Beitragstext",
  "format": "square",
  "assets": ["/absolute/path/to/asset.png"],
  "altTexts": ["Alternativtext"]
}
```

Der Endpunkt muss bei Erfolg eine JSON-Antwort mit einer nichtleeren
`id`-Eigenschaft liefern. Eine optionale `url` wird als Link zum veröffentlichten
Beitrag gespeichert, zum Beispiel:

```json
{"id": "provider-post-id", "url": "https://example.invalid/post/123"}
```

Der Bridge-Service muss die lokalen Asset-Pfade erreichen können und die
jeweilige native API für Medien-Upload und Veröffentlichung aufrufen. Er muss
außerdem Fehler mit einem HTTP-Status außerhalb von `2xx` beantworten. Tokens
werden ausschließlich aus der Prozessumgebung gelesen und nicht in den
Publikationsjobs gespeichert.

#### Instagram

Variablen:

```dotenv
INSTAGRAM_API_URL=https://bridge.example.org/instagram/publish
INSTAGRAM_ACCESS_TOKEN=...
```

Für die native Instagram Graph API benötigt das Instagram-Konto in der Regel
ein Professional-Konto (Business oder Creator), das mit einer Facebook-Seite
verbunden ist. Im Meta for Developers Dashboard eine App anlegen, Instagram
Graph API hinzufügen und einen User/Page-Token mit den für Content Publishing
benötigten Berechtigungen ausstellen. Der Bridge-Service muss Instagram-
Container anlegen, Medien gegebenenfalls unter einer öffentlich erreichbaren
URL bereitstellen, den Container veröffentlichen und die von Instagram
gelieferten IDs in `id`/`url` übersetzen.

Weiterführend: [Instagram Graph API – Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing/),
[Meta App Dashboard](https://developers.facebook.com/apps/).

#### Mastodon (native Integration)

Variablen:

```dotenv
MASTODON_SERVER_URL=https://mastodon.example
MASTODON_ACCESS_TOKEN=...
MASTODON_CLIENT_NAME=Influence
MASTODON_CLIENT_ID=
MASTODON_CLIENT_SECRET=
MASTODON_VISIBILITY=public
MASTODON_LANGUAGE=de
```

Mastodon ist instanzbezogen. `MASTODON_SERVER_URL` ist die Basis-URL der
Instanz, nicht die URL eines einzelnen API-Endpunkts. Der Token benötigt
mindestens `write:statuses` und `write:media`. Der native Adapter lädt jedes
Bild oder unterstützte Medium über `POST /api/v2/media` hoch, übergibt den
Alternativtext und erstellt danach den Status über `POST /api/v1/statuses`.

Für die Einrichtung kann entweder im gewünschten Mastodon-Server unter
`https://<instanz>/settings/applications` eine Anwendung registriert und ein
Token erzeugt werden, oder der integrierte OAuth-Flow verwendet werden. Für
den OAuth-Flow müssen `PUBLIC_BASE_URL`, `MASTODON_SERVER_URL` und optional
`MASTODON_CLIENT_NAME` gesetzt sein. Danach im Browser
`https://<deine-domain>/admin/mastodon/oauth/start` öffnen. Influence
registriert die Anwendung bei Mastodon, führt den PKCE-Flow durch und zeigt nach
dem Rückruf den Token einmalig an. Diesen in `MASTODON_ACCESS_TOKEN` eintragen
und den Prozess neu starten.

Der OAuth-Rückruf lautet:
`https://<deine-domain>/publish/mastodon/oauth/callback`.
Der gesamte Namespace `/publish/` sollte im Reverse Proxy für externe
Rückrufe erreichbar sein. Der OAuth-Start unter
`/admin/mastodon/oauth/start` bleibt durch HTTP Basic Auth geschützt oder wird
nur intern erreichbar gemacht. Der Status wird mit der Job-ID als Idempotency-Key
gesendet, damit ein Wiederholen desselben Jobs keine Duplikate erzeugt.

Weiterführend: [Mastodon: Anwendung und Token anlegen](https://docs.joinmastodon.org/client/token/),
[Mastodon OAuth und Scopes](https://docs.joinmastodon.org/client/authorized/),
[Mastodon API-Methoden](https://docs.joinmastodon.org/methods/).

#### Threads

Variablen:

```dotenv
THREADS_API_URL=https://bridge.example.org/threads/publish
THREADS_ACCESS_TOKEN=...
```

Für Threads im Meta for Developers Dashboard eine App mit Threads API
konfigurieren und einen Token für das Threads-Profil mit den benötigten
Publishing-Berechtigungen erzeugen. Die Bridge muss das Threads-Verfahren zum
Erstellen und Veröffentlichen eines Containers sowie den Medien-Upload
implementieren und die Threads-Post-ID zurückgeben.

Weiterführend: [Threads API – Getting Started](https://developers.facebook.com/docs/threads/get-started/),
[Threads API – Posts](https://developers.facebook.com/docs/threads/posts/),
[Meta App Dashboard](https://developers.facebook.com/apps/).

#### Bluesky

Variablen:

```dotenv
BLUESKY_API_URL=https://bridge.example.org/bluesky/publish
BLUESKY_ACCESS_TOKEN=...
```

Für einen einzelnen Account kann die Bridge mit einem Bluesky App Password
arbeiten. Das wird im Bluesky-Konto unter **Settings → Advanced → App
Passwords** erstellt; das normale Kontopasswort sollte nicht in einem
Integrationsdienst hinterlegt werden. Alternativ kann die Bridge den offiziellen
OAuth-/Session-Flow verwenden. Sie muss den Beitrag als AT-Protocol-Record
anlegen, Bilder als Blobs hochladen und die resultierende Record-URI oder CID
als `id` zurückgeben.

Weiterführend: [Bluesky: Get Started](https://docs.bsky.app/docs/get-started),
[Bluesky: Posting via the API](https://docs.bsky.app/blog/create-post),
[Bluesky App Passwords](https://bsky.app/settings/app-passwords).

#### LinkedIn

Variablen:

```dotenv
LINKEDIN_API_URL=https://bridge.example.org/linkedin/publish
LINKEDIN_ACCESS_TOKEN=...
```

Im LinkedIn Developer Portal eine App anlegen, das Produkt **Share on
LinkedIn** (oder die für das Organisations-Posting erforderliche
Berechtigung) aktivieren und OAuth für das gewünschte persönliche oder
Organisationkonto durchführen. Für Organisationsseiten muss die LinkedIn-App
zusätzlich als berechtigter Organisationsbenutzer zugelassen sein. Die Bridge
übernimmt den Upload über die Images-/Videos-API und erstellt anschließend den
Post über die Posts API; die LinkedIn-Post-ID wird als `id` zurückgegeben.

Weiterführend: [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps),
[LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api),
[LinkedIn Media Uploads](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api).

#### Beispiel für mehrere Adapter

```dotenv
PUBLICATION_PLATFORMS=facebook,instagram,mastodon,threads,bluesky,linkedin
INSTAGRAM_API_URL=https://bridge.example.org/instagram/publish
INSTAGRAM_ACCESS_TOKEN=...
MASTODON_SERVER_URL=https://mastodon.example
MASTODON_ACCESS_TOKEN=...
THREADS_API_URL=https://bridge.example.org/threads/publish
THREADS_ACCESS_TOKEN=...
BLUESKY_API_URL=https://bridge.example.org/bluesky/publish
BLUESKY_ACCESS_TOKEN=...
LINKEDIN_API_URL=https://bridge.example.org/linkedin/publish
LINKEDIN_ACCESS_TOKEN=...
```

Nach einer Änderung an `config/.env` den laufenden Prozess neu starten. Für
einen kontrollierten Test zunächst einen einzelnen Beitrag mit `publish`
ausführen und anschließend den gespeicherten Veröffentlichungsstatus sowie
die Antwort des Bridge-Service prüfen.

### Beispiel

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
FLUX_API_KEY=...
FLUX_API_BASE_URL=https://api.bfl.ai
FLUX_API_GENERATE_PATH=/v1
FLUX_MODEL=flux-2-pro-preview
CONTENT_CALENDAR_PATH=./content/content-plan.json
OUTPUT_DIR=./content
FFMPEG_BIN=ffmpeg
TZ=Europe/Brussels
REEL_SUBTITLE_FONT_NAME=Atkinson Hyperlegible Next
REEL_SUBTITLE_FONTS_DIR=
```

## Laufende Verzeichnisse und Daten

### Eingabedaten

- `content/content-plan.json`
  Redaktionskalender als Primärquelle.

### Ausgabedaten

Unter `content/` legt Influence pro Beitrag eine eigene Struktur an:

- `content.json`
- `raw-openai-response.json`
- `image-generation-results.json`
- `reel-image-generation-results.json`
- `qa-results.json`
- `render-results.json`
- `reel-render-results.json`
- gerenderte PNGs, HTML-Dateien und Assets
- `review-export.json`

Zusätzlich:

- `content/chat-sessions/`
  persistente JSON-Diskussionen und Revisionen

## Betriebsmodi

### CLI

Die CLI eignet sich für:

- Validierung des Kalenders
- Scaffolding und Generierung
- QA
- Bild- und Reel-Bild-Erzeugung
- Rendering
- Chat-basierte JSON-Revision

### Review-Oberfläche

Die lokale Review-Oberfläche dient für:

- Wochenübersicht
- Bearbeitung einzelner Beiträge
- QA-Sicht
- manuelle Asset-Uploads
- Voiceover-Aufnahme
- Vorschau und Export

Start:

```bash
npm run dev -- review serve --host 127.0.0.1 --port 3040
```

Standardadresse:

`http://127.0.0.1:3040/`

## Empfohlener Betriebsablauf

1. Kalender prüfen.
2. Inhalte per CLI oder UI generieren.
3. QA ausführen.
4. Bilder generieren.
5. Social-Grafiken rendern.
6. optional Reel-Bilder generieren.
7. optional Reel rendern.
8. in der UI redaktionell prüfen, korrigieren, Voiceover aufnehmen, exportieren.

## Build, Tests und Qualitätssicherung

### TypeScript-Prüfung

```bash
npm run typecheck
```

### Tests

```bash
npm test
```

### Frontend-Build der Review-Oberfläche

```bash
npm run review:frontend:build
```

## Update-Prozess

1. Änderungen einspielen.
2. Abhängigkeiten aktualisieren:

```bash
npm install
```

3. Typecheck und Tests ausführen:

```bash
npm run typecheck
npm test
```

4. Falls das Review-Frontend ausgeliefert oder versioniert wird:

```bash
npm run review:frontend:build
```

## Fehlerdiagnose

### OpenAI-Aufrufe schlagen fehl

Prüfen:

- `OPENAI_API_KEY`
- Netzwerkzugriff
- Modellname in `OPENAI_MODEL`

### Flux-Aufrufe schlagen fehl

Prüfen:

- `FLUX_API_KEY`
- `FLUX_API_BASE_URL`
- `FLUX_API_GENERATE_PATH`
- `FLUX_MODEL`

### Rendern schlägt fehl

Prüfen:

- ob Chromium via Playwright installiert ist
- ob das System lokale Browserprozesse starten darf

### Reel-Rendering schlägt fehl

Prüfen:

- ob `ffmpeg` installiert ist
- ob `FFMPEG_BIN` korrekt gesetzt ist
- ob Bild-Assets und optional Audio-Dateien vorhanden sind

### UI zeigt keine aktuellen Dateien

Die Post-Ansicht erzeugt cache-gebrochene Datei-URLs. Wenn trotzdem alte Artefakte erscheinen:

- Seite neu laden
- prüfen, ob die Aktion wirklich erfolgreich abgeschlossen wurde
- prüfen, ob die entsprechenden Dateien unter `content/` überschrieben wurden

## Sicherheit und Betriebshinweise

- API-Schlüssel nicht ins Repository einchecken.
- `content/` enthält redaktionelle Arbeitsstände und sollte regelmäßig gesichert werden.
- `content/` ist als separates Git-Repository eingerichtet. Nach jeder CLI-Aktion und jeder schreibenden Review-Aktion werden Änderungen automatisch committed und gepusht. Vor dem Betrieb müssen dort ein Remote und ein Upstream-Branch konfiguriert sein, zum Beispiel mit `git -C content remote add origin <url>` und `git -C content push --set-upstream origin main`.
- Die Review-Oberfläche ist für lokalen oder geschützten internen Betrieb gedacht.
- Bei Betrieb außerhalb von `127.0.0.1` sollte die Erreichbarkeit zusätzlich über Netzwerk- oder Reverse-Proxy-Regeln eingeschränkt werden.

## Verwandte Dokumente

- [Benutzer.md](Benutzer.md)
- [CLI.md](CLI.md)
- [CODEX_PLAN.md](CODEX_PLAN.md)
