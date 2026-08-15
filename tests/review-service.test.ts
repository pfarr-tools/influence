import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ContentPackage } from "../src/domain/content.js"
import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { CalendarValidationError } from "../src/services/calendar/errors.js"
import { scaffoldPostById } from "../src/services/content/content-scaffolder.js"
import { runQaForPost } from "../src/services/content/content-qa.js"
import {
  readJsonFile,
  writeJsonFile
} from "../src/services/content/content-storage.js"
import {
  approveReviewPost,
  approveReviewPostForPublication,
  exportReviewPost,
  regenerateReviewPost,
  storeReviewAsset,
  storeReviewReelAudioAsset,
  updateReviewPost
} from "../src/services/review/index.js"

const fixturePath = join(
  process.cwd(),
  "content",
  "content-plan.json"
)

describe("review service", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-review-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("resets approval and moves edited content back to in Arbeit", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(
      calendar,
      tempDir,
      "post-0001"
    )
    await runQaForPost(calendar, "post-0001", tempDir)
    await approveReviewPost(calendar, "post-0001", tempDir)

    const updated = await updateReviewPost(calendar, "post-0001", tempDir, {
      altText: "Neuer Alt-Text",
      audience: "Familien und Ehrenamtliche",
      concept: "Nahes Portraet einer offenen Kirchentuer",
      facebookHeadline: "Neue Headline",
      facebookText: "Neuer Facebook-Text",
      fluxPrompt: "Soft daylight, church doorway, no text, no letters",
      instagramCaption: "Neue Caption",
      instagramCarousel: [
        { type: "title", text: "Neue Karussell-Überschrift" },
        { type: "content", text: "Neue Karussellkarte" }
      ],
      mainMessage: "Neue Kernbotschaft",
      mastodonText: "Neuer Mastodon-Text",
      blueskyText: "Neuer Bluesky-Text",
      reelHook: "Neuer Hook",
      reelScript: "Neues Reel-Skript",
      storySlides: ["Slide eins", "Slide zwei"],
      title: "Neuer Titel"
    })
    const written = await readJsonFile<ContentPackage>(contentPath)

    expect(updated.status).toBe("in Arbeit")
    expect(written.qa.approved).toBe(false)
    expect(written.platforms.story.slides).toEqual([
      { text: "Slide eins" },
      { text: "Slide zwei" }
    ])
    expect(written.platforms.instagram.carousel).toEqual([
      { type: "title", text: "Neue Karussell-Überschrift" },
      { type: "content", text: "Neue Karussellkarte" }
    ])
    expect(written.editorial_core.title).toBe("Neuer Titel")
    expect(written.platforms.bluesky.text).toBe("Neuer Bluesky-Text")
  })

  it("approves only QA-ready posts", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(
      calendar,
      tempDir,
      "post-0001"
    )

    await expect(
      approveReviewPost(calendar, "post-0001", tempDir)
    ).rejects.toThrow(CalendarValidationError)

    await runQaForPost(calendar, "post-0001", tempDir)
    await approveReviewPost(calendar, "post-0001", tempDir)
    const written = await readJsonFile<ContentPackage>(contentPath)

    expect(written.status).toBe("freigegeben")
    expect(written.qa.approved).toBe(true)
  })

  it("allows forced QA approval while retaining QA errors", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(calendar, tempDir, "post-0001", {
      altText: ""
    })

    const qa = await runQaForPost(calendar, "post-0001", tempDir)
    expect(qa.readyForApproval).toBe(false)

    await approveReviewPost(calendar, "post-0001", tempDir, { force: true })

    const written = await readJsonFile<ContentPackage>(contentPath)
    const qaResults = await readJsonFile<{ errors: string[] }>(
      join(tempDir, "2026-08-10", "post-0001", "qa-results.json")
    )
    expect(written.status).toBe("freigegeben")
    expect(written.qa.approved).toBe(true)
    expect(qaResults.errors.length).toBeGreaterThan(0)
  })

  it("plans publication jobs automatically on publication approval", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeQaReadyContent(calendar, tempDir, "post-0001")
    await runQaForPost(calendar, "post-0001", tempDir)
    await approveReviewPost(calendar, "post-0001", tempDir)

    await approveReviewPostForPublication(calendar, "post-0001", tempDir, {
      calendarPath: fixturePath,
      ffmpegBinary: "ffmpeg",
      fluxApiBaseUrl: "",
      fluxApiGeneratePath: "/v1",
      fluxApiKey: "",
      fluxModel: "flux",
      openAiApiKey: "",
      openAiModel: "gpt-5.6",
      outputDir: tempDir,
      publicationDefaultTime: "07:00",
      publicationPlatforms: "facebook,instagram,mastodon",
      publicationTimezone: "Europe/Berlin",
      publicBaseUrl: "https://example.org",
      reelSubtitleFontName: "Atkinson Hyperlegible Next",
      reelSubtitleFontsDir: ""
    })

    const jobs = await readJsonFile<Array<{ platform: string; scheduledAt: string | null }>>(
      join(tempDir, "publication-jobs.json")
    )

    expect(jobs.map((job) => job.platform)).toEqual([
      "facebook",
      "instagram",
      "mastodon"
    ])
    expect(jobs.every((job) => typeof job.scheduledAt === "string")).toBe(true)
  })

  it("allows forced publication approval for content not marked approved", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeQaReadyContent(calendar, tempDir, "post-0001")

    await approveReviewPostForPublication(calendar, "post-0001", tempDir, undefined, {
      force: true
    })

    const approval = await readJsonFile<{ approved: boolean }>(
      join(tempDir, "2026-08-10", "post-0001", "publication-approval.json")
    )
    expect(approval.approved).toBe(true)
  })

  it("writes a downloadable review export manifest", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeQaReadyContent(calendar, tempDir, "post-0001", {
      metadataAssets: ["assets/background-4x5.webp"]
    })
    await writeJsonFile(
      join(tempDir, "2026-08-10", "post-0001", "render-results.json"),
      {
        renders: [{ image_path: "render-instagram-feed-01.png" }],
        warnings: []
      }
    )

    const result = await exportReviewPost(calendar, "post-0001", tempDir)
    const exportJson = JSON.parse(
      await readFile(result.exportPath, "utf8")
    ) as {
      rendered_files: string[]
      visual_assets: string[]
    }

    expect(result.fileName).toBe("post-0001-review-export.json")
    expect(exportJson.visual_assets).toContain(
      "2026-08-10/post-0001/assets/background-4x5.webp"
    )
    expect(exportJson.rendered_files).toContain(
      "2026-08-10/post-0001/render-instagram-feed-01.png"
    )
  })

  it("regenerates through the injected generator and forces overwrite", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const generateContent = vi.fn().mockResolvedValue({
      contentPath: join(tempDir, "2026-08-10", "post-0001", "content.json"),
      postId: "post-0001",
      rawResponsePath: join(
        tempDir,
        "2026-08-10",
        "post-0001",
        "raw-openai-response.json"
      )
    })

    await regenerateReviewPost(
      calendar,
      "post-0001",
      {
        dryRun: false,
        force: false,
        language: "de",
        model: "gpt-5.6",
        outputRoot: tempDir
      },
      { generateContent }
    )

    expect(generateContent).toHaveBeenCalledWith(
      calendar,
      "post-0001",
      expect.objectContaining({ force: true, outputRoot: tempDir }),
      expect.any(Object)
    )
  })

  it("stores uploaded reel audio as a reusable post asset", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(
      calendar,
      tempDir,
      "post-0001"
    )

    const storedPath = await storeReviewReelAudioAsset(
      calendar,
      "post-0001",
      tempDir,
      {
        buffer: Buffer.from("audio-bytes"),
        fileName: "voiceover.mp3",
        mimeType: "audio/mpeg"
      }
    )

    const written = await readJsonFile<ContentPackage>(contentPath)
    const audioBuffer = await readFile(storedPath, "utf8")

    expect(storedPath).toBe(
      join(tempDir, "2026-08-10", "post-0001", "assets", "reel-audio.mp3")
    )
    expect(audioBuffer).toBe("audio-bytes")
    expect(written.metadata.assets).toContain("assets/reel-audio.mp3")
  })

  it("stores browser-recorded reel audio with a webm extension", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(
      calendar,
      tempDir,
      "post-0001"
    )

    const storedPath = await storeReviewReelAudioAsset(
      calendar,
      "post-0001",
      tempDir,
      {
        buffer: Buffer.from("webm-audio"),
        fileName: "voiceover-recording.webm",
        mimeType: "audio/webm"
      }
    )

    const written = await readJsonFile<ContentPackage>(contentPath)
    const audioBuffer = await readFile(storedPath, "utf8")

    expect(storedPath).toBe(
      join(tempDir, "2026-08-10", "post-0001", "assets", "reel-audio.webm")
    )
    expect(audioBuffer).toBe("webm-audio")
    expect(written.metadata.assets).toContain("assets/reel-audio.webm")
  })

  it("stores uploaded background assets under canonical filenames", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(
      calendar,
      tempDir,
      "post-0001"
    )

    const storedPath = await storeReviewAsset(calendar, "post-0001", tempDir, {
      assetKind: "background-4x5",
      file: {
        buffer: Buffer.from("image-bytes"),
        fileName: "manual-upload.webp",
        mimeType: "image/webp"
      }
    })

    const written = await readJsonFile<ContentPackage>(contentPath)
    const imageBuffer = await readFile(storedPath, "utf8")

    expect(storedPath).toBe(
      join(tempDir, "2026-08-10", "post-0001", "assets", "background-4x5.webp")
    )
    expect(imageBuffer).toBe("image-bytes")
    expect(written.metadata.assets).toContain("assets/background-4x5.webp")
  })

  it("stores reel shots at the selected 1-based index", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(
      calendar,
      tempDir,
      "post-0001"
    )

    const storedPath = await storeReviewAsset(calendar, "post-0001", tempDir, {
      assetKind: "reel-shot",
      file: {
        buffer: Buffer.from("shot-image"),
        fileName: "shot.webp",
        mimeType: "image/webp"
      },
      reelShotIndex: 2
    })

    const written = await readJsonFile<ContentPackage>(contentPath)
    const imageBuffer = await readFile(storedPath, "utf8")

    expect(storedPath).toBe(
      join(tempDir, "2026-08-10", "post-0001", "assets", "reel-shot-02.webp")
    )
    expect(imageBuffer).toBe("shot-image")
    expect(written.metadata.assets).toContain("assets/reel-shot-02.webp")
  })

  it("replaces older reel audio metadata entries when the extension changes", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const contentPath = await writeQaReadyContent(
      calendar,
      tempDir,
      "post-0001",
      {
        metadataAssets: ["assets/reel-audio.mp3"]
      }
    )

    const storedPath = await storeReviewAsset(calendar, "post-0001", tempDir, {
      assetKind: "reel-audio",
      file: {
        buffer: Buffer.from("new-audio"),
        fileName: "voiceover-recording.webm",
        mimeType: "audio/webm"
      }
    })

    const written = await readJsonFile<ContentPackage>(contentPath)

    expect(storedPath).toBe(
      join(tempDir, "2026-08-10", "post-0001", "assets", "reel-audio.webm")
    )
    expect(written.metadata.assets).toContain("assets/reel-audio.webm")
    expect(written.metadata.assets).not.toContain("assets/reel-audio.mp3")
  })
})

async function writeQaReadyContent(
  calendar: Awaited<ReturnType<typeof loadCalendarFromFile>>,
  outputRoot: string,
  postId: string,
  overrides?: {
    altText?: string
    metadataAssets?: string[]
  }
): Promise<string> {
  const scaffold = await scaffoldPostById(calendar, postId, outputRoot)
  const content = await readJsonFile<ContentPackage>(scaffold.outputPath)

  await writeJsonFile(scaffold.outputPath, {
    ...content,
    editorial_core: {
      ...content.editorial_core,
      title: "Fünf Minuten Aufmerksamkeit",
      main_message: "Schenke heute einem Menschen bewusst Zeit."
    },
    metadata: {
      ...content.metadata,
      assets: overrides?.metadataAssets ?? content.metadata.assets
    },
    platforms: {
      facebook: {
        headline: "Eine kleine Übung für diese Woche",
        text: "Wohl dem Volk, dessen Gott der HERR ist (Ps 33,12)"
      },
      instagram: {
        caption: "Wohl dem Volk, dessen Gott der HERR ist (Ps 33,12)",
        carousel: [
          {
            type: "quote",
            text: "Wohl dem Volk, dessen Gott der HERR ist (Ps 33,12)"
          }
        ]
      },
      mastodon: {
        text: "Wohl dem Volk, dessen Gott der HERR ist (Ps 33,12)"
      },
      story: {
        slides: [{ text: "Wohl dem Volk, dessen Gott der HERR ist (Ps 33,12)" }]
      },
      reel: {
        hook: "Wochenspruch für diese Woche",
        script: "Wohl dem Volk, dessen Gott der HERR ist (Ps 33,12)",
        shots: ["Tisch mit zwei Tassen"],
        duration_seconds: 20
      }
    },
    visual: {
      ...content.visual,
      concept: "Zwei Menschen hoeren einander aufmerksam zu",
      flux_prompt:
        "Documentary still life, two ceramic cups on a wooden table, soft morning light, no text, no letters, no typography, no logo, no watermark",
      alt_text:
        overrides?.altText ?? "Zwei Tassen auf einem Holztisch im Morgenlicht"
    }
  })

  return scaffold.outputPath
}
