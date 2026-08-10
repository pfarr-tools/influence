import { describe, expect, it } from "vitest"

import { InstagramPostPublicationAdapter, InstagramStoryPublicationAdapter } from "../src/services/publishing/instagram-adapter.js"

describe("Instagram publication adapters", () => {
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
