import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import { getPostById } from "../calendar/calendar-service.js"
import { assertContentApproved, getContentOutputPaths, isPublicationApproved, readContentPackage } from "../content/content-storage.js"
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
    const existing = (await this.store.list()).find((job) => job.postId === postId && job.platform === platform && job.format === format && !["failed", "cancelled"].includes(job.status))
    if (existing) return existing
    const text = getPlatformText(content, platform)
    const job = await this.store.create({ postId, contentDate: post.datum, platform, format, scheduledAt: at, timezone, status: at ? "scheduled" : "approved", text, assets: content.metadata.assets, altTexts: [content.visual.alt_text] })
    return job
  }

  async runDue(now = new Date()): Promise<PublicationJob[]> {
    const jobs = await this.store.list()
    const results: PublicationJob[] = []
    for (const job of jobs) {
      if (!(job.status === "approved" || (job.status === "scheduled" && job.scheduledAt && new Date(job.scheduledAt).getTime() <= now.getTime()))) continue
      results.push(await this.runJob(job))
    }
    return results
  }

  async retry(jobId: string): Promise<PublicationJob> {
    const job = await this.store.get(jobId)
    if (!job) throw new Error(`Publication Job "${jobId}" nicht gefunden.`)
    if (job.status !== "failed") throw new Error("Nur fehlgeschlagene Jobs können erneut versucht werden.")
    return this.runJob(job)
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
    return this.runJob({ ...job, scheduledAt: new Date().toISOString() })
  }

  private async runJob(job: PublicationJob): Promise<PublicationJob> {
    if (job.remoteId || job.status === "published") return job
    const adapter = this.adapters.get(job.platform)
    if (!adapter) return this.store.save({ ...job, status: "failed", lastError: `${job.platform}: kein konfigurierter Adapter.`, updatedAt: new Date().toISOString() })
    const processing = await this.store.save({ ...job, status: "processing", attemptCount: job.attemptCount + 1, updatedAt: new Date().toISOString() })
    try {
      const result = await adapter.publish({ job: processing, content: await this.loadContent(processing), assetPaths: processing.assets })
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

function getPlatformText(content: Awaited<ReturnType<typeof readContentPackage>>, platform: PublicationPlatform): string {
  if (platform === "facebook") return content.platforms.facebook.text
  if (platform === "instagram" || platform === "threads") return content.platforms.instagram.caption
  if (platform === "mastodon" || platform === "bluesky" || platform === "linkedin") return content.platforms.mastodon.text
  return ""
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!metadata) return null
  const forbidden = /token|secret|password|authorization|credential/i
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !forbidden.test(key)))
}
