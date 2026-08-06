![Influence](assets/logo-wordmark.svg)

# Influence für Benutzerinnen und Benutzer

## Zielgruppe

Dieses Dokument richtet sich an Redakteurinnen, Redakteure und andere nicht-technische Personen, die Inhalte in der lokalen Review-Oberfläche prüfen, bearbeiten und freigeben.

## Grundidee

Influence arbeitet mit einem Redaktionskalender. Für jeden Beitrag können Texte, Bilder, Story-Slides, Reel-Elemente und Vorschauen vorbereitet werden. Die eigentliche redaktionelle Arbeit findet in der lokalen Benutzeroberfläche statt.

## Oberfläche starten

Die Oberfläche wird technisch bereitgestellt. Wenn sie läuft, wird sie im Browser über eine lokale Adresse geöffnet, typischerweise:

`http://127.0.0.1:3040/`

## Aufbau der Oberfläche

### Wochenübersicht

Die Wochenübersicht zeigt:

- den aktuellen Wochenfokus
- alle Beiträge der Woche
- den Bearbeitungsstatus
- verfügbare Wochenaktionen

Von hier aus gelangt man in einzelne Beiträge.

### Beitragsansicht

In der Beitragsansicht gibt es typischerweise:

- Workflow-Aktionen
- Bearbeitungsformular für Texte und Metadaten
- Qualitätssicherung
- Assets
- Social-Bilder und generierte Vorschauen
- Voiceover- und Reel-Bereich
- JSON-Diskussion mit ChatGPT

## Typischer Arbeitsablauf in der UI

### 1. Beitrag öffnen

In der Wochenübersicht den gewünschten Beitrag anklicken.

### 2. Inhalt prüfen und bearbeiten

Im Formular können unter anderem bearbeitet werden:

- Titel
- Zielgruppe
- Kernbotschaft
- Bildkonzept
- Flux-Prompt
- Facebook-Headline
- Facebook-Text
- Instagram-Caption
- Mastodon-Text
- Reel-Hook
- Story-Slides
- Reel-Skript
- Alt-Text

Änderungen mit `Speichern` sichern.

### 3. Qualitätssicherung prüfen

Im Bereich `Qualitätssicherung` werden Warnungen und Fehler angezeigt.

- `freigabereif` bedeutet: Der Beitrag ist aus Sicht der QA bereit für die Freigabe.
- Warnungen sind Hinweise.
- Fehler sollten vor der Freigabe geklärt werden.

### 4. Bilder und Social-Bilder erzeugen

Über die Aktionsbuttons können je nach Stand des Beitrags folgende Schritte ausgelöst werden:

- `Bilder erzeugen`
- `Reelbilder erzeugen`
- `Social-Bilder rendern`
- `Reel rendern`

Wenn eine Aktion bereits einmal erfolgreich gelaufen ist, kann sie erneut mit `Force` ausgelöst werden.

### 5. Assets manuell hochladen

Im Bereich `Assets` können Dateien manuell hinterlegt werden, zum Beispiel:

- Hintergrundbilder
- Reel-Shots
- vorhandene Audio-Dateien

Die Upload-Maske ordnet Dateien bekannten Ziel-Slots zu.

### 6. Voiceover aufnehmen

Im Bereich `Voiceover` kann direkt in der Oberfläche eine Aufnahme gemacht werden.

Der Ablauf:

1. `Voiceover aufnehmen` klicken
2. Countdown abwarten
3. Text sprechen
4. Aufnahme stoppen oder automatisch beenden lassen
5. Vorschau anhören

Wenn bereits ein Voiceover vorhanden ist, wird es durch eine neue Aufnahme ersetzt.

### 7. Vorschauen ansehen

Im rechten Bereich werden die erzeugten Bilder angezeigt. Durch Anklicken kann man die Vorschau größer öffnen und durch mehrere Bilder navigieren.

### 8. JSON mit ChatGPT diskutieren

Mit `JSON mit ChatGPT` kann der aktuelle Beitrag als strukturierte JSON-Datei überarbeitet werden.

Typischer Ablauf:

1. Dialog öffnen
2. Änderungswunsch formulieren
3. Revision anfordern
4. Vorschlag prüfen
5. gültige Revision übernehmen

## Empfohlene Reihenfolge für Redakteurinnen und Redakteure

1. Beitrag öffnen
2. Texte inhaltlich prüfen
3. speichern
4. QA lesen
5. Bilder erzeugen oder vorhandene Assets hochladen
6. Social-Bilder prüfen
7. bei Bedarf Reel-Bilder und Reel erstellen
8. Voiceover aufnehmen
9. final prüfen
10. freigeben oder exportieren

## Bedeutende Statusanzeigen

- `in Arbeit`
  Beitrag ist noch nicht final.

- `freigabereif`
  QA meldet keine blockierenden Probleme.

- `Freigeben`
  markiert den Beitrag als redaktionell freigegeben.

## Häufige Fragen

### Warum sehe ich nach einer Aktion neue Bilder oder Audio erst nach kurzer Verzögerung?

Die Oberfläche lädt den Beitrag nach Aktionen neu. Dateien werden mit neuer URL eingebunden, damit keine alten Browser-Caches verwendet werden.

### Kann ich einen bereits erzeugten Inhalt noch ändern?

Ja. Die Formularfelder können jederzeit bearbeitet und gespeichert werden. Danach sollten QA, Bild- oder Render-Schritte bei Bedarf erneut ausgeführt werden.

### Kann ich eine Aufnahme ersetzen?

Ja. Eine neue Voiceover-Aufnahme ersetzt das bisherige Voiceover desselben Beitrags.

### Muss ich die CLI benutzen?

Nein. Für die redaktionelle Bearbeitung ist die UI gedacht. Die CLI ist vor allem für technische oder automatisierte Abläufe relevant.

## Verwandte Dokumente

- [Admin.md](Admin.md)
- [CLI.md](CLI.md)
