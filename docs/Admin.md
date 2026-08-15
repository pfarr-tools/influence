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

Beginne mit `BRAND_NAME`, `BRAND_WEBSITE`, `SOURCE_MARK` und `IMAGE_CREDITS`.
Diese Variablen ersetzen organisations- oder personenbezogene Angaben in
Renderings und OAuth-Registrierungen. Verwende keine persönlichen Defaults aus
einer Beispielkonfiguration.

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

### Veröffentlichung und Plattform-Adapter

- `WEBHOOK_URL`
  Optionaler Endpunkt. Nach `influence publish run` wird er per POST benachrichtigt,
  sobald mindestens ein Beitrag erfolgreich veröffentlicht wurde.

- `WEBHOOK_SECRET`
  Secret für die Benachrichtigung. Es wird als `Authorization: Bearer ...` gesendet.

`PUBLICATION_PLATFORMS` bestimmt, für welche Plattformen Influence Jobs anlegt.
Eine Plattform wird automatisch veröffentlicht, wenn ihre nativen Zugangsdaten
vollständig konfiguriert sind. LinkedIn verwendet den nativen REST-Adapter mit
`LINKEDIN_AUTHOR_URN` und `LINKEDIN_ACCESS_TOKEN`; Instagram und Threads
verwenden native Meta-Adapter. Mastodon verwendet den nativen Adapter mit
`MASTODON_SERVER_URL` und `MASTODON_ACCESS_TOKEN`. Nicht
konfigurierte Plattformen bleiben in der Oberfläche und in der Queue sichtbar,
können aber nicht automatisch veröffentlicht werden.

Facebook ist derzeit eine manuelle Veröffentlichung: Influence erstellt einen
Facebook-Share-Link, es gibt dafür keinen automatischen Adapter und daher auch
keine `FACEBOOK_*`-Variablen.

#### Instagram

Für die native Instagram Graph API benötigt das Instagram-Konto in der Regel
ein Professional-Konto (Business oder Creator), das mit einer Facebook-Seite
verbunden ist. Im Meta-Entwicklerdashboard eine App anlegen, Instagram
Graph API hinzufügen und einen User/Page-Token mit den für Content Publishing
benötigten Berechtigungen ausstellen. Der native Instagram-Adapter legt
Container an, verwendet öffentlich erreichbare Medien-URLs, veröffentlicht den
Container und speichert die von Instagram gelieferten IDs.

Weiterführend: [Instagram Graph API – Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing/),
[Meta App Dashboard](https://developers.facebook.com/apps/).

#### Facebook-Seite (native Integration)

Der native Adapter veröffentlicht das erste erzeugte Querformat-
Rendering `facebook-mastodon` als Fotobeitrag auf einer Facebook-Seite. Das
Bild muss für die Meta-Server unter `PUBLIC_BASE_URL/files/...` erreichbar
sein. Diese Werte gehören in `config/.env`:

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

Öffne im Meta-Entwicklerdashboard den Anwendungsfall für die
Facebook-Seitenveröffentlichung. Ergänze bei den Berechtigungen bzw.
Anforderungen `pages_show_list`, `pages_read_engagement` und
`pages_manage_posts`. Wenn Meta dafür eine App-Prüfung verlangt, muss diese
abgeschlossen werden. Im Entwicklungsmodus müssen die testenden Personen eine
Rolle in der App und auf der Seite haben.

Erzeuge anschließend im Graph API Explorer für dieselbe App und dasselbe
Benutzerkonto einen User Access Token mit diesen Berechtigungen. Verwende:

```text
GET /me/accounts?fields=id,name,access_token,tasks
```

Übertrage die `id` der Seite nach `FACEBOOK_PAGE_ID` und den User Access Token
nach `FACEBOOK_ACCESS_TOKEN`. Influence ruft `/me/accounts` automatisch auf,
wählt die konfigurierte Seite aus und verwendet den zurückgegebenen Page
Access Token für die Veröffentlichung. Der User Access Token muss die oben
genannten Berechtigungen besitzen; die ausgewählte Seite muss die Aufgabe
`CREATE_CONTENT` enthalten.
Starte Influence nach Änderungen an `.env` neu, rendere den Beitrag, gib ihn
frei und plane ihn wie gewohnt:

```bash
influence render post --post-id post-0007
influence publish schedule --post-id post-0007 --platform facebook --at 2026-08-16T12:00:00+02:00
influence publish run
```

Der verwendete Graph-API-Endpunkt ist `POST /{page-id}/photos` mit der
öffentlichen Bild-URL, dem Facebook-Text als `caption` und
`published=true`. Der alte Befehl `influence publish facebook --post-id ...`
bleibt für die manuelle Übergabe verfügbar, wenn der native Adapter nicht
konfiguriert ist.

Weiterführend: [Facebook Pages API](https://developers.facebook.com/docs/pages-api),
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

Für Threads im Meta-Entwicklerdashboard eine App mit Threads API
konfigurieren und einen Token für das Threads-Profil mit den benötigten
Publishing-Berechtigungen erzeugen. Influence verwendet dafür den nativen
Threads-Adapter.

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

Der native Adapter verwendet ein Bluesky-App-Passwort. Das wird im
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

#### Beispiel für mehrere Plattformen

```dotenv
PUBLICATION_PLATFORMS=facebook,instagram,mastodon,threads,bluesky,linkedin
INSTAGRAM_ACCOUNT_ID=17841400000000000
INSTAGRAM_ACCESS_TOKEN=...
MASTODON_SERVER_URL=https://mastodon.example
MASTODON_ACCESS_TOKEN=...
THREADS_APP_ID=...
THREADS_ACCESS_TOKEN=...
THREADS_USER_ID=...
BLUESKY_SERVICE_URL=https://bsky.social
BLUESKY_IDENTIFIER=dein-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
LINKEDIN_AUTHOR_URN=urn:li:organization:123456789
LINKEDIN_ACCESS_TOKEN=...
```

Nach einer Änderung an `config/.env` den laufenden Prozess neu starten. Für
einen kontrollierten Test zunächst einen einzelnen Beitrag mit `publish`
ausführen und anschließend den gespeicherten Veröffentlichungsstatus prüfen.

## Releases

Release-Commits verwenden Conventional-Commit-Präfixe wie `feat:`, `fix:`,
`docs:` oder `chore:`. `standard-version` steuert die lokale Versionierung:

```bash
npm run release:first  # einmalig für die erste Version
npm run release        # danach patch/minor/major aus Committypen ableiten
```

Dabei werden `package.json`, `package-lock.json`, `CHANGELOG.md` und ein Git-
Tag aktualisiert. Der Befehl pusht nichts und veröffentlicht nicht automatisch.
Das Prüfen und Pushen von Commit und Tag bleibt ein bewusster manueller Schritt.

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
