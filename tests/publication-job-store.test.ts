import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readJsonFile, writeJsonFile } from "../src/services/content/content-storage.js"
import { PublicationJobStore } from "../src/services/publishing/job-store.js"
import type { PublicationJob } from "../src/services/publishing/types.js"

describe("PublicationJobStore", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "publication-job-store-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("moves published jobs into the post-local history", async () => {
    const store = new PublicationJobStore(tempDir)
    const job = createJob()

    await store.save(job)
    await store.save({ ...job, status: "published", remoteId: "remote-1" })

    expect(await store.list()).toEqual([])
    expect(await readJsonFile<PublicationJob[]>(join(tempDir, "2026-08-10", "post-0001", "published.json"))).toEqual([
      { ...job, status: "published", remoteId: "remote-1" }
    ])
    expect(await store.listForPost(job.postId, job.contentDate)).toHaveLength(1)
  })

  it("migrates published jobs left in the queue", async () => {
    const store = new PublicationJobStore(tempDir)
    const job = createJob()
    await writeJsonFile(join(tempDir, "publication-jobs.json"), [{ ...job, status: "published" }])

    expect(await store.list()).toEqual([])
    expect(await store.listForPost(job.postId, job.contentDate)).toEqual([{ ...job, status: "published" }])
  })
})

function createJob(): PublicationJob {
  return {
    id: "job-1",
    postId: "post-0001",
    contentDate: "2026-08-10",
    platform: "mastodon",
    format: "default",
    scheduledAt: null,
    timezone: "Europe/Berlin",
    status: "approved",
    attemptCount: 0,
    remoteId: null,
    remoteUrl: null,
    lastError: null,
    createdAt: "2026-08-10T08:00:00.000Z",
    updatedAt: "2026-08-10T08:00:00.000Z",
    text: "Text",
    assets: [],
    altTexts: [],
    responseMetadata: null,
    retryHistory: []
  }
}
