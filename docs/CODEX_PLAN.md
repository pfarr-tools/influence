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
10. Jede implementierte Phase muss in der lokalen UI sichtbar sein; verfügbare Schritte, Status und Ergebnisse dürfen nicht nur über die CLI zugänglich sein.
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
- Die Oberfläche und die End-User-Dokumentation müssen korrektes Deutsch mit Umlauten und ß verwenden.
- Die Oberfläche muss die bis dahin implementierten Phasen als sichtbare Workflow-Schritte mit Status und Aktionen abbilden.

Keine Authentifizierung nötig, solange die Anwendung nur lokal gebunden wird.

Verwende Bootstrap für die UI.

# Phase 9 – Video/Reels optional

Nutze FFmpeg für einfache Reels:

- Flux-Hintergrund
- langsamer Zoom
- Sprechtext als Untertitel
- optional Audiospur
- 1080×1920

Kein generatives Video in der ersten Version.

# Phase 10 – Publishing, Scheduling und manueller Facebook-Assistent

## Ziel

Pfarr.Media veröffentlicht freigegebene Inhalte plattformabhängig über den jeweils geeigneten und offiziell unterstützten Weg.

Dabei gilt:

- Instagram wird über die offizielle Publishing API veröffentlicht.
- Mastodon wird über die jeweilige Instanz-API veröffentlicht.
- Threads, Bluesky und LinkedIn werden über eigene Adapter angebunden, sofern Zugangsdaten und erforderliche Berechtigungen vorhanden sind.
- Auf Facebook wird nicht auf eine Seite, sondern auf das persönliche Profil veröffentlicht. Dafür gibt es keine offizielle Publishing API. Facebook bleibt deshalb ein bewusst manueller, aber stark vereinfachter Schritt.
- Keine Plattform darf ohne explizite menschliche Freigabe beliefert werden.
- Browser-Automatisierung zur Umgehung fehlender Publishing APIs ist ausgeschlossen.

## Architektur

```text
freigegebener Content
        │
        ▼
Publication Queue
        │
        ├── Instagram Adapter
        ├── Mastodon Adapter
        ├── Threads Adapter
        ├── Bluesky Adapter
        ├── LinkedIn Adapter
        └── Facebook Publishing Assistant
```

## Publication Jobs

Implementiere ein persistentes Jobmodell, mindestens mit:

```ts
type PublicationStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "processing"
  | "published"
  | "failed"
  | "cancelled";

interface PublicationJob {
  id: string;
  postId: string;
  platform: string;
  format: string;
  scheduledAt: string | null;
  timezone: string;
  status: PublicationStatus;
  attemptCount: number;
  remoteId: string | null;
  remoteUrl: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Speichere zusätzlich:

- verwendete Textfassung
- verwendete Assets
- Alt-Texte
- API-Antwort-Metadaten
- Veröffentlichungszeit
- Retry-Historie

Secrets, Access Tokens und Refresh Tokens dürfen nicht im Jobdatensatz gespeichert oder geloggt werden.

## Scheduler

Der interne Scheduler verwaltet automatische Veröffentlichungen für Instagram, Mastodon und weitere angebundene Plattformen.

Anforderungen:

- Zeitzone `Europe/Brussels` berücksichtigen.
- Nur Jobs mit Status `approved` oder `scheduled` ausführen.
- Idempotenz sicherstellen.
- Plattform-IDs früh speichern, damit ein Timeout nicht zu Doppelposts führt.
- Retry mit exponentiellem Backoff.
- Fehlgeschlagene Jobs nach konfigurierbarer Anzahl von Versuchen auf `failed` setzen.
- Videos und Reels als asynchron verarbeitete Medien behandeln.
- Keine Jahresplanung vollständig an externe Plattformen übertragen; Pfarr.Media bleibt die Quelle der Planung.

## Instagram Adapter

Unterstützte Formate:

- Einzelbild im Feed
- Carousel
- Reel
- Story als vollständig gerendertes Bild oder Video

Workflow:

1. Asset unter einer für Meta erreichbaren HTTPS-URL bereitstellen.
2. Mediencontainer erzeugen.
3. Verarbeitungsstatus prüfen.
4. Zum geplanten Zeitpunkt veröffentlichen.
5. Remote-ID und Remote-URL speichern.

Einschränkungen:

- Interaktive Story-Elemente wie Umfragen, Fragen-Sticker, Musik-Sticker oder Countdown sind nicht Bestandteil dieses Workflows.
- Storys werden als fertige 9:16-Datei veröffentlicht.
- Caption, Alt-Text und Medienformat müssen vor Veröffentlichung validiert werden.

## Mastodon Adapter

Workflow:

1. Medien hochladen.
2. Medienverarbeitung abwarten, falls erforderlich.
3. Status mit Text, Content Warning, Sprache, Sichtbarkeit und Medien veröffentlichen.
4. Remote-ID und URL speichern.

Die Instanz-URL muss konfigurierbar sein.

## Threads Adapter

Implementiere den Adapter getrennt von Instagram, auch wenn beide zu Meta gehören.

Anforderungen:

- Plattformfähigkeiten zur Laufzeit prüfen.
- Nur offiziell unterstützte Contenttypen verwenden.
- Zugangsdaten und Berechtigungen getrennt konfigurieren.
- Bei fehlender Berechtigung klar auf manuellen Export zurückfallen.

## Bluesky Adapter

Unterstütze:

- Textposts
- Linkkarten
- Einzelbilder und mehrere Bilder mit jeweils eigenem Alt-Text

Verwende die offizielle AT-Protocol-/Bluesky-Schnittstelle. Zugangsdaten müssen sicher gespeichert werden. Alternativ soll ein manueller Compose-Link erzeugt werden können.

## LinkedIn Adapter

Unterstütze zunächst:

- Textpost
- Bildpost
- Artikel-/Linkpost

Da LinkedIn-Berechtigungen eingeschränkt sein können, muss der Adapter zwischen drei Zuständen unterscheiden:

```text
available → API-Veröffentlichung möglich
manual-only → Inhalt und Asset exportieren
unavailable → Plattform deaktiviert
```

Keine Berechtigung darf vorausgesetzt werden.

## Facebook-Profil: Publishing Assistant

### Grundsatz

Auf Facebook wird auf das persönliche Profil veröffentlicht. Dafür gibt es keine offizielle Publishing API. Pfarr.Media veröffentlicht dort nicht automatisch.

Pfarr.Media erzeugt für jeden Facebook-Beitrag:

- den fertigen Facebook-Text
- ein passendes Bild oder mehrere Bilder
- eine öffentliche Ziel-URL, sofern vorhanden
- eine Facebook-Sharer-URL
- Buttons zum Öffnen und Kopieren
- einen manuellen Veröffentlichungsstatus

### Facebook-Modi

```ts
type FacebookMode = "share_link" | "manual_photo" | "skip";
```

#### `share_link`

Für:

- Predigten
- Artikel
- längere Impulse
- Inhalte mit einer bestehenden öffentlichen Webseite

#### `manual_photo`

Für:

- Wochenspruch-Grafiken
- Gebete
- Liedgedanken
- Bildimpulse
- mehrere Bilder, die als nativer Facebook-Fotopost erscheinen sollen

#### `skip`

Keine Facebook-Veröffentlichung.

### Button „Auf Facebook teilen“

Der Button muss in genau dieser Reihenfolge arbeiten:

1. vorbereiteten Facebook-Text in die Zwischenablage kopieren
2. Erfolg oder Fehler des Kopierens sichtbar melden
3. Facebook-Sharer-URL in einem neuen Fenster oder Tab öffnen

Beispiel:

```ts
async function shareOnFacebook(text: string, publicUrl: string): Promise<void> {
  await navigator.clipboard.writeText(text);

  const shareUrl =
    "https://www.facebook.com/sharer/sharer.php?u=" +
    encodeURIComponent(publicUrl);

  window.open(
    shareUrl,
    "facebook-share",
    "width=700,height=700,noopener,noreferrer",
  );
}
```

Falls die Clipboard API nicht verfügbar ist:

- Text in einem gut auswählbaren Feld anzeigen
- Fallback-Button mit `document.execCommand("copy")` nur verwenden, wenn technisch nötig
- Sharer trotzdem erst nach sichtbarer Rückmeldung öffnen

Der Share-Dialog darf nicht automatisiert bedient werden. Der Benutzer fügt den kopierten Text dort selbst ein und bestätigt die Veröffentlichung.

### Share-URL

```text
https://www.facebook.com/sharer/sharer.php?u=<ENCODED_PUBLIC_URL>
```

Für reine Foto-Posts zeigt die Oberfläche:

```text
[Text kopieren] [Bild öffnen/herunterladen] [Facebook öffnen] [Als veröffentlicht markieren]
```

### Öffentliche Share-Seiten

Für Beiträge ohne bestehende Webseite kann Pfarr.Media optional kleine öffentliche HTML-Seiten erzeugen, zum Beispiel:

```text
https://media.pfarr.tools/posts/post-0007/
```

Diese Seiten enthalten mindestens:

- `og:type`
- `og:title`
- `og:description`
- `og:image`
- `og:url`
- kanonische URL

## Review-Oberfläche

Für jede Plattform anzeigen:

- Zielkonto
- Format
- geplanter Zeitpunkt
- Textvorschau
- Medienvorschau
- Alt-Text
- Freigabestatus
- Veröffentlichungsstatus
- Plattform-ID bzw. Link nach Veröffentlichung

Beispiel:

```text
Instagram
✓ freigegeben
✓ geplant für 08:00 Uhr

Mastodon
✓ freigegeben
✓ geplant für 08:05 Uhr

Facebook-Profil
○ noch manuell zu veröffentlichen
[Auf Facebook teilen] [Bild öffnen] [Als veröffentlicht markieren]
```

## CLI

```bash
npm run dev -- publish preview --post-id post-0007
npm run dev -- publish schedule --post-id post-0007 --platform instagram --at 2026-08-16T08:00:00+02:00
npm run dev -- publish run
npm run dev -- publish retry --job-id <id>
npm run dev -- publish facebook --post-id post-0007
npm run dev -- publish mark-published --post-id post-0007 --platform facebook
```

## Akzeptanzkriterien

- Kein Job wird ohne Status `approved` ausgeführt.
- Facebook-Profil-Posts werden niemals automatisch veröffentlicht.
- Der Facebook-Button kopiert zuerst den Text und öffnet danach die Sharer-URL.
- Instagram-Einzelbild, Carousel, Reel und Story besitzen getrennte, getestete Codepfade.
- Alle Adapter sind über Interfaces mockbar.
- Tests führen keine echten Veröffentlichungen aus.
- Ein Dry-Run zeigt Payload, Zielplattform und Assets ohne externen API-Aufruf.
- Doppelte Veröffentlichungen werden durch Idempotenz verhindert.
- Secrets erscheinen weder in Logs noch in gespeicherten API-Metadaten.

## Nicht-Ziele

- automatisches Posten auf persönlichen Facebook-Profilen
- Browser-Automatisierung für Facebook
- automatisches Einfügen des Textes in den Facebook-Dialog
- Umgehung von Plattformrichtlinien oder Berechtigungsprüfungen
- interaktive Instagram-Story-Sticker

# Phase 11 – Tageslosungen importieren und als Story veröffentlichen

## Ziel

Jeden Morgen wird eine Instagram-Story mit Losung und Lehrtext des Tages vorbereitet und nach Freigabe beziehungsweise gemäß konfigurierter Freigaberegel veröffentlicht.

Die Quelldaten liegen als jährlich austauschbare XML-Datei vor, zum Beispiel:

```text
data/losungen/Losungen Free 2026.xml
```

## XML-Struktur

Jeder `<Losungen>`-Eintrag kann enthalten:

- `Datum`
- `Wtag`
- `Sonntag`
- `Losungstext`
- `Losungsvers`
- `Lehrtext`
- `Lehrtextvers`

`Sonntag` ist optional. Unbekannte zusätzliche XML-Felder dürfen den Import nicht abbrechen, sollen aber protokolliert werden.

## Datenmodell

```ts
interface DailyWatchword {
  date: string;
  weekday: string;
  occasion: string | null;
  watchwordText: string;
  watchwordReference: string;
  teachingText: string;
  teachingReference: string;
  sourceFile: string;
  sourceHash: string;
}
```

## Import

CLI:

```bash
npm run dev -- losungen import "data/losungen/Losungen Free 2026.xml"
npm run dev -- losungen validate --year 2026
npm run dev -- losungen show --date 2026-08-10
```

Anforderungen:

- XML sicher und ohne externe Entitäten parsen.
- Datum eindeutig normalisieren.
- Pro Kalenderdatum höchstens einen Datensatz akzeptieren.
- Doppelte oder fehlende Tage klar melden.
- Originaltext nicht stillschweigend normalisieren oder modernisieren.
- Schrägstrich-Markierungen wie `/Jesus spricht:/` als Quelldaten erhalten.
- Quelle und Hash speichern.
- Import muss wiederholbar und idempotent sein.

## Story-Generierung

Erzeuge täglich mindestens eine 1080×1920-Grafik.

Empfohlene Struktur:

```text
Tageslosung
Losungstext
Bibelstelle

Lehrtext
Bibelstelle

Datum / Absender
```

Optional kann die Story in zwei Slides aufgeteilt werden:

1. Losung
2. Lehrtext

Regeln:

- kein Flux-generierter Text
- Flux nur für einen textfreien Hintergrund oder eine dezente Illustration
- Text wird mit HTML/CSS und Playwright gerendert
- hohe Lesbarkeit und sichere Abstände
- Quelle und Rechtehinweis konfigurierbar
- keine Kürzung ohne sichtbare Kennzeichnung

CLI:

```bash
npm run dev -- losungen render-story --date 2026-08-10
npm run dev -- losungen schedule-story --date 2026-08-10 --at 07:00
```

## Veröffentlichung

- Zielplattform zunächst Instagram Story.
- Optional später Facebook-Seiten-Story, falls ein entsprechender Kanal verwendet wird.
- Das persönliche Facebook-Profil wird nicht automatisiert beliefert.
- Veröffentlichung läuft über Phase 10.

## Akzeptanzkriterien

- Die XML-Datei für 2026 wird vollständig importiert.
- Datum, Losung, Lehrtext und beide Bibelstellen werden unverändert übernommen.
- Für einen Beispieltag entsteht eine valide 9:16-Story.
- Fehlender Jahrestag verhindert die automatische Veröffentlichung und erzeugt eine sichtbare Warnung.
- Tests verwenden kleine synthetische XML-Dateien ohne reale Losungstexte.

# Phase 12 – Neueste Predigt erkennen und plattformübergreifend teilen

## Ziel

Nach einer neuen Predigt erkennt Pfarr.Media den neuesten Eintrag aus:

```text
https://christoph-fischer.de/podcast.xml
```

und erstellt daraus ein plattformübergreifendes Predigtpaket.

## Feed-Import

Implementiere einen RSS-/Podcast-Feed-Adapter.

CLI:

```bash
npm run dev -- sermon fetch-latest
npm run dev -- sermon inspect-latest
npm run dev -- sermon generate-latest
```

Der Adapter soll, soweit im Feed vorhanden, übernehmen:

- Titel
- Untertitel oder Beschreibung
- Veröffentlichungsdatum
- Predigt-URL
- Audio-URL
- GUID
- Bild/Artwork
- weitere namespaced Podcast-Felder

API- und Feed-Antworten müssen validiert werden. Fehlende optionale Felder dürfen nicht erfunden werden.

## Erkennung einer neuen Predigt

Eine Predigt gilt als neu, wenn ihre stabile Kennung noch nicht verarbeitet wurde.

Priorität für die Kennung:

1. GUID
2. kanonische Predigt-URL
3. Kombination aus Veröffentlichungsdatum und Titel

Speichere:

```ts
interface SermonImportState {
  stableId: string;
  firstSeenAt: string;
  generatedAt: string | null;
  approvedAt: string | null;
  publishedPlatforms: string[];
}
```

Ein erneuter Feed-Abruf darf keine Doppelveröffentlichung auslösen.

## Contentpaket

Erzeuge aus der neuesten Predigt:

- Facebook-Text mit Link zur Predigt
- Instagram-Bildpost
- Instagram-Story
- Mastodon-Post
- Threads-Post
- Bluesky-Post
- LinkedIn-Post
- optional Reel-Skript oder Audiogramm-Entwurf

Alle Plattformtexte müssen denselben theologischen Kern transportieren, aber plattformgerecht formuliert sein.

## Facebook

Verwende `share_link`.

Der Button:

1. kopiert zuerst den vorbereiteten Text
2. öffnet danach die Sharer-URL mit der Predigt-URL

## Instagram

Erzeuge mindestens:

- 1080×1350 Bildpost
- 1080×1920 Story

Mögliche Inhalte:

- Titel
- Untertitel
- Predigttext/Bibelstelle, falls sicher verfügbar
- kurzer Teaser
- Hinweis auf Link im Profil oder einen konfigurierten Linkweg

Keine Daten aus der Predigt erfinden. Falls für einen starken Teaser der Volltext benötigt wird, muss die Anwendung einen optionalen Predigtseiten-/Manuskript-Importer verwenden oder `needs_input: true` setzen.

## Mastodon, Threads, Bluesky und LinkedIn

Für jede Plattform getrennte Längen-, Link- und Medienregeln anwenden.

- Mastodon: Alt-Text, Sichtbarkeit und optional Content Warning unterstützen.
- Threads: offiziellen Adapter verwenden, sofern verfügbar.
- Bluesky: Linkkarte oder Bild mit Alt-Text unterstützen; alternativ Compose-Link.
- LinkedIn: bei fehlender API-Berechtigung manuellen Export bereitstellen.

## Optionaler Trigger

Ein Scheduler kann den Feed regelmäßig abrufen, zum Beispiel stündlich oder täglich. Er darf jedoch nur einen Entwurf erzeugen. Veröffentlichung erfordert weiterhin die in Phase 10 festgelegte Freigabe.

## Akzeptanzkriterien

- Der Feed-Adapter erkennt den neuesten Eintrag deterministisch.
- Derselbe Feed-Eintrag wird nicht doppelt verarbeitet.
- Alle Plattformvarianten verweisen auf dieselbe kanonische Predigt-URL.
- Facebook verwendet den Clipboard-plus-Sharer-Workflow.
- Instagram-Feedbild und Story werden gerendert.
- Fehlende Feedfelder werden nicht erfunden.
- Tests verwenden lokale RSS-Fixtures und keine Live-Abhängigkeit.

# Phase 13 – Morgen- und Abendgebete als tägliche Stories

## Ziel

Pfarr.Media kann morgens und abends jeweils ein kurzes Gebet als Story entwerfen. Das Gebet berücksichtigt:

- Losung und Lehrtext des Tages
- Wochenspruch und Kirchenjahresdaten
- Tageszeit
- optional ausgewählte aktuelle Nachrichten oder Ereignisse

## Grundsatz

Aktuelles Tagesgeschehen darf nicht vom Modell frei erfunden oder aus seinem Trainingswissen rekonstruiert werden. Es muss aus explizit konfigurierten, aktuellen Quellen stammen.

## Datenquellen

```text
Daily Watchword XML
        +
Kirchenjahr API
        +
optional News Source Adapter
        +
redaktionelle Konfiguration
```

Der News Source Adapter muss austauschbar sein und kann beispielsweise kuratierte RSS-Feeds oder einen konfigurierten Nachrichtenanbieter lesen.

Speichere für jedes verwendete Ereignis:

- Überschrift
- Quelle
- URL
- Veröffentlichungszeit
- Abrufzeit
- kurze maschinell erzeugte Zusammenfassung
- Kennzeichnung, ob es im Gebet tatsächlich verwendet wurde

## Sicherheits- und Qualitätsregeln

- Keine unbestätigten Eilmeldungen verwenden.
- Keine Namen von Opfern oder Betroffenen ohne redaktionellen Grund nennen.
- Keine parteipolitische Kommentierung als Gebet tarnen.
- Leid nicht instrumentalisieren.
- Bei widersprüchlicher oder unklarer Nachrichtenlage allgemein beten statt Details zu behaupten.
- Quellen nicht im Story-Gebet ausgeben, aber in den Metadaten speichern.
- Gebete bleiben Entwürfe, bis eine ausdrückliche Freigaberegel konfiguriert wurde.
- Bei fehlenden aktuellen Nachrichten ausschließlich Losung, Lehrtext und Wochenspruch verwenden.

## Gebetsarten

### Morgengebet

Ziel:

- den Tag eröffnen
- um Aufmerksamkeit, Mut, Frieden und Segen bitten
- Losung und Lehrtext aufnehmen, ohne sie nur zu paraphrasieren

Länge:

- 45–90 Wörter
- kurze, gut sprechbare Sätze
- 1 Story-Slide oder maximal 2 Slides

### Abendgebet

Ziel:

- den Tag vor Gott bringen
- danken, klagen und loslassen
- Menschen in Not und aktuelle Ereignisse einschließen

Länge:

- 60–110 Wörter
- maximal 2 Story-Slides

## Content-Schema

```ts
interface DailyPrayerPackage {
  date: string;
  prayerType: "morning" | "evening";
  sourceInputs: {
    watchwordId: string;
    churchYearDate: string;
    newsItems: string[];
  };
  prayerText: string;
  theologicalFocus: string;
  needsReview: boolean;
  storySlides: Array<{
    index: number;
    text: string;
    backgroundPrompt: string;
    altText: string;
  }>;
}
```

## Generierung

CLI:

```bash
npm run dev -- prayer generate --date 2026-08-10 --type morning
npm run dev -- prayer generate --date 2026-08-10 --type evening
npm run dev -- prayer render --date 2026-08-10 --type morning
npm run dev -- prayer schedule --date 2026-08-10 --type morning --at 07:15
npm run dev -- prayer schedule --date 2026-08-10 --type evening --at 21:00
```

Optionen:

```text
--without-news
--news-source <name>
--dry-run
--force
```

## Promptregeln

- einfache, klare Sprache
- keine frommen Floskeln ohne konkrete Aussage
- keine Behauptung, Gott habe ein aktuelles Ereignis verursacht oder gewollt
- keine schnelle religiöse Auflösung von Leid
- evangelisches Profil: Vertrauen auf Gottes Gnade, Klagefähigkeit, Hoffnung ohne Vertröstung
- Morgen- und Abendgebet müssen erkennbar verschieden sein
- keine wörtliche Wiederholung langer Quelltexte

## Veröffentlichung

- primär Instagram Story
- Phase 10 übernimmt Planung und Veröffentlichung
- bei aktuellen Nachrichten sollte standardmäßig eine manuelle Freigabe erforderlich sein
- vollautomatische Veröffentlichung ist nur für Gebete ohne News-Kontext als spätere, explizit aktivierte Option denkbar

## Akzeptanzkriterien

- Gebete verwenden ausschließlich bereitgestellte Quelldaten.
- Ohne News-Input werden keine aktuellen Ereignisse erwähnt.
- Jede verwendete Nachricht ist in den Metadaten nachvollziehbar.
- Morgen- und Abendgebet unterscheiden sich in Funktion und Ton.
- Story-Layouts sind lesbar und im Format 1080×1920.
- QA prüft Länge, Quellbezug, problematische Gewissheitsaussagen und fehlende Freigabe.
- Tests verwenden synthetische Losungen, Kirchenjahresdaten und Nachrichten-Fakes.

# Zusätzliche Codex-Regeln

- Schreibe kleine, testbare Funktionen.
- Nutze keine `any`-Typen ohne Begründung.
- API-Antworten immer validieren.
- Geheimnisse niemals loggen.
- Beispiel- und Testdaten dürfen keine realen personenbezogenen Informationen enthalten.
- Änderungen am Kalender nur über explizite Befehle.
- Jede Phase mit einem kurzen Changelog abschließen.
