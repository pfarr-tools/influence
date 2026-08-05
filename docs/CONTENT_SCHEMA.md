# Contentpaket-Schema

```json
{
  "id": "post-0001",
  "status": "in Arbeit",
  "needs_input": false,
  "source": {
    "calendar_post_id": "post-0001",
    "date": "2026-08-10",
    "rubric": "Mit dem Wochenspruch in die Woche",
    "liturgical_source": "https://kirchenjahr.pfarr.tools/api/jahr/2026"
  },
  "editorial_core": {
    "title": "Arbeitstitel",
    "main_message": "Ein Satz als theologischer Kern",
    "audience": "breite Öffentlichkeit",
    "tone": ["klar", "ruhig", "zugänglich"],
    "source_notes": []
  },
  "platforms": {
    "facebook": {
      "text": "",
      "headline": ""
    },
    "instagram": {
      "caption": "",
      "carousel": []
    },
    "mastodon": {
      "text": ""
    },
    "story": {
      "slides": []
    },
    "reel": {
      "hook": "",
      "script": "",
      "shots": [],
      "duration_seconds": 0
    }
  },
  "visual": {
    "concept": "",
    "flux_prompt": "",
    "negative_prompt": "text, letters, logo, watermark",
    "formats": ["4:5", "9:16", "1.91:1"],
    "alt_text": ""
  },
  "qa": {
    "warnings": [],
    "approved": false
  },
  "metadata": {
    "model": "",
    "generated_at": "",
    "prompt_version": "1.0",
    "assets": []
  }
}
```

## Pflichtlogik

- `needs_input = true`, wenn aktuelle Fakten fehlen.
- `qa.approved = false` nach jeder Neugenerierung.
- `qa.approved` darf erst nach bestandener QA und manueller Freigabe auf `true` gesetzt werden.
- `visual.alt_text` muss vor Freigabe gefüllt sein.
- Flux-Prompts dürfen nie Text im Bild verlangen.
