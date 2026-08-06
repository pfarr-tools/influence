import { randomUUID } from "node:crypto"
import { join } from "node:path"

import { readJsonFile, writeJsonFile } from "../content/content-storage.js"
import type { PublicationJob, PublicationPlatform, PublicationStatus } from "./types.js"

const fileName = "publication-jobs.json"

/** File-backed store for publication jobs and their audit information. */
export class PublicationJobStore {
  readonly path: string

  constructor(outputRoot: string) {
    this.path = join(outputRoot, fileName)
  }

  async list(): Promise<PublicationJob[]> {
    try {
      return await readJsonFile<PublicationJob[]>(this.path)
    } catch {
      return []
    }
  }

  async get(id: string): Promise<PublicationJob | undefined> {
    return (await this.list()).find((job) => job.id === id)
  }

  async save(job: PublicationJob): Promise<PublicationJob> {
    const jobs = await this.list()
    const index = jobs.findIndex((item) => item.id === job.id)
    if (index === -1) jobs.push(job)
    else jobs[index] = job
    await writeJsonFile(this.path, jobs)
    return job
  }

  async create(input: CreatePublicationJobInput): Promise<PublicationJob> {
    const now = new Date().toISOString()
    return this.save({
      ...input,
      id: randomUUID(),
      attemptCount: 0,
      remoteId: null,
      remoteUrl: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      responseMetadata: null,
      retryHistory: []
    })
  }
}

export interface CreatePublicationJobInput {
  postId: string
  contentDate: string
  platform: PublicationPlatform
  format: string
  scheduledAt: string | null
  timezone: string
  status: PublicationStatus
  text: string
  assets: string[]
  altTexts: string[]
}
