import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { CalendarValidationError } from "../src/services/calendar/errors.js"
import {
  generateContentForMonth,
  generateContentForPost
} from "../src/services/content/content-generator.js"
import { createContentScaffold } from "../src/services/content/content-scaffolder.js"
import { readJsonFile } from "../src/services/content/content-storage.js"
import type {
  LiturgicalContext,
  LiturgicalSourceClient
} from "../src/services/liturgy/liturgical-source.js"
import type {
  ContentModelClient,
  ContentModelRequest,
  ContentModelResponse
} from "../src/services/openai/openai-client.js"

const fixturePath = join(
  process.cwd(),
  "content",
  "content-plan.json"
)

describe("content generator", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-generate-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("generates and writes a validated content package from a mock client", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const post = calendar.wochen[0]!.beitraege[0]!
    const scaffold = createContentScaffold(post)
    const modelResponse = {
      ...scaffold,
      editorial_core: {
        ...scaffold.editorial_core,
        title: "Fünf Minuten Aufmerksamkeit",
        main_message:
          "Glaube wird konkret, wenn jemand einem anderen ehrlich zuhört."
      },
      platforms: {
        ...scaffold.platforms,
        facebook: {
          headline: "Eine kleine Übung für diese Woche",
          text: "Nimm dir heute fünf Minuten für einen Menschen."
        }
      },
      visual: {
        ...scaffold.visual,
        concept: "Zwei Tassen an einem Tisch",
        flux_prompt:
          "Documentary still life, two cups on a wooden table, soft morning light, no typography"
      }
    }
    const client = createMockModelClient({
      model: "gpt-5.6",
      parsedContent: modelResponse,
      rawResponse: { id: "resp_mock_1" }
    })

    const result = await generateContentForPost(
      calendar,
      "post-0001",
      {
        dryRun: false,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      {
        modelClient: client,
        now: () => new Date("2026-08-05T12:00:00.000Z")
      }
    )

    const written = await readJsonFile<{ metadata: { model: string }; qa: { approved: boolean }; visual: { flux_prompt: string } }>(
      result.contentPath
    )

    expect(written.metadata.model).toBe("gpt-5.6")
    expect(written.qa.approved).toBe(false)
    expect(written.visual.flux_prompt).toContain("no typography")
  })

  it("returns a dry-run request without writing files or calling the model", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    let called = false
    const client = createMockModelClient({
      model: "gpt-5.6",
      parsedContent: {},
      rawResponse: {},
      onCall: () => {
        called = true
      }
    })

    const result = await generateContentForPost(
      calendar,
      "post-0001",
      {
        dryRun: true,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      { modelClient: client }
    )

    expect(result.dryRunRequest?.model).toBe("gpt-5.6")
    expect(called).toBe(false)
  })

  it("passes the resolved Wochenspruch text into the generation prompt", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)

    const result = await generateContentForPost(
      calendar,
      "post-0001",
      {
        dryRun: true,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      {
        liturgicalSourceClient: createMockLiturgicalSourceClient({
          entries: [
            {
              code: "10TR",
              label: "10. So. n. Trinitatis (Israelsonntag)",
              title: "Der Herr und sein Volk",
              weeklyVerse: {
                citation: "Ps 33,12",
                text: "Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat!",
                url: "https://example.com/ps33-12"
              }
            }
          ],
          sourceDate: "2026-08-09",
          sourcePath: "$.Tage['2026-08-09']",
          warnings: [],
          weeklyVerse: {
            citation: "Ps 33,12",
            text: "Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat!",
            url: "https://example.com/ps33-12"
          }
        })
      }
    )

    const promptPayload = JSON.parse(result.dryRunRequest!.userPrompt) as {
      liturgical_context: {
        resolved_weekly_verse: { text: string; citation: string }
      }
      scaffold: {
        editorial_core: { source_notes: string[] }
      }
    }

    expect(promptPayload.liturgical_context.resolved_weekly_verse.text).toContain(
      "Wohl dem Volk"
    )
    expect(promptPayload.liturgical_context.resolved_weekly_verse.citation).toBe(
      "Ps 33,12"
    )
    expect(promptPayload.scaffold.editorial_core.source_notes).toContain(
      "Wochenspruch: Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat! (Ps 33,12)"
    )
  })

  it("keeps a warning when multiple liturgical entries disagree on the Wochenspruch", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)

    const result = await generateContentForPost(
      calendar,
      "post-0001",
      {
        dryRun: true,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      {
        liturgicalSourceClient: createMockLiturgicalSourceClient({
          entries: [
            {
              code: "A",
              label: "Entry A",
              title: "First",
              weeklyVerse: {
                citation: "Ps 33,12",
                text: "First verse",
                url: "https://example.com/first"
              }
            },
            {
              code: "B",
              label: "Entry B",
              title: "Second",
              weeklyVerse: {
                citation: "Ps 40,1",
                text: "Second verse",
                url: "https://example.com/second"
              }
            }
          ],
          sourceDate: "2026-08-09",
          sourcePath: "$.Tage['2026-08-09']",
          warnings: [
            "Multiple liturgical entries for 2026-08-09 contain different Wochenspruch values. Local selection is still required before publication."
          ]
        })
      }
    )

    const promptPayload = JSON.parse(result.dryRunRequest!.userPrompt) as {
      liturgical_context: {
        resolved_weekly_verse: unknown
        warnings: string[]
      }
      scaffold: {
        qa: { warnings: string[] }
      }
    }

    expect(promptPayload.liturgical_context.resolved_weekly_verse).toBeNull()
    expect(promptPayload.liturgical_context.warnings).toContain(
      "Multiple liturgical entries for 2026-08-09 contain different Wochenspruch values. Local selection is still required before publication."
    )
    expect(promptPayload.scaffold.qa.warnings).toContain(
      "Multiple liturgical entries for 2026-08-09 contain different Wochenspruch values. Local selection is still required before publication."
    )
  })

  it("writes the raw response and rejects invalid generated content", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const client = createMockModelClient({
      model: "gpt-5.6",
      parsedContent: { id: "broken" },
      rawResponse: { id: "resp_invalid_1" }
    })

    const promise = generateContentForPost(
      calendar,
      "post-0001",
      {
        dryRun: false,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      { modelClient: client }
    )

    await expect(promise).rejects.toThrow(CalendarValidationError)
    const rawResponse = await readJsonFile<{ id: string }>(
      join(tempDir, "2026-08-10", "post-0001", "raw-openai-response.json")
    )
    expect(rawResponse.id).toBe("resp_invalid_1")
  })

  it("prevents overwriting existing content without force", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const post = calendar.wochen[0]!.beitraege[0]!
    const scaffold = createContentScaffold(post)
    const client = createMockModelClient({
      model: "gpt-5.6",
      parsedContent: scaffold,
      rawResponse: { id: "resp_existing_1" }
    })

    await generateContentForPost(
      calendar,
      "post-0001",
      {
        dryRun: false,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      { modelClient: client }
    )

    await expect(
      generateContentForPost(
        calendar,
        "post-0001",
        {
          dryRun: false,
          force: false,
          language: "de",
          model: "gpt-5.6",
          outputRoot: tempDir
        },
        { modelClient: client }
      )
    ).rejects.toThrow("--force")
  })

  it("creates an incomplete fallback package for predigt preview posts", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)

    const result = await generateContentForPost(
      calendar,
      "post-0006",
      {
        dryRun: false,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      {}
    )

    const written = JSON.parse(await readFile(result.contentPath, "utf8")) as {
      needs_input: boolean
      qa: { warnings: string[] }
    }

    expect(written.needs_input).toBe(true)
    expect(written.qa.warnings).toContain("Missing sermon input for Predigt-Preview")
  })

  it("generates a full month with a mock client", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const firstPost = calendar.wochen[0]!.beitraege[0]!
    const scaffold = createContentScaffold(firstPost)
    const client = createMockModelClient({
      model: "gpt-5.6",
      parsedContent: scaffold,
      rawResponse: { id: "resp_month_1" }
    })

    const results = await generateContentForMonth(
      calendar,
      "2026-09",
      {
        dryRun: true,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      { modelClient: client }
    )

    expect(results).toHaveLength(30)
    expect(results[0]?.dryRunRequest?.model).toBe("gpt-5.6")
  })
})

function createMockModelClient(options: {
  model: string
  onCall?: (request: ContentModelRequest) => void
  parsedContent: unknown
  rawResponse: unknown
}): ContentModelClient {
  return {
    async generateContent(
      request: ContentModelRequest
    ): Promise<ContentModelResponse> {
      options.onCall?.(request)

      return {
        model: options.model,
        parsedContent: options.parsedContent,
        rawResponse: options.rawResponse,
        usage: {
          inputTokens: 12,
          outputTokens: 34,
          totalTokens: 46
        }
      }
    }
  }
}

function createMockLiturgicalSourceClient(
  context: LiturgicalContext
): LiturgicalSourceClient {
  return {
    async loadContext(): Promise<LiturgicalContext> {
      return context
    }
  }
}
