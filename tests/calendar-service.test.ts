import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { beforeEach, describe, expect, it } from "vitest"

import {
  getPostsForMonth,
  getWeekForDate,
  loadCalendarFromFile
} from "../src/services/calendar/calendar-service.js"
import { CalendarValidationError } from "../src/services/calendar/errors.js"

const fixturePath = join(
  process.cwd(),
  "data",
  "redaktionskalender-2026-2027.json"
)

describe("calendar service", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-calendar-test-"))
  })

  it("loads and validates the existing calendar file", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)

    expect(calendar.meta.titel).toContain("Redaktionskalender")
    expect(calendar.wochen).toHaveLength(52)
    expect(calendar.wochen[0]?.beitraege[0]?.id).toBe("post-0001")
  })

  it("reports a useful validation error for invalid data", async () => {
    const invalidPath = join(tempDir, "invalid-calendar.json")
    const source = JSON.parse(await readFile(fixturePath, "utf8")) as {
      wochen: Array<{ beitraege: Array<{ datum: string }> }>
    }

    source.wochen[0]!.beitraege[0]!.datum = "10.08.2026"

    await writeFile(invalidPath, JSON.stringify(source, null, 2))

    await expect(loadCalendarFromFile(invalidPath)).rejects.toThrow(
      new RegExp("wochen\\.0\\.beitraege\\.0\\.datum")
    )
  })

  it("finds the week that contains a given date", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const week = getWeekForDate(calendar, "2026-08-10")

    expect(week.id).toBe("2026-2027-W01")
    expect(week.zeitraum.von).toBe("2026-08-10")
    expect(week.beitraege).toHaveLength(7)
  })

  it("lists all posts for a month", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const posts = getPostsForMonth(calendar, "2026-09")

    expect(posts).toHaveLength(30)
    expect(posts[0]?.datum).toBe("2026-09-01")
    expect(posts[posts.length - 1]?.datum).toBe("2026-09-30")
  })

  it("rejects an invalid month lookup", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)

    expect(() => getPostsForMonth(calendar, "2026/09")).toThrow(
      CalendarValidationError
    )
  })

  it("cleans up temp files after invalid fixture tests", async () => {
    await rm(tempDir, { recursive: true, force: true })

    expect(true).toBe(true)
  })
})
