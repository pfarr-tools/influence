![Influence](assets/logo-wordmark.svg)

# Influence für Administratoren

## Überblick

Dieses Dokument beschreibt Installation, Konfiguration, Betrieb und Wartung von Influence aus technischer Sicht. Es richtet sich an Personen, die die lokale Umgebung bereitstellen, API-Zugänge verwalten und den laufenden Betrieb unterstützen.

## Systemvoraussetzungen

- Linux, macOS oder Windows mit funktionierender Node.js-Umgebung
- Node.js `24.x`
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
vollständig konfiguriert sind. Für Bluesky ist das ein API-Endpunkt und ein
Token; LinkedIn verwendet den nativen REST-Adapter mit `LINKEDIN_AUTHOR_URN`
und `LINKEDIN_ACCESS_TOKEN`; Instagram und Threads verwenden native Meta-Adapter.
Mastodon verwendet den nativen Adapter mit `MASTODON_SERVER_URL` und `MASTODON_ACCESS_TOKEN`. Nicht
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

#### Facebook Page (native integration)

The native adapter publishes the first generated `facebook-mastodon` landscape
render as a photo post on a Facebook Page. The image must be reachable below
`PUBLIC_BASE_URL/files/...` from Meta's servers. Add these values to
`config/.env`:

```dotenv
PUBLIC_BASE_URL=https://influence.example
PUBLICATION_PLATFORMS=facebook,instagram,mastodon
PUBLICATION_DEFAULT_TIME=07:00
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_ACCESS_TOKEN=EAAB...
# Optional:
# FACEBOOK_GRAPH_API_URL=https://graph.facebook.com
# FACEBOOK_GRAPH_API_VERSION=v23.0
```

In the Meta for Developers dashboard, open the Facebook Page publishing use
case (the `Anwendungsfall` you already added). In its permissions/requirements,
add `pages_show_list`, `pages_read_engagement` and `pages_manage_posts`.
Complete App Review for the permissions if Meta marks them as requiring review;
while the app is in Development mode, the people testing it must have a role in
the app and have a role on the Page.

Then create a User Access Token in Graph API Explorer for the same app and
user, with those permissions. Query:

```text
GET /me/accounts?fields=id,name,access_token,tasks
```

Copy the Page's `id` to `FACEBOOK_PAGE_ID` and the User Access Token to
`FACEBOOK_ACCESS_TOKEN`. Influence calls `/me/accounts` automatically, selects
the configured Page, and uses the returned Page Access Token for publishing.
The User Access Token must have the permissions above; the selected Page must
include the `CREATE_CONTENT` task.
Restart Influence after changing `.env`, render the post, approve it, and
schedule it as usual:

```bash
influence render post --post-id post-0007
influence publish schedule --post-id post-0007 --platform facebook --at 2026-08-16T12:00:00+02:00
influence publish run
```

The Graph API endpoint used is `POST /{page-id}/photos` with the public image
URL, the Facebook text as `caption`, and `published=true`. The old
`influence publish facebook --post-id ...` command remains available for a
manual hand-off when the native adapter is not configured.

Further reading: [Facebook Pages API](https://developers.facebook.com/docs/pages-api),
[Page photos](https://developers.facebook.com/docs/graph-api/reference/page/photos),
[Meta App Dashboard](https://developers.facebook.com/apps/).

#### Threads (native Integration)

Threads verwendet die native Threads API. Benötigt werden `threads_basic` und
`threads_content_publish` sowie eine öffentlich erreichbare Basis-URL für die
gerenderten Bilder:

```dotenv
PUBLIC_BASE_URL=https://influence.example
THREADS_APP_ID=...
THREADS_APP_SECRET=...
THREADS_ACCESS_TOKEN=...
THREADS_USER_ID=...
THREADS_GRAPH_API_URL=https://graph.threads.net
THREADS_GRAPH_API_VERSION=v1.0
```

Die OAuth-Einrichtung startet unter
`/admin/threads/oauth/start`; der in Meta eingetragene Rückruf muss
`/publish/threads/oauth/callback` unter `PUBLIC_BASE_URL` sein. Der Rückruf
zeigt den langlebigen Access-Token und die User-ID einmalig an. Threads-Posts
verwenden die gerenderten Instagram-Feed-Bilder: ein Bild wird als Bildpost,
zwei bis zwanzig Bilder als Carousel veröffentlicht. Der App Secret bleibt
serverseitig und wird nicht in Publikationsjobs gespeichert.

#### Mastodon (native Integration)

Variablen:

```dotenv
MASTODON_SERVER_URL=https://mastodon.example
MASTODON_ACCESS_TOKEN=...
MASTODON_CLIENT_NAME=christoph-fischer.de
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
BLUESKY_SERVICE_URL=https://bsky.social
BLUESKY_IDENTIFIER=dein-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

Der native Adapter verwendet ein Bluesky App Password. Das wird im
Bluesky-Konto unter **Settings → Advanced → App Passwords** erstellt; das
normale Kontopasswort sollte nicht in einem Integrationsdienst hinterlegt
werden. Der Adapter erstellt eine AT-Protocol-Session, lädt Bilder als Blobs
hoch und legt anschließend den `app.bsky.feed.post`-Record an. Für bereits
vorhandene Sessions können alternativ `BLUESKY_ACCESS_TOKEN` und
`BLUESKY_REPO` gesetzt werden.

Weiterführend: [Bluesky: Get Started](https://docs.bsky.app/docs/get-started),
[Bluesky: Posting via the API](https://docs.bsky.app/blog/create-post),
[Bluesky App Passwords](https://bsky.app/settings/app-passwords).

#### LinkedIn

Variablen:

```dotenv
LINKEDIN_AUTHOR_URN=urn:li:organization:123456789
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_API_VERSION=202606
```

`LINKEDIN_AUTHOR_URN` ist entweder `urn:li:person:<member-id>` für ein
persönliches Profil oder `urn:li:organization:<organization-id>` für eine
Unternehmensseite. Der native Adapter lädt die gerenderten PNG/JPEG-Bilder
über die Images API hoch und veröffentlicht anschließend einen Text-, Bild-
oder Multi-Image-Post über die Posts API. Zwei bis zwanzig Bilder werden als
native Multi-Image-Post veröffentlicht.

Im LinkedIn Developer Portal eine App anlegen, OAuth 2.0 aktivieren und das
Produkt **Share on LinkedIn** hinzufügen. Für ein persönliches Profil wird
`w_member_social` benötigt. Für eine Unternehmensseite wird
`w_organization_social` benötigt; das LinkedIn-Mitglied, dessen Token du
verwendest, muss auf der Seite die Rolle Administrator, Content Admin oder
Direct Sponsored Content Poster besitzen. Den OAuth-Access-Token und die
passende Author-URN anschließend in `config/.env` eintragen. Die monatliche
API-Version (`YYYYMM`) kann mit `LINKEDIN_API_VERSION` überschrieben werden.

Weiterführend: [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps),
[LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api),
[LinkedIn Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api),
[LinkedIn MultiImage API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api).

#### Beispiel für mehrere Adapter

```dotenv
PUBLICATION_PLATFORMS=facebook,instagram,mastodon,threads,bluesky,linkedin
INSTAGRAM_API_URL=https://bridge.example.org/instagram/publish
INSTAGRAM_ACCESS_TOKEN=...
MASTODON_SERVER_URL=https://mastodon.example
MASTODON_ACCESS_TOKEN=...
THREADS_API_URL=https://bridge.example.org/threads/publish
THREADS_ACCESS_TOKEN=...
BLUESKY_SERVICE_URL=https://bsky.social
BLUESKY_IDENTIFIER=dein-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
LINKEDIN_AUTHOR_URN=urn:li:organization:123456789
LINKEDIN_ACCESS_TOKEN=...
```

Nach einer Änderung an `config/.env` den laufenden Prozess neu starten. Für
einen kontrollierten Test zunächst einen einzelnen Beitrag mit `publish`
ausführen und anschließend den gespeicherten Veröffentlichungsstatus prüfen.

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
influence review serve --host 127.0.0.1 --port 3040
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
