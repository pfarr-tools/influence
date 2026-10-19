import { describe, expect, it } from "vitest"

import { createPrayerCycleSourceClient } from "../src/services/prayers/prayer-cycle-source.js"

describe("prayer cycle source", () => {
  it("loads the matching German week and selects the weekday intention in order", async () => {
    const client = createPrayerCycleSourceClient({
      fetch: async (input) => new Response(
        input.toString().endsWith("/prayer-cycle")
          ? '<table><tr><td>05 - 11 Oktober 2026</td><td><a href="/de/resources/prayer-cycle/example">Beispielregion</a></td></tr></table>'
          : `
            <h1>Beispielregion</h1>
            <p>05 - 11 Oktober 2026</p>
            <h3>Anregungen für Dank und Fürbitte</h3>
            <h4>Wir danken:</h4>
            <ul><li>Dankpunkt eins</li><li>Dankpunkt zwei</li></ul>
            <h4>Wir beten für:</h4>
            <ul><li>Fürbitte eins</li><li>Fürbitte zwei</li><li>Fürbitte drei</li><li>Fürbitte vier</li><li>Fürbitte fünf</li></ul>
          `
      )
    })

    const result = await client.loadForDate("2026-10-07")

    expect(result.region).toBe("Beispielregion")
    expect(result.weekStart).toBe("2026-10-05")
    expect(result.weekEnd).toBe("2026-10-11")
    expect(result.selectedIntention).toEqual({ kind: "intercession", text: "Fürbitte eins" })
    expect(result.items).toHaveLength(7)
    expect(result.sourceUrl).toContain("/de/resources/prayer-cycle/example")
  })
})
