import type { PublicationAdapter, PublicationPayload, PublicationPlatform, PublicationResult } from "./types.js"

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
  const configs: Array<[PublicationPlatform, string, string]> = [
    ["instagram", "INSTAGRAM_API_URL", "INSTAGRAM_ACCESS_TOKEN"],
    ["mastodon", "MASTODON_API_URL", "MASTODON_ACCESS_TOKEN"],
    ["threads", "THREADS_API_URL", "THREADS_ACCESS_TOKEN"],
    ["bluesky", "BLUESKY_API_URL", "BLUESKY_ACCESS_TOKEN"],
    ["linkedin", "LINKEDIN_API_URL", "LINKEDIN_ACCESS_TOKEN"]
  ]
  for (const [platform, endpointKey, tokenKey] of configs) {
    const endpoint = environment[endpointKey]?.trim()
    const token = environment[tokenKey]?.trim()
    if (endpoint && token) adapters.set(platform, new HttpPublicationAdapter(platform, endpoint, token))
  }
  return adapters
}
