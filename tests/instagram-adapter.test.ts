import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { InstagramPostPublicationAdapter, InstagramStoryPublicationAdapter } from "../src/services/publishing/instagram-adapter.js"
import { MetaTokenRefreshService } from "../src/services/publishing/meta-token-refresh.js"
import { TokenStore } from "../src/services/publishing/token-store.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("Instagram publication adapters", () => {
  it("refreshes an expiring token before creating a media container", async () => {
    const directory = await mkdtemp(join(tmpdir(), "influence-instagram-adapter-"))
    temporaryDirectories.push(directory)
    const store = new TokenStore(join(directory, "tokens.json"))
    await store.save({ provider: "instagram", accessToken: "old-token", accountId: "ig-1", expiresAt: "2026-10-12T01:00:00.000Z" })
    const requests: Array<{ url: string; body?: URLSearchParams }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : undefined
      requests.push({ url: String(url), body })
      if (String(url).includes("refresh_access_token")) return jsonResponse({ access_token: "new-token", expires_in: 5_184_000 })
      return jsonResponse(String(url).endsWith("/media_publish") ? { id: "published-1" } : String(url).endsWith("/media") ? { id: "container-1" } : { status_code: "FINISHED" })
    }
    const tokenRefresh = new MetaTokenRefreshService(store, { refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))
    const adapter = new InstagramPostPublicationAdapter({ accountId: "ig-1", accessToken: "old-token", publicBaseUrl: "https://influence.example", pollIntervalMs: 0, tokenStore: store, tokenRefresh }, fetchImpl)

    await adapter.publish({ job: job("post"), content: {} as never, assetPaths: ["/tmp/post/render-square-01.png"] })

    expect(requests[0]?.url).toContain("refresh_access_token")
    expect(requests.find((request) => request.url.endsWith("/media"))?.body?.get("access_token")).toBe("new-token")
  })

  it("publishes one generated feed render as a single-image post", async () => {
    const requests: Array<{ url: string; body?: URLSearchParams }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : undefined
      requests.push({ url: String(url), body })
      return jsonResponse(String(url).endsWith("/media_publish") ? { id: "published-1" } : String(url).endsWith("/media") ? { id: "container-1" } : { status_code: "FINISHED" })
    }
    const adapter = new InstagramPostPublicationAdapter({ accountId: "ig-1", accessToken: "token", publicBaseUrl: "https://influence.example", pollIntervalMs: 0 }, fetchImpl)

    const result = await adapter.publish({ job: job("post"), content: {} as never, assetPaths: ["/tmp/post/render-square-01.png"] })

    expect(result.remoteId).toBe("published-1")
    expect(requests[0]?.body?.get("media_type")).toBe("IMAGE")
    expect(requests[0]?.body?.get("is_carousel_item")).toBeNull()
    expect(requests[0]?.body?.get("caption")).toBe("Caption")
    expect(requests.filter((request) => request.url.endsWith("/media_publish"))).toHaveLength(1)
  })

  it("creates and publishes a carousel from the generated feed renders", async () => {
    const requests: Array<{ url: string; body?: URLSearchParams }> = []
    let containerNumber = 0
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : undefined
      requests.push({ url: String(url), body })
      if (String(url).endsWith("/media_publish")) return jsonResponse({ id: "published-1" })
      if (String(url).includes("/media") && !String(url).match(/\/container-/)) return jsonResponse({ id: `container-${++containerNumber}` })
      return jsonResponse({ status_code: "FINISHED" })
    }
    const adapter = new InstagramPostPublicationAdapter({ accountId: "ig-1", accessToken: "token", publicBaseUrl: "https://influence.example", pollIntervalMs: 0 }, fetchImpl)
    const result = await adapter.publish({ job: job("post"), content: {} as never, assetPaths: ["/tmp/post/render-instagram-feed-01.png", "/tmp/post/render-instagram-feed-02.png"] })

    expect(result.remoteId).toBe("published-1")
    const mediaBodies = requests.filter((request) => request.url.endsWith("/media")).map((request) => request.body)
    expect(mediaBodies[0]?.get("image_url")).toBe("https://influence.example/files/2026-08-10/post-1/render-instagram-feed-01.png")
    expect(mediaBodies[2]?.get("media_type")).toBe("CAROUSEL")
    expect(mediaBodies[2]?.get("children")).toBe("container-1,container-2")
    expect(requests.at(-1)?.url).toContain("/media_publish")
  })

  it("publishes one generated story render without a caption", async () => {
    const requests: Array<{ url: string; body?: URLSearchParams }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : undefined
      requests.push({ url: String(url), body })
      return jsonResponse(String(url).endsWith("/media_publish") ? { id: "story-1" } : String(url).endsWith("/media") ? { id: "story-container" } : { status_code: "FINISHED" })
    }
    const adapter = new InstagramStoryPublicationAdapter({ accountId: "ig-1", accessToken: "token", publicBaseUrl: "https://influence.example", pollIntervalMs: 0 }, fetchImpl)
    await adapter.publish({ job: job("story"), content: {} as never, assetPaths: ["/tmp/post/render-instagram-story-01.png", "/tmp/post/render-instagram-story-02.png"] })

    expect(requests[0]?.body?.get("media_type")).toBe("STORIES")
    expect(requests[0]?.body?.get("caption")).toBeNull()
    expect(requests[0]?.body?.get("image_url")).toContain("render-instagram-story-01.png")
    expect(requests.filter((request) => request.url.endsWith("/media_publish")).length).toBe(2)
  })
})

function job(format: string) {
  return {
    id: "job-1", postId: "post-1", contentDate: "2026-08-10", platform: "instagram" as const, format,
    scheduledAt: null, timezone: "Europe/Berlin", status: "processing" as const, attemptCount: 1,
    remoteId: null, remoteUrl: null, lastError: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z",
    text: "Caption", assets: [], altTexts: ["Alt"], responseMetadata: null, retryHistory: []
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } })
}
