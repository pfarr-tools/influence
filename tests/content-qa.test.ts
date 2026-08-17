import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ContentPackage } from "../src/domain/content.js"
import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { CalendarValidationError } from "../src/services/calendar/errors.js"
import { scaffoldPostById } from "../src/services/content/content-scaffolder.js"
import { runQaForPost } from "../src/services/content/content-qa.js"
import {
  readJsonFile,
  writeJsonFile
} from "../src/services/content/content-storage.js"
import { generateImagesForPost } from "../src/services/image/image-generator.js"

const fixturePath = join(
  process.cwd(),
  "content",
  "content-plan.json"
)

describe("content qa", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-qa-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("marks a complete post as ready for approval and moves it to zur Prüfung", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(calendar, tempDir, "post-0001")

    const result = await runQaForPost(calendar, "post-0001", tempDir)
    const written = await readJsonFile<ContentPackage>(contentPath)

    expect(result.readyForApproval).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.statusBeforeRun).toBe("in Arbeit")
    expect(result.statusAfterRun).toBe("zur Prüfung")
    expect(written.status).toBe("zur Prüfung")
    expect(written.qa.approved).toBe(false)
  })

  it("reports blocking QA findings for missing alt text and scripture citation", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeQaReadyContent(calendar, tempDir, "post-0001", {
      platformTextsWithoutCitation: true,
      visual: {
        alt_text: ""
      }
    })

    const result = await runQaForPost(calendar, "post-0001", tempDir)

    expect(result.readyForApproval).toBe(false)
    expect(result.errors).toContain("Alt text is missing.")
    expect(result.errors).toContain(
      "A biblical citation is required but was not found in the public platform copy."
    )
    expect(result.statusAfterRun).toBe("in Arbeit")
  })

  it("blocks downstream image generation until content is freigegeben", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeQaReadyContent(calendar, tempDir, "post-0001")

    await expect(
      generateImagesForPost(
        calendar,
        "post-0001",
        {
          dryRun: true,
          force: false,
          model: "flux-dev",
          outputRoot: tempDir
        },
        {}
      )
    ).rejects.toThrow(CalendarValidationError)
  })

  it.each([
    "Psalm 33,12",
    "Ps 33:12",
    "Johannes 3,16",
    "1. Korinther 13:4"
  ])("recognizes scripture citation %s", async (citation) => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeQaReadyContent(calendar, tempDir, "post-0001", { citation })

    const result = await runQaForPost(calendar, "post-0001", tempDir)

    expect(result.errors).not.toContain(
      "A biblical citation is required but was not found in the public platform copy."
    )
  })

  it.each([
    "A calm still life, without any text or lettering",
    "A calm still life, no text overlay"
  ])("accepts an explicit no-text Flux instruction", async (fluxPrompt) => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeQaReadyContent(calendar, tempDir, "post-0001", {
      visual: { flux_prompt: fluxPrompt }
    })

    const result = await runQaForPost(calendar, "post-0001", tempDir)

    expect(result.errors).not.toContain(
      "Flux prompt appears to ask for text inside the image."
    )
  })
})

async function writeQaReadyContent(
  calendar: Awaited<ReturnType<typeof loadCalendarFromFile>>,
  outputRoot: string,
  postId: string,
  overrides?: {
    platformTextsWithoutCitation?: boolean
    citation?: string
    visual?: Partial<ContentPackage["visual"]>
  }
): Promise<string> {
  const scaffold = await scaffoldPostById(calendar, postId, outputRoot)
  const content = await readJsonFile<ContentPackage>(scaffold.outputPath)
  const citation = overrides?.platformTextsWithoutCitation
    ? ""
    : ` (${overrides?.citation ?? "Ps 33,12"})`

  await writeJsonFile(scaffold.outputPath, {
    ...content,
    editorial_core: {
      ...content.editorial_core,
      title: "Fünf Minuten Aufmerksamkeit",
      main_message: "Schenke heute einem Menschen bewusst Zeit."
    },
    platforms: {
      facebook: {
        headline: "Eine kleine Übung für diese Woche",
        text: `Wohl dem Volk, dessen Gott der HERR ist${citation}`
      },
      instagram: {
        caption: `Wohl dem Volk, dessen Gott der HERR ist${citation}`,
        carousel: [
          {
            type: "quote",
            text: `Wohl dem Volk, dessen Gott der HERR ist${citation}`
          }
        ]
      },
      mastodon: {
        text: `Wohl dem Volk, dessen Gott der HERR ist${citation}`
      },
      story: {
        slides: [{ text: `Wohl dem Volk, dessen Gott der HERR ist${citation}` }]
      },
      reel: {
        hook: "Wochenspruch für diese Woche",
        script: `Wohl dem Volk, dessen Gott der HERR ist${citation}`,
        shots: ["Tisch mit zwei Tassen"],
        duration_seconds: 20
      }
    },
    visual: {
      ...content.visual,
      concept: "Zwei Menschen hören einander aufmerksam zu",
      flux_prompt:
        "Documentary still life, two ceramic cups on a wooden table, soft morning light, no text, no letters, no typography, no logo, no watermark",
      alt_text: "Zwei Tassen auf einem Holztisch im Morgenlicht",
      ...overrides?.visual
    }
  })

  return scaffold.outputPath
}
