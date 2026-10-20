# Architektur

## Runtime und Persistenz

Die unterstützte Runtime ist das Docker-Image aus `Dockerfile`, gesteuert über
den Host-Wrapper `./influence`. `compose.yaml` bindet den Quellbaum für die
Entwicklung nach `/app` ein und hält npm-Abhängigkeiten in einem benannten
Volume. `content/` und der Token-Speicher bleiben persistent außerhalb der
Image-Layer.

Produktionsbefehle werden ausdrücklich mit `./influence prod ...` ausgeführt.
Die Produktions-Compose-Datei bindet keinen Quellcode ein und verwendet eigene
benannte Volumes für Content und Runtime-Daten.

## Datenfluss

```text
Kirchenjahr-API
      │
      ▼
Redaktionskalender JSON
      │
      ▼
Kalender-Validator
      │
      ▼
OpenAI Content Generator
      │
      ▼
Content Package JSON
      ├──────────────┐
      ▼              ▼
Flux Generator   HTML/CSS Templates
      │              │
      └──────┬───────┘
             ▼
       Playwright Render
             │
             ▼
       Review und Freigabe
```

## Speicherstruktur

```text
content/
  2026-08-10/
    post-0001/
      content.json
      raw-openai-response.json
      qa.json
      assets/
        background-4x5.webp
        background-9x16.webp
      rendered/
        instagram-feed.png
        instagram-story.png
        facebook.png
```

## Trennung der Verantwortlichkeiten

### Kalenderdienst

Liest und validiert Planungsdaten. Kennt keine KI.

### Contentdienst

Erzeugt Plattformtexte und Kreativkonzept. Kennt keine Rendering-Details.

### Bilddienst

Erzeugt nur textfreie Motive.

### Renderdienst

Setzt typografische Gestaltung und Text zuverlässig um.

### QA-Dienst

Prüft Vollständigkeit, Datenschutz, Quellen und technische Plausibilität.

## Statusmodell

```text
Idee
in Arbeit
zur Prüfung
freigegeben
terminiert
veröffentlicht
verworfen
```

Nur `freigegeben` darf exportiert oder später veröffentlicht werden.

## Veröffentlichung und externe Rückrufe

Automatische Veröffentlichungen laufen über plattformspezifische Adapter. Der
Mastodon-Adapter lädt lokale Medien direkt beim Mastodon-Server hoch und legt
anschließend den Status über die Mastodon API an. Zugangstoken werden nicht in
Publikationsjobs gespeichert.

OAuth-Rückrufe und künftig weitere externe Veröffentlichungs-Endpunkte liegen
unter dem gemeinsamen Präfix `/publish/`. Für Mastodon ist der öffentliche
Rückruf `/publish/mastodon/oauth/callback`; der administrative Start-Endpunkt
liegt bewusst außerhalb dieses Präfixes unter `/admin/mastodon/oauth/start`.
Reverse-Proxy- und HTTP-Basic-Auth-Regeln können daher `/publish/*` vom Schutz
ausnehmen, während der OAuth-Start und alle zukünftigen Verwaltungs-Endpunkte
geschützt bleiben.
