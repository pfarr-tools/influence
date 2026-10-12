import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { writeJsonFile } from "../src/services/content/content-storage.js"
import { shortenScheduledSocialText } from "../src/services/publishing/shorten-social-text.js"
import type { PublicationJob } from "../src/services/publishing/types.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("shortenScheduledSocialText", () => {
  it("shortens only scheduled Threads and Bluesky jobs", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "influence-short-social-text-"))
    temporaryDirectories.push(outputRoot)
    const longText = "x".repeat(301)
    const jobs: PublicationJob[] = [
      createJob("threads", longText),
      createJob("bluesky", longText),
      createJob("facebook", longText),
      { ...createJob("threads", longText), status: "approved" }
    ]
    await writeJsonFile(join(outputRoot, "publication-jobs.json"), jobs)

    const result = await shortenScheduledSocialText(outputRoot)
    const saved = JSON.parse(await readFile(join(outputRoot, "publication-jobs.json"), "utf8")) as PublicationJob[]

    expect(result).toEqual({ updated: 2, skipped: 2 })
    expect(saved[0]?.text).toBe("x".repeat(297) + "...")
    expect(saved[1]?.text).toBe("x".repeat(297) + "...")
    expect(saved[2]?.text).toBe(longText)
    expect(saved[3]?.text).toBe(longText)
  })
})

function createJob(platform: PublicationJob["platform"], text: string): PublicationJob {
  return {
    id: `${platform}-1`, postId: "post-1", contentDate: "2026-08-10", platform, format: "default",
    scheduledAt: "2026-08-10T08:00:00.000Z", timezone: "Europe/Berlin", status: "scheduled",
    attemptCount: 0, remoteId: null, remoteUrl: null, lastError: null,
    createdAt: "2026-08-09T08:00:00.000Z", updatedAt: "2026-08-09T08:00:00.000Z",
    text, assets: [], altTexts: [], responseMetadata: null, retryHistory: []
  }
}
