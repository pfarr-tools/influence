import type { PublicationAdapter, PublicationPayload, PublicationPlatform, PublicationResult } from "./types.js"
import { MastodonPublicationAdapter } from "./mastodon-adapter.js"
import { InstagramPublicationAdapter } from "./instagram-adapter.js"
import { ThreadsPublicationAdapter } from "./threads-adapter.js"
import { createBlueskyAdapter } from "./bluesky-adapter.js"
import { FacebookPagePublicationAdapter } from "./facebook-adapter.js"
import { createLinkedInAdapter } from "./linkedin-adapter.js"

/** Adapter used by dry-runs and tests; it records no external side effects. */
export class DryRunPublicationAdapter implements PublicationAdapter {
  constructor(public readonly platform: PublicationPlatform) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    return { remoteId: `dry-run:${payload.job.id}`, metadata: { dryRun: true, platform: this.platform } }
  }
}

/** Generic HTTP adapter for officially supported JSON publishing APIs. */
export class HttpPublicationAdapter implements PublicationAdapter {
  constructor(
    public readonly platform: PublicationPlatform,
    private readonly endpoint: string,
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    if (!this.accessToken) throw new Error(`${this.platform}: Zugangsdaten fehlen.`)
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ text: payload.job.text, format: payload.job.format, assets: payload.assetPaths, altTexts: payload.job.altTexts })
    })
    const body = (await response.json()) as { id?: string; url?: string; [key: string]: unknown }
    if (!response.ok || !body.id) throw new Error(`${this.platform}: Veröffentlichung fehlgeschlagen (${response.status}).`)
    return { remoteId: body.id, remoteUrl: body.url, metadata: { status: response.status } }
  }
}

/** Returns adapters without coupling the queue to credentials or SDKs. */
export function createConfiguredAdapters(environment: Record<string, string | undefined> = process.env): Map<PublicationPlatform, PublicationAdapter> {
  const adapters = new Map<PublicationPlatform, PublicationAdapter>()
  const facebookPageId = environment.FACEBOOK_PAGE_ID?.trim()
  const facebookToken = environment.FACEBOOK_ACCESS_TOKEN?.trim()
  const facebookBaseUrl = environment.PUBLIC_BASE_URL?.trim()
  if (facebookPageId && facebookToken && facebookBaseUrl) {
    adapters.set("facebook", new FacebookPagePublicationAdapter({
      pageId: facebookPageId,
      accessToken: facebookToken,
      publicBaseUrl: facebookBaseUrl,
      graphApiBaseUrl: environment.FACEBOOK_GRAPH_API_URL?.trim(),
      graphApiVersion: environment.FACEBOOK_GRAPH_API_VERSION?.trim()
    }))
  }
  const bluesky = createBlueskyAdapter(environment)
  if (bluesky) adapters.set("bluesky", bluesky)
  const linkedin = createLinkedInAdapter(environment)
  if (linkedin) adapters.set("linkedin", linkedin)
  const threadsToken = environment.THREADS_ACCESS_TOKEN?.trim()
  const threadsBaseUrl = environment.PUBLIC_BASE_URL?.trim()
  if (threadsToken && threadsBaseUrl) {
    adapters.set("threads", new ThreadsPublicationAdapter({
      accessToken: threadsToken,
      userId: environment.THREADS_USER_ID?.trim(),
      publicBaseUrl: threadsBaseUrl,
      graphApiBaseUrl: environment.THREADS_GRAPH_API_URL?.trim(),
      graphApiVersion: environment.THREADS_GRAPH_API_VERSION?.trim(),
      pollIntervalMs: Number(environment.THREADS_POLL_INTERVAL_MS) || undefined
    }))
  }
  const instagramAccountId = environment.INSTAGRAM_ACCOUNT_ID?.trim()
  const instagramToken = environment.INSTAGRAM_ACCESS_TOKEN?.trim()
  const instagramBaseUrl = environment.PUBLIC_BASE_URL?.trim()
  if (instagramAccountId && instagramToken && instagramBaseUrl) {
    adapters.set("instagram", new InstagramPublicationAdapter({
      accountId: instagramAccountId,
      accessToken: instagramToken,
      publicBaseUrl: instagramBaseUrl,
      graphApiBaseUrl: environment.INSTAGRAM_GRAPH_API_URL?.trim(),
      graphApiVersion: environment.INSTAGRAM_GRAPH_API_VERSION?.trim(),
      pollIntervalMs: Number(environment.INSTAGRAM_POLL_INTERVAL_MS) || undefined
    }))
  }
  const mastodonServerUrl = environment.MASTODON_SERVER_URL?.trim()
  const mastodonToken = environment.MASTODON_ACCESS_TOKEN?.trim()
  if (mastodonServerUrl && mastodonToken) {
    adapters.set("mastodon", new MastodonPublicationAdapter({
      serverUrl: mastodonServerUrl,
      accessToken: mastodonToken,
      visibility: environment.MASTODON_VISIBILITY?.trim() || "public",
      language: environment.MASTODON_LANGUAGE?.trim() || "de"
    }))
  }
  return adapters
}
