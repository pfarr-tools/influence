import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import { resolve } from "node:path"
import { getPostById } from "../calendar/calendar-service.js"
import { assertContentApproved, getContentOutputPaths, isPublicationApproved, pathExists, readContentPackage, readJsonFile } from "../content/content-storage.js"
import { PublicationJobStore } from "./job-store.js"
import type { PublicationAdapter, PublicationJob, PublicationPlatform } from "./types.js"

/** Creates or schedules approved jobs and executes them idempotently. */
export class PublishingService {
  constructor(private readonly outputRoot: string, private readonly adapters: Map<PublicationPlatform, PublicationAdapter>, private readonly store = new PublicationJobStore(outputRoot)) {}

  async schedulePost(
    calendar: Calendar,
    postId: string,
    platform: PublicationPlatform,
    at: string | null,
    format = "default",
    timezone = "Europe/Berlin"
  ): Promise<PublicationJob> {
    const post = getPostById(calendar, postId)
    const contentPaths = getContentOutputPaths(this.outputRoot, post)
    const content = await readContentPackage(contentPaths.contentPath)
    assertContentApproved(content, contentPaths.contentPath)
    if (!(await isPublicationApproved(contentPaths.publicationApprovalPath))) {
      throw new Error("Die Veröffentlichung ist für diesen Beitrag noch nicht ausdrücklich freigegeben.")
    }
    const existing = (await this.store.list()).find((job) => job.postId === postId && job.platform === platform && job.format === format && job.status !== "failed")
    if (existing) return existing
    const text = getPlatformText(content, platform)
    const assets = await resolvePublicationAssetsForJob(this.outputRoot, post, platform, format, content)
    const job = await this.store.create({ postId, contentDate: post.datum, platform, format, scheduledAt: at, timezone, status: at ? "scheduled" : "approved", text, assets, altTexts: [content.visual.alt_text] })
    return job
  }

  async runDue(now = new Date(), onProgress?: PublicationProgressHandler): Promise<PublicationJob[]> {
    const jobs = await this.store.list()
    const dueJobs = jobs.filter((job) => job.status === "approved" || (job.status === "scheduled" && job.scheduledAt && new Date(job.scheduledAt).getTime() <= now.getTime()))
    onProgress?.({ type: "scan-complete", due: dueJobs.length, total: jobs.length })
    const results: PublicationJob[] = []
    for (const job of dueJobs) {
      onProgress?.({ type: "started", job })
      const result = await this.runJob(job)
      results.push(result)
      onProgress?.({ type: "finished", job: result })
    }
    return results
  }

  async retry(jobId: string): Promise<PublicationJob> {
    const job = await this.store.get(jobId)
    if (!job) throw new Error(`Publication Job "${jobId}" nicht gefunden.`)
    if (job.status !== "failed") throw new Error("Nur fehlgeschlagene Jobs können erneut versucht werden.")
    return this.runJob(job)
  }

  /** Cancels a scheduled publication before the scheduler can execute it. */
  async cancelScheduled(
    postId: string,
    platform: PublicationPlatform,
    format = "default"
  ): Promise<PublicationJob> {
    const job = (await this.store.list()).find(
      (item) =>
        item.postId === postId &&
        item.platform === platform &&
        item.format === format &&
        item.status === "scheduled"
    )
    if (!job) throw new Error(`Keine geplante Veröffentlichung für ${platform} gefunden.`)
    await this.store.remove(job.id)
    return job
  }

  /** Publishes an existing approved or scheduled job immediately. */
  async publishNow(postId: string, platform: PublicationPlatform): Promise<PublicationJob> {
    const job = (await this.store.list()).find(
      (item) => item.postId === postId && item.platform === platform
    )
    if (!job) throw new Error(`Kein Publication Job für ${platform} gefunden.`)
    if (platform === "facebook") {
      throw new Error("Facebook-Profil-Veröffentlichungen bleiben manuell.")
    }
    if (!["approved", "scheduled", "failed"].includes(job.status)) {
      throw new Error(`Job kann im Status „${job.status}“ nicht sofort ausgeführt werden.`)
    }
    return this.runJob({
      ...job,
      scheduledAt: new Date().toISOString(),
      assets: await resolvePublicationAssets(this.outputRoot, { id: job.postId, datum: job.contentDate } as CalendarPost, platform, job.format, await this.loadContent(job))
    })
  }

  private async runJob(job: PublicationJob): Promise<PublicationJob> {
    if (job.remoteId || job.status === "published") return job
    const adapter = this.adapters.get(job.platform)
    if (!adapter) return this.store.save({ ...job, status: "failed", lastError: `${job.platform}: kein konfigurierter Adapter.`, updatedAt: new Date().toISOString() })
    const content = await this.loadContent(job)
    const assets = await resolvePublicationAssets(this.outputRoot, { id: job.postId, datum: job.contentDate } as CalendarPost, job.platform, job.format, content)
    const processing = await this.store.save({ ...job, assets, status: "processing", attemptCount: job.attemptCount + 1, updatedAt: new Date().toISOString() })
    try {
      const result = await adapter.publish({ job: processing, content, assetPaths: processing.assets.map((assetPath) => resolve(this.outputRoot, processing.contentDate, processing.postId, assetPath)) })
      return this.store.save({ ...processing, status: "published", remoteId: result.remoteId, remoteUrl: result.remoteUrl ?? null, responseMetadata: sanitizeMetadata(result.metadata), lastError: null, updatedAt: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Veröffentlichungsfehler."
      return this.store.save({ ...processing, status: processing.attemptCount >= 3 ? "failed" : "scheduled", lastError: message, updatedAt: new Date().toISOString(), retryHistory: [...processing.retryHistory, { at: new Date().toISOString(), error: message, attempt: processing.attemptCount }] })
    }
  }

  private async loadContent(job: PublicationJob) {
    const path = getContentOutputPaths(this.outputRoot, { id: job.postId, datum: job.contentDate } as CalendarPost).contentPath
    return readContentPackage(path)
  }
}

export type PublicationProgressHandler = (progress: PublicationProgress) => void

export type PublicationProgress =
  | { type: "scan-complete"; due: number; total: number }
  | { type: "started"; job: PublicationJob }
  | { type: "finished"; job: PublicationJob }

async function resolvePublicationAssets(
  outputRoot: string,
  post: CalendarPost,
  platform: PublicationPlatform,
  format: string,
  content: Awaited<ReturnType<typeof readContentPackage>>
): Promise<string[]> {
  if (platform !== "instagram" && platform !== "mastodon" && platform !== "threads" && platform !== "bluesky") return content.metadata.assets
  const renderFormat = platform === "mastodon" || platform === "threads" || platform === "bluesky" || format !== "story" ? "instagram-feed" : "instagram-story"
  const summaryPath = getContentOutputPaths(outputRoot, post).baseDir + "/render-results.json"
  const summary = await readJsonFile<{ renders?: Array<{ format?: string; image_path?: string; page_index?: number }> }>(summaryPath)
  const assets = (summary.renders ?? [])
    .filter((render) => render.format === renderFormat && typeof render.image_path === "string")
    .sort((left, right) => (left.page_index ?? 0) - (right.page_index ?? 0))
    .map((render) => render.image_path as string)
  if (assets.length === 0) throw new Error(`Keine gerenderten ${renderFormat}-Bilder für ${post.id} gefunden. Erst den Render-Schritt ausführen.`)
  return platform === "mastodon" ? assets.slice(0, 1) : platform === "bluesky" ? assets.slice(0, 4) : assets
}

async function resolvePublicationAssetsForJob(
  outputRoot: string,
  post: CalendarPost,
  platform: PublicationPlatform,
  format: string,
  content: Awaited<ReturnType<typeof readContentPackage>>
): Promise<string[]> {
  const summaryPath = `${getContentOutputPaths(outputRoot, post).baseDir}/render-results.json`
  if (!(await pathExists(summaryPath))) return content.metadata.assets
  return resolvePublicationAssets(outputRoot, post, platform, format, content)
}

function getPlatformText(content: Awaited<ReturnType<typeof readContentPackage>>, platform: PublicationPlatform): string {
  if (platform === "facebook") return content.platforms.facebook.text
  if (platform === "instagram" || platform === "threads") return content.platforms.instagram.caption
  if (platform === "mastodon") return content.platforms.mastodon.text
  if (platform === "bluesky") return content.platforms.bluesky?.text ?? ""
  if (platform === "linkedin") return content.platforms.mastodon.text
  return ""
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!metadata) return null
  const forbidden = /token|secret|password|authorization|credential/i
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !forbidden.test(key)))
}
