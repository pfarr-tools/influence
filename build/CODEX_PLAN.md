# Codex-Implementierungsplan für Pfarr.Media

## Rolle

Du arbeitest als erfahrener TypeScript- und Node.js-Entwickler. Baue ein lokales, transparentes und gut testbares Werkzeug zur KI-gestützten Erstellung von Social-Media-Inhalten für einen evangelischen Pfarrer.

Arbeite inkrementell. Nach jeder Phase müssen Tests laufen und die CLI benutzbar bleiben. Keine automatische Veröffentlichung in Phase 1–6.

## Projektziel

Das System liest den Jahres-Redaktionskalender aus `content/content-plan.json`, ergänzt kirchenjahresbezogene Daten, erzeugt mit OpenAI strukturierte Contentpakete, generiert mit Flux textfreie Bildmotive und rendert daraus mit HTML/CSS und Playwright fertige Grafiken.

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
11. Die lokale UI verwendet Bootstrap für UI-Elemente und Vite mit Vue 3 für das Frontend.
12. Sämtliche UI-Texte und die End-User-Dokumentation verwenden korrektes Deutsch mit Umlauten und ß.
13. Aktionsbuttons folgen immer der fachlich logischen Reihenfolge der Content-Pipeline.
14. Erstellter Code ist immer vollständig auf englisch dokumentiert (JSDoc oder äquivalent)

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
data/                 # weitere externe Quelldaten
content/
  content-plan.json   # Redaktionsplan und redaktionelle Arbeitsstände
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
- `influence --help` zeigt die CLI-Hilfe.

# Phase 2 – Kalenderdaten laden und validieren

Implementiere Zod-Schemas für die bestehende Jahres-JSON.

CLI:

```bash
influence calendar validate content/content-plan.json
influence calendar list-week 2026-08-10
influence calendar list-month 2026-09
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
influence content scaffold --post-id post-0001
influence content scaffold-week --date 2026-08-10
```

Noch kein API-Aufruf. Erzeuge nur lokale Gerüste aus den Kalenderdaten.

Ausgabe:

```text
content/2026-08-10/post-0001/content.json
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
influence content generate --post-id post-0001
influence content generate-week --date 2026-08-10
influence content generate-month --month 2026-09
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
influence image generate --post-id post-0001
influence image generate-week --date 2026-08-10
```

Vorgaben:

- Immer textfreie Bilder generieren.
- Seitenverhältnis aus Zielplattform ableiten.
- Originalantwort und Bildmetadaten speichern.
- Bilddateien nach Post-ID und Format benennen.
- Wiederholbarkeit durch Seed unterstützen, sofern API verfügbar.

Beispiel:

```text
content/2026-08-10/post-0001/assets/background-4x5.webp
content/2026-08-10/post-0001/assets/background-9x16.webp
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
influence render post --post-id post-0001
influence render week --date 2026-08-10
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
influence qa post --post-id post-0001
influence qa week --date 2026-08-10
```

Statusübergang:

```text
Idee → in Arbeit → zur Prüfung → freigegeben → terminiert → veröffentlicht
```

Das System darf nur nach `freigegeben` weiterarbeiten.

# Phase 8 – Review-Oberfläche

Baue eine kleine lokale Weboberfläche mit lokalem HTTP-Backend und einem Frontend auf Basis von Vite und Vue 3.

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
- Die Reihenfolge von Aktionsbuttons und Workflow-Aktionen folgt der Content-Pipeline, also vom Bearbeiten und Generieren über Prüfung und Freigabe bis zu Export, Terminierung und Veröffentlichung.

Keine Authentifizierung nötig, solange die Anwendung nur lokal gebunden wird.

Verwende Bootstrap für die UI-Elemente.
Verwende Vite und Vue 3 für das Frontend.

# Phase 9 – Video/Reels optional

Nutze FFmpeg für einfache Reels:

- Flux-Hintergrund
- langsamer Zoom
- Sprechtext als Untertitel
- optional Audiospur
- 1080×1920

Kein generatives Video in der ersten Version.

# Phase 10 – Chat-Modal für Inhaltsdiskussion und strukturierte Überarbeitung

## Ziel

Pfarr.Media soll bestehende Inhalts-JSONs nicht nur bearbeitbar anzeigen, sondern in eine geführte Chat-Diskussion mit ChatGPT überführen können.

Der Benutzer kann dabei:

- ein bestehendes Content-JSON für einen einzelnen Post, eine Woche oder einen anderen unterstützten Ausschnitt öffnen
- einen initialen Prompt eingeben, zum Beispiel zur inhaltlichen Kritik, theologischen Zuspitzung, Zielgruppenanpassung oder Stilverbesserung
- anschließend in einem Chat über denselben Inhalt weiterdiskutieren
- jederzeit per Button eine überarbeitete JSON-Antwort im exakt gleichen Schema anfordern
- die überarbeitete JSON prüfen, vergleichen und gezielt übernehmen

## UX und Modal-Verhalten

Ergänze in der lokalen Review-Oberfläche ein Chat-Modal für Contentpakete.

Das Modal soll mindestens enthalten:

- Titel mit Bezug auf den aktuell geöffneten Inhalt
- Eingabefeld für den initialen Prompt
- sichtbare Kennzeichnung, welche JSON-Grundlage besprochen wird
- Chat-Verlauf mit Rollenkennzeichnung für Benutzer und Assistent
- Button zum Senden einer normalen Chat-Nachricht
- separaten Button zum Anfordern einer strukturgleichen JSON-Revision
- Bereich für die letzte strukturierte JSON-Antwort
- Aktionen zum Übernehmen, Verwerfen oder erneuten Anfordern der Revision

Die Aktionen im Modal folgen ebenfalls der fachlichen Reihenfolge:

- Prompt eingeben
- Nachricht senden
- strukturierte Revision anfordern
- Revision prüfen
- Revision übernehmen oder verwerfen

Der Unterschied zwischen Diskussion und Revision muss in der Oberfläche klar erkennbar sein:

- normale Chat-Nachrichten dienen nur der Diskussion und Analyse
- der Revisions-Button fordert explizit ein neues JSON im vorhandenen Schema an

## Unterstützte Kontexte

Das Modal muss mindestens mit diesen JSON-Typen funktionieren:

- einzelnes `content.json`
- gesamter `Redaktionsplan`
- Wochenplan oder Wochenpaket, sofern als JSON verfügbar
- andere zukünftige, klar schema-definierte Inhaltsobjekte

Die Implementierung muss deshalb einen generischen Ansatz für "JSON plus Schema-Hinweise plus Chat-Kontext" verwenden und nicht nur auf einen einzelnen Dateityp fest verdrahtet sein.

## Prompting und Request-Aufbau

Beim Start einer Session sendet das System an ChatGPT:

- den initialen Benutzer-Prompt
- das aktuelle JSON in serialisierter Form
- klare Anweisungen zum erwarteten Schema
- Hinweise, dass bei Diskussionsnachrichten zunächst natürlichsprachig geantwortet werden soll
- Hinweise, dass bei einer Revisionsanforderung ausschließlich ein valides JSON im selben Strukturformat zurückgegeben werden soll

Die Schema-Anweisungen sollen mindestens enthalten:

- Feldstruktur
- Pflichtfelder
- verbotene Freiform-Erweiterungen außerhalb des Schemas
- Erhalt stabiler Identifikatoren, sofern vorhanden
- keine Erfindung nicht belegter Fakten bei Reli-, Gemeinde- oder Predigtkontexten

Nutze für die strukturierte Revision die aktuelle OpenAI Responses API mit strukturierter Validierung gegen das passende Schema.

## Session-Modell

Implementiere ein lokales Sitzungsmodell, mindestens mit:

```ts
interface ContentChatSession {
  id: string;
  contextType: "post" | "week" | "plan" | "other";
  contextRef: string;
  schemaName: string;
  sourceJsonPath: string | null;
  sourceJson: unknown;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    kind: "discussion" | "revision_request" | "revision_result";
    content: string;
    createdAt: string;
  }>;
  lastRevisionJson: unknown | null;
  createdAt: string;
  updatedAt: string;
}
```

Anforderungen:

- Sessions lokal persistieren
- Chat-Verlauf pro Inhalt wieder öffnen können
- ursprüngliches JSON unverändert referenzieren
- Revisionsstände getrennt vom Original speichern
- keine stillschweigende Überschreibung ohne explizite Benutzeraktion

## Übernahme-Workflow

Wenn ChatGPT eine revidierte JSON liefert, muss die Oberfläche mindestens diese Schritte anbieten:

1. validieren gegen das ursprüngliche Schema
2. Unterschiede zum Ausgangs-JSON sichtbar machen
3. Revision wahlweise als Entwurf speichern oder in die aktive JSON übernehmen

Der Benutzer darf niemals gezwungen werden, die letzte Modellantwort direkt zu übernehmen.

## Vergleich und Nachvollziehbarkeit

Für jede strukturierte Revision anzeigen:

- Zeitpunkt
- verwendetes Modell
- Validierungsstatus
- kurze Diff-Ansicht oder Feldänderungen
- Hinweis auf entfernte, hinzugefügte oder geleerte Inhalte

Speichere zusätzlich:

- Rohantwort des Modells
- validierte JSON
- Validierungsfehler, falls vorhanden

## CLI und Backend-Endpunkte

Die UI kann serverseitige Endpunkte oder eine kleine lokale API verwenden.

Mindestens erforderlich:

```bash
influence chat start --post-id post-0001
influence chat start --plan content/content-plan.json
influence chat message --session-id <id> --text "Der Ton ist noch zu sachlich."
influence chat revise --session-id <id>
influence chat apply --session-id <id>
```

Mögliche HTTP-Endpunkte:

```text
POST /chat/sessions
POST /chat/sessions/:id/messages
POST /chat/sessions/:id/revise
POST /chat/sessions/:id/apply
GET /chat/sessions/:id
```

## Sicherheits- und Qualitätsregeln

- Strukturierte Revisionen müssen immer lokal gegen das passende Schema validiert werden.
- Eine Diskussionsantwort darf niemals automatisch als JSON übernommen werden.
- Das Modell darf keine unbekannten Zusatzfelder einschmuggeln.
- Bestehende IDs, Datumsbezüge und Statusfelder dürfen nur geändert werden, wenn das Schema und der Anwendungsfall das erlauben.
- Sensible Quellenfelder wie Bibelzitate, Liedtexte oder manuelle Redaktionshinweise dürfen nicht stillschweigend verfälscht werden.
- Bei Validierungsfehlern muss die Antwort als fehlgeschlagene Revision sichtbar bleiben und darf nicht übernommen werden.

## Akzeptanzkriterien

- Ein Benutzer kann aus der Review-Oberfläche ein Chat-Modal für ein bestehendes JSON öffnen.
- Der erste Request enthält Initialprompt, JSON-Kontext und Schema-Hinweise.
- Normale Chat-Nachrichten erzeugen Diskussionsantworten in natürlicher Sprache.
- Der Revisions-Button liefert ein valides JSON im selben Schema oder einen sichtbaren Validierungsfehler.
- Übernommene Revisionen überschreiben das Original nicht stillschweigend, sondern nur nach expliziter Aktion.
- Verlauf, Revisionen und Diff sind nach einem Neuladen der lokalen UI weiter verfügbar.
- Tests decken mindestens Session-Persistenz, Schema-Validierung, Revisionsfehler und den Übernahme-Workflow ab.

# Phase 11 – Review-Frontend mit Vite und Vue 3 modularisieren

## Ziel

Die lokale Review-Oberfläche ist zu einer eigenständigen App gewachsen. Für eine zukunftssichere Weiterentwicklung wird das Frontend deshalb konsequent auf Vite und Vue 3 aufgebaut. Bootstrap bleibt die UI-Basis. Das Backend bleibt lokal und stellt klar definierte Endpunkte für Workflow, Chat, Assets und Publishing bereit.

Ziele dieser Phase:

- klare Trennung von lokalem HTTP-Backend, Vue-Anwendung, Bootstrap-basierter UI-Komposition, Zustandslogik und API-Verträgen
- bessere Testbarkeit für Komponenten, Stores, View-Model-Mapping und Endpunkte
- geringere Kopplung zwischen Seitenstruktur, interaktiven Funktionen und Transportformaten
- explizite JSON-Endpunkte für alle interaktiven UI-Teile
- ein dauerhaft wartbares Frontend-Fundament auf Basis von Vite und Vue 3
- durchgehend deutsche UI-Texte mit korrekten Umlauten und ß
- konsistente Button-Reihenfolgen entlang der Content-Pipeline

## Ausgangsproblem

Die Review-Oberfläche enthält inzwischen:

- Wochenansicht
- Beitragsdetail mit Workflow-Steuerung
- Bearbeitungsformulare
- Preview- und Medienbereiche
- Chat-Modal mit Streaming und Revisionsübernahme
- Asset-Upload mit Cropping
- Voiceover- und Reel-bezogene Interaktionen

Diese Funktionen dürfen nicht länger implizit zwischen Serverdatei, HTML-Strings und Browserlogik verteilt sein. Künftig müssen die Verantwortlichkeiten klar getrennt werden zwischen:

- Backend-Routing
- Request-Parsing und Validierung
- API-Responses
- Vue-Seiten und Komponenten
- Bootstrap-basierte Präsentationsschicht
- Client-Zustand und Interaktionen
- explizite API-Verträge
- Branding-Assets und Dokumentationsassets

## Zielarchitektur

Verwende eine klare Trennung aus lokalem Backend und Vite/Vue-Frontend.

Empfohlene Struktur:

```text
src/services/review/
  server/
    review-server.ts
    routes/
      api-routes.ts
    controllers/
      workflow-controller.ts
      chat-controller.ts
      asset-controller.ts
      publishing-controller.ts
    responses/
      json-response.ts
    request/
      parse-json-body.ts
    contracts/
      workflow-contracts.ts
      chat-contracts.ts
      asset-contracts.ts
  frontend/
    index.html
    vite.config.ts
    src/
      main.ts
      app/
        App.vue
        router.ts
      pages/
        WeekViewPage.vue
        PostDetailPage.vue
      components/
        AppHeader.vue
        WorkflowStepper.vue
        ActionButtonGroup.vue
        PostActionsCard.vue
        PreviewGallery.vue
        AssetPanel.vue
        ChatModal.vue
        VoiceoverModal.vue
        ReelModal.vue
      stores/
        review-store.ts
        chat-store.ts
      composables/
        useWorkflowActions.ts
        useChatSession.ts
        useAssetUpload.ts
      api/
        review-api.ts
        chat-api.ts
        asset-api.ts
      utils/
        german-copy.ts
        action-order.ts
      styles/
        app.scss
        bootstrap-overrides.scss
  public/
    branding/
      logo-mark.svg
      favicon.svg
  docs/
    assets/
      logo-wordmark.svg
  review-service.ts
  content-chat-service.ts
```

Die exakten Dateinamen dürfen angepasst werden. Wichtig ist die Trennung der Schichten, nicht die wörtliche Verzeichnisstruktur.

## Architekturprinzipien

### 1. Dünner HTTP-Einstiegspunkt

`review-server.ts` soll nur noch:

- Dependencies entgegennehmen
- Requests an eine Routing- und Controller-Schicht delegieren
- Fehler zentral behandeln

Es soll keine UI-Komposition und keine Browserlogik direkt enthalten.

### 2. API-first für die lokale UI

Die Vue-Anwendung spricht klar benannte lokale API-Endpunkte an. Mindestens diese Gruppen werden getrennt geführt:

- Workflow-Endpunkte
- Chat-Endpunkte
- Asset-Endpunkte
- Publishing- und Export-Endpunkte

Beispiele:

- `GET /api/weeks/:date` liefert die Wochenansicht für die Vue-Seite
- `GET /api/posts/:id` liefert die Beitragsdetails inklusive Workflow-Status
- `POST /api/posts/:id/approve` führt eine Freigabeaktion aus
- `POST /api/chat/sessions/:id/messages` sendet eine Diskussionsnachricht
- `POST /api/chat/sessions/:id/revise` fordert eine strukturierte Revision an
- `POST /api/assets/uploads` lädt Medien hoch

### 3. Vue-Komponenten mit klaren Zuständigkeiten

Die UI wird in:

- Page-Komponenten
- wiederverwendbare Vue-Komponenten
- Composables und Stores
- kleine Utility-Module

zerlegt.

Regeln:

- Eine Page-Komponente komponiert nur noch Unterkomponenten und Datenquellen.
- Komponenten kennen keine Backend-Implementierung, sondern nur API-Clients oder Props.
- Komponenten erhalten vorbereitete, einfache View-Model-Daten.
- Bootstrap wird über Klassen, Variants und Utility-Klassen verwendet, nicht durch eine zweite konkurrierende UI-Bibliothek ersetzt.

### 4. Explizite View-Model-Schicht

Zwischen Review-Services und Vue-Komponenten soll eine kleine View-Model-Schicht eingeführt werden.

Sie bereitet Daten auf für:

- Labels
- Status-Badges
- Aktionsverfügbarkeit
- Preview-Listen
- QA-Zusammenfassungen
- Chat- und Medien-Metadaten

Dadurch bleibt Fachlogik aus Komponenten und Templates heraus.

### 5. Stores, Composables und Interaktionen modularisieren

Interaktive Funktionen werden in getrennte Frontend-Module verschoben.

Mindestens diese Bereiche sind getrennt zu kapseln:

- globales Laden und Fehlerzustände
- Workflow-Aktionen
- Chat-Modal
- Asset-Upload und Cropper
- Voiceover-Recorder
- Preview-Modal

Regeln:

- Zustandslogik liegt in Stores oder Composables, nicht direkt in großen Komponenten.
- UI-Interaktionen sprechen nur explizite API-Endpunkte an.
- Deutsche Button- und Statuslabels werden zentral gepflegt, damit Umlaute, ß und Terminologie konsistent bleiben.
- Aktionsgruppen werden aus einer zentral definierten fachlichen Reihenfolge erzeugt, nicht zufällig pro View zusammengesetzt.

### 6. Styles und Assets entkoppeln

Styles und Branding-Assets sollen in stabile Frontend- und Dokumentationspfade ausgelagert werden.

Anforderungen:

- Bootstrap bleibt erhalten.
- projektspezifische Styles liegen in eigenen Frontend-Stylesheets
- der Header, die App-Navigation und Favicon-Verweise verwenden die Logovariante ohne Text
- die Dokumentation verwendet für ihren Titel die Logovariante mit Text
- Branding-Dateien liegen nicht lose im Repository-Wurzelverzeichnis, sondern in klar benannten Asset-Ordnern

Vorgesehene Ablage:

- `public/branding/logo-mark.svg` für Header-Logo
- `public/branding/favicon.svg` für Favicon und browsernahe App-Icons
- `docs/assets/logo-wordmark.svg` für den Dokumentationstitel

### 7. API-Verträge sichtbar machen

Für alle interaktiven Module sollen Request- und Response-Formate explizit benannt und dokumentiert werden.

Mindestens für:

- Chat-Session laden
- Chat-Nachricht senden
- Chat-Streaming
- Revision anfordern
- Revision übernehmen
- Asset hochladen
- Voiceover speichern

Wo sinnvoll, sollen Zod-Schemas oder gleichwertige Validatoren verwendet werden.

### 8. Deutsche UI-Copy und Aktionsreihenfolge absichern

Die UI muss sprachlich und fachlich konsistent bleiben.

Anforderungen:

- sichtbare UI-Texte, Labels, Hilfetexte und Fehlermeldungen sind auf Deutsch formuliert
- Umlaute und ß werden korrekt verwendet
- die Reihenfolge von Aktionsbuttons folgt der fachlichen Abfolge der Content-Pipeline
- typische Reihenfolgen werden zentral definiert, zum Beispiel `Bearbeiten -> Generieren -> Prüfen -> Freigeben -> Exportieren -> Terminieren -> Veröffentlichen`
- destruktive oder sekundäre Aktionen stehen nie vor dem nächsten fachlich sinnvollen Hauptschritt

## Umsetzungsreihenfolge

Die Phase soll inkrementell umgesetzt werden. Nach jedem Teilabschnitt muss die bestehende UI weiter benutzbar bleiben.

### Schritt 1 – Frontend-Grundlage schaffen

- Vite und Vue 3 in die bestehende Anwendung integrieren
- Bootstrap in das Frontend einbinden
- Frontend-Einstiegspunkt, Build und lokales Serving festlegen
- Branding-Ordner für App und Dokumentation anlegen

### Schritt 2 – API- und Vertragsgrenzen festlegen

- bestehende Review-Funktionen als klare JSON-Endpunkte modellieren
- Request-Validierung vereinheitlichen
- Response-Formate dokumentieren und testen
- die Datenform für Workflow, Post-Detail, Chat und Assets stabilisieren

### Schritt 3 – Seiten und Komponenten migrieren

- Wochenansicht als Vue-Seite aufbauen
- Beitragsdetail als Vue-Seite aufbauen
- Workflow, QA, Preview, Assets und Reel-Status in Komponenten kapseln
- Bootstrap-Komponenten und Layouts konsistent anwenden

### Schritt 4 – Interaktionen in Stores und Composables überführen

- Chat-Modal in Store und Komponenten überführen
- Asset-Upload inklusive Cropping in eigene Frontend-Module überführen
- Voiceover- und Preview-Interaktionen trennen
- Aktionsreihenfolgen zentralisieren und in der UI anwenden

### Schritt 5 – Sprache, Branding und Politur festziehen

- alle UI-Texte auf korrektes Deutsch prüfen
- Logo ohne Text in Header, Navigation und Favicon einbinden
- Logo mit Text im Dokumentationskopf verwenden
- Bootstrap-Theme und projektspezifische Styles finalisieren

### Schritt 6 – Tests und Dokumentation ergänzen

- Unit-Tests für View-Model-Helfer, Stores und Composables
- Integrations-Tests für zentrale Review-Endpunkte
- UI-nahe Tests für Vue-Komponenten, soweit ohne Browser-E2E sinnvoll
- End-User-Dokumentation für die Review-Oberfläche und ihre erweiterten Interaktionen aktualisieren

## Nicht-Ziele

- keine Einführung eines zweiten Frontend-Frameworks neben Vue 3
- keine Ablösung von Bootstrap durch ein anderes UI-System
- keine vollständige Neugestaltung der Review-Oberfläche ohne fachlichen Grund
- keine Änderung der fachlichen Review-Workflows nur aus Architekturgründen
- kein Wechsel der UI-Sprache weg von Deutsch
- keine beliebige oder viewspezifisch abweichende Button-Reihenfolge

## Akzeptanzkriterien

- `review-server.ts` ist nur noch ein dünner lokaler HTTP-Einstiegspunkt und enthält keine umfangreiche UI-Logik.
- Das Frontend läuft mit Vite und Vue 3.
- Bootstrap bleibt die Grundlage aller UI-Elemente.
- Wochenansicht, Beitragsdetail, Chat, Assets und Voiceover sind als getrennte Vue-Module oder Komponenten organisiert.
- Chat, Asset-Upload, Workflow-Aktionen und Voiceover verwenden explizite API-Verträge.
- Alle sichtbaren UI-Texte sind korrekt auf Deutsch formuliert und verwenden Umlaute und ß richtig.
- Aktionsbuttons folgen in allen relevanten Views der fachlich logischen Reihenfolge der Content-Pipeline.
- Die Logovariante ohne Text wird für Header-Logo und Favicon verwendet.
- Die Logovariante mit Text wird im Dokumentationstitel verwendet.
- Tests decken mindestens API-Verträge, View-Model-Aufbereitung, Stores, Composables und ausgewählte Vue-Komponenten ab.
- Die lokale UI bleibt während der Migration nach jedem Zwischenstand benutzbar.

## Changelog dieser Phase

Dokumentiere nach der Umsetzung mindestens:

- welche Vite- und Vue-Grundlage eingeführt wurde
- welche API-Verträge neu oder klarer definiert wurden
- welche Komponenten, Stores und Composables entstanden sind
- wie Branding-Dateien und Dokumentationsassets eingeordnet wurden
- welche Tests ergänzt oder angepasst wurden

# Phase 12 – Publishing, Scheduling und manueller Facebook-Assistent

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
influence publish preview --post-id post-0007
influence publish schedule --post-id post-0007 --platform instagram --at 2026-08-16T08:00:00+02:00
influence publish run
influence publish retry --job-id <id>
influence publish facebook --post-id post-0007
influence publish mark-published --post-id post-0007 --platform facebook
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

# Phase 13 – Tageslosungen importieren und als Story veröffentlichen

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
influence losungen import "data/losungen/Losungen Free 2026.xml"
influence losungen validate --year 2026
influence losungen show --date 2026-08-10
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
influence losungen render-story --date 2026-08-10
influence losungen schedule-story --date 2026-08-10 --at 07:00
```

## Veröffentlichung

- Zielplattform zunächst Instagram Story.
- Optional später Facebook-Seiten-Story, falls ein entsprechender Kanal verwendet wird.
- Das persönliche Facebook-Profil wird nicht automatisiert beliefert.
- Veröffentlichung läuft über Phase 12.

## Akzeptanzkriterien

- Die XML-Datei für 2026 wird vollständig importiert.
- Datum, Losung, Lehrtext und beide Bibelstellen werden unverändert übernommen.
- Für einen Beispieltag entsteht eine valide 9:16-Story.
- Fehlender Jahrestag verhindert die automatische Veröffentlichung und erzeugt eine sichtbare Warnung.
- Tests verwenden kleine synthetische XML-Dateien ohne reale Losungstexte.

# Phase 14 – Neueste Predigt erkennen und plattformübergreifend teilen

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
influence sermon fetch-latest
influence sermon inspect-latest
influence sermon generate-latest
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

Ein Scheduler kann den Feed regelmäßig abrufen, zum Beispiel stündlich oder täglich. Er darf jedoch nur einen Entwurf erzeugen. Veröffentlichung erfordert weiterhin die in Phase 12 festgelegte Freigabe.

## Akzeptanzkriterien

- Der Feed-Adapter erkennt den neuesten Eintrag deterministisch.
- Derselbe Feed-Eintrag wird nicht doppelt verarbeitet.
- Alle Plattformvarianten verweisen auf dieselbe kanonische Predigt-URL.
- Facebook verwendet den Clipboard-plus-Sharer-Workflow.
- Instagram-Feedbild und Story werden gerendert.
- Fehlende Feedfelder werden nicht erfunden.
- Tests verwenden lokale RSS-Fixtures und keine Live-Abhängigkeit.

# Phase 15 – Morgen- und Abendgebete als tägliche Stories

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
influence prayer generate --date 2026-08-10 --type morning
influence prayer generate --date 2026-08-10 --type evening
influence prayer render --date 2026-08-10 --type morning
influence prayer schedule --date 2026-08-10 --type morning --at 07:15
influence prayer schedule --date 2026-08-10 --type evening --at 21:00
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
- Phase 12 übernimmt Planung und Veröffentlichung
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
