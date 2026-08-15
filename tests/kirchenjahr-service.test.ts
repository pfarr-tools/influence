import { describe, expect, it } from "vitest"

import { expandKirchenjahrAbbreviations, loadKirchenjahr } from "../src/services/kirchenjahr/kirchenjahr-service.js"
import { buildRenderDocument } from "../src/services/render/post-renderer.js"
import type { CalendarPost } from "../src/domain/calendar.js"
import type { ContentPackage } from "../src/domain/content.js"

describe("kirchenjahr service", () => {
  it("loads calendar-year propria, preserves multiple entries, and normalizes colors", async () => {
    const entries = await loadKirchenjahr(2026, async () => new Response(JSON.stringify({
      Tage: {
        "2025-12-20": [{ Code: "OLD", Bezeichnung: "Vorjahr", "CSS-Farbe": "purple" }],
        "2026-12-20": [
          { Code: "4ADV", Bezeichnung: "4. Advent", Titel: "Die Freude", "CSS-Farbe": "purple", Wochenspruch: { Text: "Freut euch!", Bibelstelle: "Phil 4,4" }, Psalm: { Bibelstelle: "Ps 96" }, Perikopen: { "Altes Testament": { Bibelstelle: "Jes 62" }, Evangelium: { Bibelstelle: "Lk 1" }, Epistel: { Bibelstelle: "Phil 4" } }, Predigt: { Bibelstelle: "Phil 4" }, Lieder: [{ Titel: "Lied", Buch: "EG", Nummer: 9 }] },
          { Code: "OTHER", Bezeichnung: "Anderes Fest", "CSS-Farbe": "white" }
        ]
      }
    })))

    expect(entries).toHaveLength(2)
    expect(entries[0]?.cssColor).toBe("pink")
    expect(entries[0]?.description).toContain("Wochenspruch: „Freut euch!“ (Phil 4,4)")
    expect(entries[0]?.description).toContain("Weitere Proprien an diesem Tag: Anderes Fest")
    expect(entries[1]?.cssColor).toBe("white")
  })

  it("expands abbreviations found in the 2026 day names", () => {
    expect(expandKirchenjahrAbbreviations("1. So. n. Trinitatis")).toBe("1. Sonntag nach Trinitatis")
    expect(expandKirchenjahrAbbreviations("Drittl.S.d.Kj.")).toBe("Drittletzter Sonntag des Kirchenjahres")
    expect(expandKirchenjahrAbbreviations("Vorletzter Sonntag d. Kj.")).toBe("Vorletzter Sonntag des Kirchenjahres")
  })

  it("renders only the designation and optional title in the image", async () => {
    const post = { id: "kirchenjahr-2026-12-20-4adv", datum: "2026-12-20", rubrik: "Kirchenjahr" } as CalendarPost
    const content = {
      id: post.id, status: "freigegeben", needs_input: false,
      source: { calendar_post_id: post.id, date: post.datum, rubric: "Kirchenjahr", liturgical_source: "" },
      editorial_core: { title: "4. Advent", main_message: "", audience: "breite Öffentlichkeit", tone: ["ruhig"], source_notes: ["Titel: Die Freude"] },
      platforms: { facebook: { text: "Beschreibung", headline: "4. Advent" }, instagram: { caption: "Beschreibung", carousel: [] }, mastodon: { text: "Beschreibung" }, bluesky: { text: "Beschreibung" }, story: { slides: [] }, reel: { hook: "", script: "", shots: [], duration_seconds: 0 } },
      visual: { concept: "kirchenjahr:pink", flux_prompt: "", negative_prompt: "text", formats: ["1:1"], alt_text: "4. Advent" },
      qa: { warnings: [], approved: true }, metadata: { model: "", generated_at: "", prompt_version: "test", assets: [] }
    } as ContentPackage
    const document = await buildRenderDocument(post, content, "square", ".")
    expect(document.html).toContain("template-kirchenjahr")
    expect(document.html).toContain("background-color: pink")
    expect(document.html).toContain("4. Advent")
    expect(document.html).toContain("Die Freude")
    expect(document.html).not.toContain("Beschreibung")
  })
})
