import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ContentPackage } from "../src/domain/content.js"
import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { scaffoldPostById } from "../src/services/content/content-scaffolder.js"
import {
  readJsonFile,
  writeJsonFile
} from "../src/services/content/content-storage.js"
import { renderReelById } from "../src/services/render/index.js"

const fixturePath = join(
  process.cwd(),
  "content",
  "content-plan.json"
)

describe("reel renderer", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-reel-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("renders a reel from shot images and writes subtitles plus summary", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeReelReadyContent(calendar, tempDir, {
      durationSeconds: 12,
      script:
        "Du musst nicht alles tragen. Gott sieht dich. Geh mit einem ruhigen Herzen in den Tag.",
      shots: ["Fensterlicht", "Kerze", "Bibel"]
    })

    const audioPath = join(tempDir, "track.mp3")
    await writeFile(audioPath, "mock-audio", "utf8")
    const ffmpegCalls: Array<{ args: string[]; binary: string }> = []

    const result = await renderReelById(
      calendar,
      "post-0001",
      {
        audioPath,
        ffmpegBinary: "ffmpeg-test",
        force: false,
        outputRoot: tempDir,
        subtitleFontName: "Atkinson Hyperlegible Next"
      },
      {
        ffmpegRunner: {
          async run(request): Promise<void> {
            ffmpegCalls.push(request)
            await writeFile(
              join(tempDir, "2026-08-10", "post-0001", "reel", "reel-1080x1920.mp4"),
              "mock-video",
              "utf8"
            )
          }
        },
        now: () => new Date("2026-08-05T12:00:00.000Z")
      }
    )

    const subtitles = await readFile(result.subtitlePath, "utf8")
    const summary = await readJsonFile<{
      audio_path: string | null
      duration_seconds: number
      generated_at: string
      segments: Array<{ image_path: string; segment_index: number }>
      subtitle_font_name: string | null
      subtitle_path: string
      video_path: string
    }>(result.summaryPath)

    expect(ffmpegCalls).toHaveLength(1)
    expect(ffmpegCalls[0]?.binary).toBe("ffmpeg-test")
    expect(ffmpegCalls[0]?.args).toContain(audioPath)
    expect(ffmpegCalls[0]?.args.join(" ")).toContain("subtitles=")
    expect(ffmpegCalls[0]?.args.join(" ")).toContain("FontName=Atkinson Hyperlegible Next")
    expect(subtitles).toContain("00:00:00,000 --> 00:00:04,000")
    expect(subtitles).toContain("Du musst nicht alles tragen.")
    expect(summary.generated_at).toBe("2026-08-05T12:00:00.000Z")
    expect(summary.audio_path).toBe("../../track.mp3")
    expect(summary.duration_seconds).toBe(12)
    expect(summary.subtitle_font_name).toBe("Atkinson Hyperlegible Next")
    expect(summary.video_path).toBe("reel/reel-1080x1920.mp4")
    expect(summary.subtitle_path).toBe("reel/reel-subtitles.srt")
    expect(summary.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          image_path: "assets/reel-shot-01.webp",
          segment_index: 1
        }),
        expect.objectContaining({
          image_path: "assets/reel-shot-02.webp",
          segment_index: 2
        }),
        expect.objectContaining({
          image_path: "assets/reel-shot-03.webp",
          segment_index: 3
        })
      ])
    )
  })

  it("falls back to the shared 9x16 background when no shot images exist", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeReelReadyContent(calendar, tempDir, {
      durationSeconds: 9,
      shots: ["Fensterlicht"],
      writeShotImages: false
    })

    const result = await renderReelById(
      calendar,
      "post-0001",
      {
        ffmpegBinary: "ffmpeg-test",
        force: false,
        outputRoot: tempDir
      },
      {
        ffmpegRunner: {
          async run(): Promise<void> {
            await mkdir(join(tempDir, "2026-08-10", "post-0001", "reel"), {
              recursive: true
            })
            await writeFile(
              join(tempDir, "2026-08-10", "post-0001", "reel", "reel-1080x1920.mp4"),
              "mock-video",
              "utf8"
            )
          }
        }
      }
    )

    expect(result.segments.every((segment) => segment.imagePath ===
      join(tempDir, "2026-08-10", "post-0001", "assets", "background-9x16.webp")
    )).toBe(true)
  })

  it("reuses a stored reel audio asset when no explicit audio path is provided", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeReelReadyContent(calendar, tempDir, {
      durationSeconds: 9,
      shots: ["Fensterlicht"]
    })

    const audioAssetPath = join(
      tempDir,
      "2026-08-10",
      "post-0001",
      "assets",
      "reel-audio.mp3"
    )
    await writeFile(audioAssetPath, "stored-audio", "utf8")

    const contentPath = join(tempDir, "2026-08-10", "post-0001", "content.json")
    const content = await readJsonFile<ContentPackage>(contentPath)

    await writeJsonFile(contentPath, {
      ...content,
      metadata: {
        ...content.metadata,
        assets: Array.from(new Set([...content.metadata.assets, "assets/reel-audio.mp3"]))
      }
    })

    const ffmpegCalls: Array<{ args: string[]; binary: string }> = []

    await renderReelById(
      calendar,
      "post-0001",
      {
        ffmpegBinary: "ffmpeg-test",
        force: false,
        outputRoot: tempDir,
        subtitleFontName: "Atkinson Hyperlegible Next"
      },
      {
        ffmpegRunner: {
          async run(request): Promise<void> {
            ffmpegCalls.push(request)
            await mkdir(join(tempDir, "2026-08-10", "post-0001", "reel"), {
              recursive: true
            })
            await writeFile(
              join(tempDir, "2026-08-10", "post-0001", "reel", "reel-1080x1920.mp4"),
              "mock-video",
              "utf8"
            )
          }
        }
      }
    )

    expect(ffmpegCalls[0]?.args).toContain(audioAssetPath)
  })
})

async function writeReelReadyContent(
  calendar: Awaited<ReturnType<typeof loadCalendarFromFile>>,
  outputRoot: string,
  overrides?: {
    durationSeconds?: number
    script?: string
    shots?: string[]
    writeShotImages?: boolean
  }
): Promise<void> {
  const scaffold = await scaffoldPostById(calendar, "post-0001", outputRoot)
  const content = await readJsonFile<ContentPackage>(scaffold.outputPath)
  const baseDir = join(outputRoot, "2026-08-10", "post-0001")
  const assetsDir = join(baseDir, "assets")

  await mkdir(assetsDir, { recursive: true })
  await writeFile(join(assetsDir, "background-9x16.webp"), "bg", "utf8")

  if (overrides?.writeShotImages !== false) {
    for (const [index] of (overrides?.shots ?? ["Fensterlicht", "Kerze"]).entries()) {
      await writeFile(
        join(assetsDir, `reel-shot-${String(index + 1).padStart(2, "0")}.webp`),
        `shot-${index + 1}`,
        "utf8"
      )
    }
  }

  await writeJsonFile(scaffold.outputPath, {
    ...content,
    status: "freigegeben",
    platforms: {
      ...content.platforms,
      reel: {
        ...content.platforms.reel,
        duration_seconds: overrides?.durationSeconds ?? 10,
        script:
          overrides?.script ??
          "Du musst nicht alles tragen. Gott sieht dich. Geh mit einem ruhigen Herzen in den Tag.",
        shots: overrides?.shots ?? ["Fensterlicht", "Kerze"]
      }
    },
    visual: {
      ...content.visual,
      flux_prompt:
        "Quiet chapel interior, morning light, contemplative atmosphere, no text, no letters, no typography, no logo, no watermark",
      negative_prompt: "text, letters, logo, watermark"
    }
  })
}
