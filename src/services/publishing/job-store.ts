import { randomUUID } from "node:crypto"
import { join } from "node:path"

import { pathExists, readJsonFile, writeJsonFile } from "../content/content-storage.js"
import type { PublicationJob, PublicationPlatform, PublicationStatus } from "./types.js"

const fileName = "publication-jobs.json"
const publishedFileName = "published.json"

/** File-backed store for publication jobs and their audit information. */
export class PublicationJobStore {
  readonly path: string
  private readonly outputRoot: string

  constructor(outputRoot: string) {
    this.outputRoot = outputRoot
    this.path = join(outputRoot, fileName)
  }

  async list(): Promise<PublicationJob[]> {
    try {
      const jobs = await readJsonFile<PublicationJob[]>(this.path)
      const published = jobs.filter((job) => job.status === "published")
      if (published.length === 0) return jobs

      for (const job of published) await this.archive(job)
      const activeJobs = jobs.filter((job) => job.status !== "published")
      await writeJsonFile(this.path, activeJobs)
      return activeJobs
    } catch {
      return []
    }
  }

  /** Returns active and archived jobs belonging to one post. */
  async listForPost(postId: string, contentDate: string): Promise<PublicationJob[]> {
    const activeJobs = (await this.list()).filter((job) => job.postId === postId)
    const path = join(this.outputRoot, contentDate, postId, publishedFileName)
    let archivedJobs: PublicationJob[] = []
    try {
      archivedJobs = await readJsonFile<PublicationJob[]>(path)
    } catch {
      // The post may not have completed a publication yet.
    }
    return [...activeJobs, ...archivedJobs]
  }

  async get(id: string): Promise<PublicationJob | undefined> {
    return (await this.list()).find((job) => job.id === id)
  }

  async save(job: PublicationJob): Promise<PublicationJob> {
    const jobs = await this.list()
    const index = jobs.findIndex((item) => item.id === job.id)
    if (job.status === "published") {
      await this.archive(job)
      if (index !== -1) jobs.splice(index, 1)
    } else if (index === -1) jobs.push(job)
    else jobs[index] = job
    await writeJsonFile(this.path, jobs)
    return job
  }

  async remove(id: string): Promise<void> {
    const jobs = await this.list()
    const remainingJobs = jobs.filter((job) => job.id !== id)
    if (remainingJobs.length !== jobs.length) await writeJsonFile(this.path, remainingJobs)
  }

  /** Moves a completed job from the queue into the post-local publication history. */
  async archive(job: PublicationJob): Promise<void> {
    const path = join(this.outputRootForJob(job), publishedFileName)
    const archived = (await pathExists(path))
      ? await readJsonFile<PublicationJob[]>(path)
      : []
    const index = archived.findIndex((item) => item.id === job.id)
    if (index === -1) archived.push(job)
    else archived[index] = job
    await writeJsonFile(path, archived)
  }

  private outputRootForJob(job: PublicationJob): string {
    return join(this.outputRoot, job.contentDate, job.postId)
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
