# Architektur

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
output/
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
