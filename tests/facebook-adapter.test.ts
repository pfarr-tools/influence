import { describe, expect, it } from "vitest"

import { FacebookPagePublicationAdapter } from "../src/services/publishing/facebook-adapter.js"

describe("Facebook Page publication adapter", () => {
  it("publishes the generated landscape render as a Page photo", async () => {
    let request: { url: string; body?: URLSearchParams } | undefined
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      request = { url: String(url), body: init?.body instanceof URLSearchParams ? init.body : undefined }
      return new Response(JSON.stringify({ id: "photo-1", post_id: "page-post-1" }), { status: 200 })
    }
    const adapter = new FacebookPagePublicationAdapter({ pageId: "page-1", accessToken: "token", publicBaseUrl: "https://influence.example" }, fetchImpl)

    const result = await adapter.publish({ job: job(), content: {} as never, assetPaths: ["/tmp/post/render-facebook-mastodon-01.png"] })

    expect(result.remoteId).toBe("page-post-1")
    expect(request?.url).toBe("https://graph.facebook.com/v23.0/page-1/photos")
    expect(request?.body?.get("caption")).toBe("Facebook text")
    expect(request?.body?.get("url")).toBe("https://influence.example/files/2026-08-10/post-1/render-facebook-mastodon-01.png")
    expect(request?.body?.get("published")).toBe("true")
  })
})

function job() {
  return {
    id: "job-1", postId: "post-1", contentDate: "2026-08-10", platform: "facebook" as const, format: "default",
    scheduledAt: null, timezone: "Europe/Berlin", status: "processing" as const, attemptCount: 1,
    remoteId: null, remoteUrl: null, lastError: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z",
    text: "Facebook text", assets: [], altTexts: ["Alt"], responseMetadata: null, retryHistory: []
  }
}
