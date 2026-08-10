import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RuntimeConfig } from "../src/config/runtime-config.js"
import type { ContentPackage } from "../src/domain/content.js"
import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { readJsonFile } from "../src/services/content/content-storage.js"
import { scaffoldPostById } from "../src/services/content/content-scaffolder.js"
import {
  appendDiscussionMessage,
  applyContentChatRevision,
  loadContentChatSession,
  requestContentChatRevision,
  startContentChatSession,
  type JsonChatModelClient
} from "../src/services/review/index.js"

const sourceCalendarPath = join(
  process.cwd(),
  "content",
  "content-plan.json"
)

describe("content chat service", () => {
  let tempDir: string
  let tempCalendarPath: string
  let runtimeConfig: RuntimeConfig

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-chat-test-"))
    tempCalendarPath = join(tempDir, "content-plan.json")
    await cp(sourceCalendarPath, tempCalendarPath)
    runtimeConfig = {
      calendarPath: tempCalendarPath,
      ffmpegBinary: "ffmpeg",
      fluxApiBaseUrl: "",
      fluxApiGeneratePath: "/v1",
      fluxApiKey: "",
      fluxModel: "flux",
      openAiApiKey: "test-key",
      openAiModel: "gpt-5.6",
      outputDir: tempDir,
      publicationDefaultTimeBluesky: "08:30",
      publicationDefaultTimeFacebook: "12:00",
      publicationDefaultTimeInstagram: "08:00",
      publicationDefaultTimeLinkedin: "09:30",
      publicationDefaultTimeMastodon: "08:15",
      publicationDefaultTimeThreads: "08:45",
      publicationPlatforms: "facebook,instagram,mastodon",
      publicationTimezone: "Europe/Berlin",
      publicBaseUrl: "https://example.org",
      reelSubtitleFontName: "Atkinson Hyperlegible Next",
      reelSubtitleFontsDir: ""
    }
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("persists sessions and discussion messages for generated post content", async () => {
    const calendar = await loadCalendarFromFile(tempCalendarPath)
    await scaffoldPostById(calendar, "post-0001", tempDir)
    const discussJson = vi.fn().mockResolvedValue({
      model: "gpt-5.6",
      rawResponse: { ok: true },
      text: "Der Inhalt ist klar, aber die Ansprache darf direkter werden.",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    })

    const started = await startContentChatSession(
      { contextType: "post", postId: "post-0001" },
      { model: "gpt-5.6" },
      {
        calendar,
        runtimeConfig
      }
    )

    const messaged = await appendDiscussionMessage(
      started.session.id,
      "Bitte schärfe die Kernbotschaft.",
      { model: "gpt-5.6" },
      {
        calendar,
        modelClient: { discussJson, reviseJson: vi.fn() } as JsonChatModelClient,
        runtimeConfig
      }
    )
    const reloaded = await loadContentChatSession(started.session.id, tempDir)

    expect(discussJson).toHaveBeenCalledTimes(1)
    expect(messaged.session.messages).toHaveLength(2)
    expect(reloaded.messages).toHaveLength(2)
    expect(reloaded.messages[0]?.content).toBe("Bitte schärfe die Kernbotschaft.")
    expect(reloaded.messages[1]?.content).toContain("direkter")
  })

  it("stores invalid revisions with validation errors instead of applying them", async () => {
    const calendar = await loadCalendarFromFile(tempCalendarPath)
    await scaffoldPostById(calendar, "post-0001", tempDir)
    const reviseJson = vi.fn().mockResolvedValue({
      model: "gpt-5.6",
      parsedJson: {
        id: "post-0001",
        status: "in Arbeit"
      },
      rawResponse: { invalid: true },
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 }
    })

    const started = await startContentChatSession(
      { contextType: "post", postId: "post-0001" },
      { model: "gpt-5.6" },
      {
        calendar,
        runtimeConfig
      }
    )
    const revised = await requestContentChatRevision(
      started.session.id,
      { model: "gpt-5.6" },
      {
        calendar,
        modelClient: {
          discussJson: vi.fn(),
          reviseJson
        } as JsonChatModelClient,
        runtimeConfig
      }
    )

    expect(reviseJson).toHaveBeenCalledTimes(1)
    expect(revised.session.revisions).toHaveLength(1)
    expect(revised.session.revisions[0]?.validationStatus).toBe("invalid")
    expect(revised.session.revisions[0]?.validationErrors.length).toBeGreaterThan(0)
    expect(revised.session.lastRevisionJson).toBeNull()
  })

  it("applies a valid post revision back to content.json", async () => {
    const calendar = await loadCalendarFromFile(tempCalendarPath)
    const scaffold = await scaffoldPostById(calendar, "post-0001", tempDir)
    const originalContent = await readJsonFile<ContentPackage>(scaffold.outputPath)
    const revisedContent: ContentPackage = {
      ...originalContent,
      editorial_core: {
        ...originalContent.editorial_core,
        title: "Überarbeiteter Titel"
      },
      platforms: {
        ...originalContent.platforms,
        facebook: {
          ...originalContent.platforms.facebook,
          text: "Überarbeiteter Facebook-Text"
        }
      }
    }

    const started = await startContentChatSession(
      { contextType: "post", postId: "post-0001" },
      { model: "gpt-5.6" },
      {
        calendar,
        runtimeConfig
      }
    )
    await requestContentChatRevision(
      started.session.id,
      { model: "gpt-5.6" },
      {
        calendar,
        modelClient: {
          discussJson: vi.fn(),
          reviseJson: vi.fn().mockResolvedValue({
            model: "gpt-5.6",
            parsedJson: revisedContent,
            rawResponse: { valid: true },
            usage: { inputTokens: 22, outputTokens: 18, totalTokens: 40 }
          })
        } as JsonChatModelClient,
        runtimeConfig
      }
    )

    await applyContentChatRevision(started.session.id, {
      calendar,
      runtimeConfig
    })
    const written = await readJsonFile<ContentPackage>(scaffold.outputPath)

    expect(written.editorial_core.title).toBe("Überarbeiteter Titel")
    expect(written.platforms.facebook.text).toBe("Überarbeiteter Facebook-Text")
  })

  it("applies a valid full-plan revision back to the Redaktionsplan file", async () => {
    const calendar = await loadCalendarFromFile(tempCalendarPath)
    const revisedPlan = {
      ...calendar,
      meta: {
        ...calendar.meta,
        titel: "Redaktionskalender 2026/2027 überarbeitet"
      }
    }

    const started = await startContentChatSession(
      { contextType: "plan", planPath: tempCalendarPath },
      { model: "gpt-5.6" },
      {
        calendar,
        runtimeConfig
      }
    )
    await requestContentChatRevision(
      started.session.id,
      { model: "gpt-5.6" },
      {
        calendar,
        modelClient: {
          discussJson: vi.fn(),
          reviseJson: vi.fn().mockResolvedValue({
            model: "gpt-5.6",
            parsedJson: revisedPlan,
            rawResponse: { valid: true },
            usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 }
          })
        } as JsonChatModelClient,
        runtimeConfig
      }
    )

    await applyContentChatRevision(started.session.id, {
      calendar,
      runtimeConfig
    })
    const writtenPlan = await loadCalendarFromFile(tempCalendarPath)

    expect(writtenPlan.meta.titel).toBe("Redaktionskalender 2026/2027 überarbeitet")
  })
})
