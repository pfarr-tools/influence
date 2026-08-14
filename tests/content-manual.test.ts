import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { markContentAsGenerated } from "../src/services/content/content-manual.js"
import { scaffoldPostById } from "../src/services/content/content-scaffolder.js"
import { readContentPackage } from "../src/services/content/content-storage.js"

describe("manual content status", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "influence-manual-content-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("marks an authored scaffold as generated without changing its content", async () => {
    const calendar = await loadCalendarFromFile(
      join(process.cwd(), "content", "content-plan.json")
    )
    await scaffoldPostById(calendar, "post-0001", tempDir)

    await markContentAsGenerated(
      calendar,
      "post-0001",
      tempDir,
      new Date("2026-08-14T12:00:00.000Z")
    )

    const content = await readContentPackage(
      join(tempDir, calendar.wochen[0]!.beitraege[0]!.datum, "post-0001", "content.json")
    )
    expect(content.metadata.generated_at).toBe("2026-08-14T12:00:00.000Z")
    expect(content.metadata.model).toBe("manual")
    expect(content.status).toBe("in Arbeit")
  })
})
