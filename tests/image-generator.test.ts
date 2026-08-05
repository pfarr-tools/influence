import { readFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import {
  generateImagesForPost
} from "../src/services/image/image-generator.js"
import { scaffoldPostById } from "../src/services/content/content-scaffolder.js"
import {
  readJsonFile,
  writeJsonFile
} from "../src/services/content/content-storage.js"
import type {
  ImageModelClient,
  ImageModelRequest,
  ImageModelResponse
} from "../src/services/image/flux-client.js"

const fixturePath = join(
  process.cwd(),
  "data",
  "redaktionskalender-2026-2027.json"
)

describe("image generator", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-image-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("returns dry-run requests without calling the image client", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeImageReadyContent(calendar, tempDir)
    let called = false

    const result = await generateImagesForPost(
      calendar,
      "post-0001",
      {
        dryRun: true,
        force: false,
        model: "flux-dev",
        outputRoot: tempDir,
        seed: 77
      },
      {
        imageClient: createMockImageClient({
          onCall: () => {
            called = true
          }
        })
      }
    )

    expect(called).toBe(false)
    expect(result.dryRunRequests).toHaveLength(3)
    expect(result.dryRunRequests?.[0]?.model).toBe("flux-dev")
    expect(result.dryRunRequests?.[0]?.seed).toBe(77)
    expect(result.dryRunRequests?.every((request) => request.prompt.includes("no text"))).toBe(
      true
    )
  })

  it("writes assets, raw responses, and content asset references on success", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeImageReadyContent(calendar, tempDir)

    const result = await generateImagesForPost(
      calendar,
      "post-0001",
      {
        dryRun: false,
        force: false,
        model: "flux-dev",
        outputRoot: tempDir,
        seed: 42
      },
      {
        imageClient: createMockImageClient()
      }
    )

    const assetBuffer = await readFile(
      join(tempDir, "2026-08-10", "post-0001", "assets", "background-4x5.webp")
    )
    const summary = await readJsonFile<{
      jobs: Array<{ aspectRatio: string; status: string }>
      model: string
      post_id: string
    }>(result.summaryPath)
    const updatedContent = await readJsonFile<{
      metadata: { assets: string[] }
    }>(result.contentPath)
    const rawResponse = await readJsonFile<{ data: Array<{ b64_json: string }> }>(
      join(tempDir, "2026-08-10", "post-0001", "raw-flux-response-4x5.json")
    )

    expect(assetBuffer.length).toBeGreaterThan(0)
    expect(summary.post_id).toBe("post-0001")
    expect(summary.model).toBe("flux-dev")
    expect(summary.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ aspectRatio: "4:5", status: "succeeded" }),
        expect.objectContaining({ aspectRatio: "9:16", status: "succeeded" }),
        expect.objectContaining({ aspectRatio: "1.91:1", status: "succeeded" })
      ])
    )
    expect(updatedContent.metadata.assets).toEqual(
      expect.arrayContaining([
        "assets/background-4x5.webp",
        "assets/background-9x16.webp",
        "assets/background-1.91x1.webp"
      ])
    )
    expect(rawResponse.data[0]?.b64_json).toBeDefined()
  })

  it("persists failed jobs with status and error message", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeImageReadyContent(calendar, tempDir)

    const result = await generateImagesForPost(
      calendar,
      "post-0001",
      {
        dryRun: false,
        force: false,
        model: "flux-dev",
        outputRoot: tempDir
      },
      {
        imageClient: createMockImageClient({
          failingAspectRatio: "9:16"
        }),
        now: () => new Date("2026-08-05T12:00:00.000Z")
      }
    )

    const summary = await readJsonFile<{
      generated_at: string
      jobs: Array<{ aspectRatio: string; error?: string; status: string }>
    }>(result.summaryPath)
    const failedRawResponse = await readJsonFile<{ error: string; status: string }>(
      join(tempDir, "2026-08-10", "post-0001", "raw-flux-response-9x16.json")
    )

    expect(summary.generated_at).toBe("2026-08-05T12:00:00.000Z")
    expect(summary.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aspectRatio: "9:16",
          error: "simulated provider error",
          status: "failed"
        })
      ])
    )
    expect(failedRawResponse).toEqual({
      error: "simulated provider error",
      status: "failed"
    })
  })
})

function createMockImageClient(options?: {
  failingAspectRatio?: string
  onCall?: (request: ImageModelRequest) => void
}): ImageModelClient {
  return {
    async generateImage(request: ImageModelRequest): Promise<ImageModelResponse> {
      options?.onCall?.(request)

      if (request.aspectRatio === options?.failingAspectRatio) {
        throw new Error("simulated provider error")
      }

      return {
        imageBase64: Buffer.from(`image:${request.aspectRatio}`).toString("base64"),
        mimeType: "image/webp",
        rawResponse: {
          data: [
            {
              b64_json: Buffer.from(`image:${request.aspectRatio}`).toString("base64")
            }
          ],
          seed: request.seed ?? 123
        },
        seed: request.seed ?? 123
      }
    }
  }
}

async function writeImageReadyContent(
  calendar: Awaited<ReturnType<typeof loadCalendarFromFile>>,
  outputRoot: string
): Promise<void> {
  const scaffold = await scaffoldPostById(calendar, "post-0001", outputRoot)
  const content = await readJsonFile<{
    visual: { flux_prompt: string; negative_prompt: string }
  }>(scaffold.outputPath)

  await writeJsonFile(scaffold.outputPath, {
    ...content,
    status: "freigegeben",
    visual: {
      ...content.visual,
      flux_prompt:
        "Documentary still life of two ceramic cups on a wooden table, soft morning light, generous negative space, no text, no letters, no typography, no logo, no watermark",
      negative_prompt: "text, letters, logo, watermark"
    }
  })
}
