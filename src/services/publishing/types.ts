import type { ContentPackage } from "../../domain/content.js"

/** Platforms supported by the publication queue. */
export type PublicationPlatform =
  | "instagram"
  | "mastodon"
  | "threads"
  | "bluesky"
  | "linkedin"
  | "facebook"

/** Persistent state of a publication job. */
export type PublicationStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "processing"
  | "published"
  | "failed"
  | "cancelled"

/** A single publication attempt managed by Pfarr.Media. */
export interface PublicationJob {
  id: string
  postId: string
  contentDate: string
  platform: PublicationPlatform
  format: string
  scheduledAt: string | null
  timezone: string
  status: PublicationStatus
  attemptCount: number
  remoteId: string | null
  remoteUrl: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
  text: string
  assets: string[]
  altTexts: string[]
  responseMetadata: Record<string, unknown> | null
  retryHistory: Array<{ at: string; error: string; attempt: number }>
}

/** Data adapters receive for one publication attempt. */
export interface PublicationPayload {
  job: PublicationJob
  content: ContentPackage
  assetPaths: string[]
}

/** Result returned by a platform adapter. */
export interface PublicationResult {
  remoteId: string
  remoteUrl?: string
  metadata?: Record<string, unknown>
}

/** Mockable platform boundary; adapters must never persist credentials. */
export interface PublicationAdapter {
  readonly platform: PublicationPlatform
  publish(payload: PublicationPayload): Promise<PublicationResult>
}

/** Optional platform capability state used by the review UI and exports. */
export type PlatformAvailability = "available" | "manual-only" | "unavailable"
