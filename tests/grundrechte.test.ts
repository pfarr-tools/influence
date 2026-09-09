import { describe, expect, it } from "vitest"

import {
  buildGrundrechteContent,
  buildGrundrechtePost,
  loadGrundrechteEntries,
  selectGrundrechteEntry,
  resolveGrundrechtePublicationTime
} from "../src/services/grundrechte/grundrechte-service.js"
import { resolveRenderTemplateKind, buildRenderDocument } from "../src/services/render/index.js"
import type { ContentPackage } from "../src/domain/content.js"

describe("Grundrechte", () => {
  it("loads the supplied rights source and creates a daily post at noon", async () => {
    const entries = await loadGrundrechteEntries("assets/grundrechte/zur-erinnerung.json")
    const entry = entries[0]!
    const post = buildGrundrechtePost("2026-08-26", entry)
    const content = buildGrundrechteContent(post, entry)

    expect(entries.length).toBeGreaterThan(100)
    expect(post.rubrik).toBe("Grundrechte")
    expect(post.veroeffentlichungszeit).toBe("12:00")
    expect(resolveGrundrechtePublicationTime("2026-08-26", "Europe/Berlin")).toMatch(/T10:00:00\.000Z$/)
    expect(content.editorial_core.title).toBe("Zur Erinnerung")
    expect(content.platforms.instagram.caption).toBe(`${entry.text} (${entry.reference})`)
    expect(content.visual.alt_text).toBe(`${entry.text} (${entry.reference})`)
    expect(selectGrundrechteEntry("2026-01-01", entries)).toEqual(entry)
    expect(selectGrundrechteEntry("2026-01-02", [entry, { text: "Zweiter", reference: "Quelle" }])).toEqual({ text: "Zweiter", reference: "Quelle" })
    expect(selectGrundrechteEntry("2026-01-03", [entry, { text: "Zweiter", reference: "Quelle" }])).toEqual(entry)
  })

  it("uses the dedicated renderer template with centered title, source, and mark", async () => {
    const entry = { text: "Ein Menschenrecht.", reference: "Quelle, Artikel 1" }
    const post = buildGrundrechtePost("2026-08-26", entry)
    const content = buildGrundrechteContent(post, entry)

    expect(resolveRenderTemplateKind("Grundrechte")).toBe("grundrechte")
    const document = await buildRenderDocument(post, content as ContentPackage, "instagram-story", "/tmp")

    expect(document.html).toContain("template-grundrechte")
    expect(document.html).toContain("Zur Erinnerung")
    expect(document.html).toContain("Ein Menschenrecht.")
    expect(document.html).toContain("Quelle, Artikel 1")
    expect(document.html).toContain('class="sender-mark"')
    expect(document.html).toContain("text-align: center")
  })
})
