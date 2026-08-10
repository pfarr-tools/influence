import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import {
  assertOutputRoot,
  createContentScaffold,
  scaffoldPostById,
  scaffoldWeekByDate
} from "../src/services/content/content-scaffolder.js"
import { contentPackageSchema } from "../src/services/content/content-schema.js"

const fixturePath = join(
  process.cwd(),
  "content",
  "content-plan.json"
)

describe("content scaffolder", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-content-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("creates a valid content package scaffold from a calendar post", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const post = calendar.wochen[0]!.beitraege[0]!

    const scaffold = createContentScaffold(post)

    expect(contentPackageSchema.parse(scaffold)).toBeDefined()
    expect(scaffold.id).toBe("post-0001")
    expect(scaffold.editorial_core.title).toBe(post.thema)
    expect(scaffold.editorial_core.main_message).toBe(post.konkrete_idee)
    expect(scaffold.qa.approved).toBe(false)
  })

  it("marks scaffolds as needing input when the post requires current facts", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const post = calendar.wochen[0]!.beitraege[1]!

    const scaffold = createContentScaffold(post)

    expect(scaffold.needs_input).toBe(true)
    expect(scaffold.editorial_core.audience).toContain("TODO")
    expect(scaffold.qa.warnings).toContain(
      "Current source inputs are still required before publication"
    )
  })

  it("writes a single post scaffold to the expected output path", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)

    const result = await scaffoldPostById(calendar, "post-0001", tempDir)
    const written = JSON.parse(await readFile(result.outputPath, "utf8")) as {
      id: string
      source: { date: string }
    }

    expect(result.outputPath).toBe(
      join(tempDir, "2026-08-10", "post-0001", "content.json")
    )
    expect(written.id).toBe("post-0001")
    expect(written.source.date).toBe("2026-08-10")
  })

  it("writes scaffolds for every post in a week", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)

    const results = await scaffoldWeekByDate(calendar, "2026-08-10", tempDir)

    expect(results).toHaveLength(7)
    expect(results[0]?.outputPath).toBe(
      join(tempDir, "2026-08-10", "post-0001", "content.json")
    )
    expect(results[6]?.outputPath).toBe(
      join(tempDir, "2026-08-16", "post-0007", "content.json")
    )
  })

  it("rejects an empty output root", () => {
    expect(() => assertOutputRoot("   ")).toThrowError("Output root must not be empty")
  })
})
