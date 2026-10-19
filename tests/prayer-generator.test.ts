import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { generatePrayer } from "../src/services/prayers/prayer-generator.js"
import type { PrayerCycleSourceClient } from "../src/services/prayers/prayer-cycle-source.js"
import type { ContentModelClient, ContentModelRequest, ContentModelResponse } from "../src/services/openai/openai-client.js"

describe("prayer generator", () => {
  let tempDir: string
  let calendarPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "influence-prayer-test-"))
    calendarPath = join(tempDir, "content-plan.json")
    await writeFile(calendarPath, await readFile(join(process.cwd(), "content/content-plan.json"), "utf8"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("adds a dated morning post and generates it from the universal scaffold", async () => {
    const scaffold = JSON.parse(await readFile("assets/prayers/scaffold.morning.json", "utf8"))
    const result = await generatePrayer({
      calendarPath,
      date: "2026-08-15",
      dryRun: false,
      force: false,
      kind: "morning",
      language: "de",
      model: "test-model",
      outputRoot: tempDir,
      publicationTimezone: "Europe/Berlin"
    }, { modelClient: mockClient(scaffold) })

    expect(result.postId).toBe("prayer-morning-2026-08-15")
    expect(result.result.content?.qa.approved).toBe(false)
    expect(result.result.content?.source.rubric).toBe("Morgengebet")

    const calendar = await loadCalendarFromFile(calendarPath)
    expect(calendar.wochen.flatMap((week) => week.beitraege).some((post) => post.id === result.postId)).toBe(true)
  })

  it("does not mutate the calendar during a dry run", async () => {
    const before = await readFile(calendarPath, "utf8")
    const result = await generatePrayer({
      calendarPath,
      date: "2026-08-15",
      dryRun: true,
      force: false,
      kind: "evening",
      language: "de",
      model: "test-model",
      outputRoot: tempDir,
      publicationTimezone: "Europe/Berlin"
    }, { prayerCycleSourceClient: mockPrayerCycleSourceClient() })

    expect(result.result.dryRunRequest?.userPrompt).toContain("Abendgebet")
    expect(result.result.dryRunRequest?.webSearch).toBe(false)
    expect(result.result.dryRunRequest?.userPrompt).toContain("Ökumenischen Fürbittkalender")
    expect(await readFile(calendarPath, "utf8")).toBe(before)
  })

  it("asks morning prayers to vary their randomly selected Bible reference", async () => {
    const result = await generatePrayer({
      calendarPath,
      date: "2026-08-15",
      dryRun: true,
      force: false,
      kind: "morning",
      language: "de",
      model: "test-model",
      outputRoot: tempDir,
      publicationTimezone: "Europe/Berlin"
    }, {})

    expect(result.result.dryRunRequest?.developerPrompt).toContain(
      "several suitable Bible references"
    )
    expect(result.result.dryRunRequest?.developerPrompt).toContain(
      "randomly select one"
    )
    expect(result.result.dryRunRequest?.developerPrompt).toContain(
      "Psalm 118:24"
    )
  })

  it("includes the selected prayer-cycle intention in the evening prompt", async () => {
    const result = await generatePrayer({
      calendarPath,
      date: "2026-08-15",
      dryRun: true,
      force: false,
      kind: "evening",
      language: "de",
      model: "test-model",
      outputRoot: tempDir,
      publicationTimezone: "Europe/Berlin"
    }, { prayerCycleSourceClient: mockPrayerCycleSourceClient() })

    expect(result.result.dryRunRequest?.userPrompt).toContain("Für Menschen, die heute keinen sicheren Ort haben")
    expect(result.result.dryRunRequest?.userPrompt).toContain("Beispielregion")
    expect(result.result.dryRunRequest?.userPrompt).toContain("keine Flaggen")
    expect(result.result.dryRunRequest?.userPrompt).toContain("nicht stereotypen")
    expect(result.result.dryRunRequest?.developerPrompt).toContain("regional visual concept")
  })
})

function mockPrayerCycleSourceClient(): PrayerCycleSourceClient {
  return {
    async loadForDate() {
      return {
        region: "Beispielregion",
        weekStart: "2026-08-10",
        weekEnd: "2026-08-16",
        items: [
          { kind: "thanksgiving", text: "Für die Schönheit der Schöpfung" },
          { kind: "intercession", text: "Für Menschen, die heute keinen sicheren Ort haben" }
        ],
        selectedIntention: { kind: "intercession", text: "Für Menschen, die heute keinen sicheren Ort haben" },
        sourceUrl: "https://www.oikoumene.org/de/resources/prayer-cycle/example"
      }
    }
  }
}

function mockClient(content: unknown, webSearchPerformed = true): ContentModelClient {
  const generated = JSON.parse(JSON.stringify(content)) as {
    id: string
    source: { calendar_post_id: string; date: string }
  }
  generated.id = "prayer-morning-2026-08-15"
  generated.source.calendar_post_id = generated.id
  generated.source.date = "2026-08-15"

  return {
    async generateContent(_request: ContentModelRequest): Promise<ContentModelResponse> {
      return {
        model: "test-model",
        parsedContent: generated,
        rawResponse: { id: "test-response" },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        webSearchPerformed
      }
    }
  }
}
