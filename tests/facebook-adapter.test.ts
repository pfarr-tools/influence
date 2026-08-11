import { describe, expect, it } from "vitest"

import { FacebookPagePublicationAdapter } from "../src/services/publishing/facebook-adapter.js"

describe("Facebook Page publication adapter", () => {
  it("publishes the generated landscape render as a Page photo", async () => {
    const requests: Array<{ url: string; body?: URLSearchParams }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), body: init?.body instanceof URLSearchParams ? init.body : undefined })
      if (String(url).includes("/me/accounts")) {
        return new Response(JSON.stringify({ data: [{ id: "page-1", access_token: "page-token" }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: "photo-1", post_id: "page-post-1" }), { status: 200 })
    }
    const adapter = new FacebookPagePublicationAdapter({ pageId: "page-1", accessToken: "token", publicBaseUrl: "https://influence.example" }, fetchImpl)

    const result = await adapter.publish({ job: job(), content: {} as never, assetPaths: ["/tmp/post/render-facebook-mastodon-01.png"] })

    expect(result.remoteId).toBe("page-post-1")
    expect(requests[0]?.url).toBe("https://graph.facebook.com/v23.0/me/accounts?fields=id%2Caccess_token%2Ctasks&access_token=token")
    expect(requests[1]?.url).toBe("https://graph.facebook.com/v23.0/page-1/photos")
    expect(requests[1]?.body?.get("access_token")).toBe("page-token")
    expect(requests[1]?.body?.get("caption")).toBe("Facebook text")
    expect(requests[1]?.body?.get("url")).toBe("https://influence.example/files/2026-08-10/post-1/render-facebook-mastodon-01.png")
    expect(requests[1]?.body?.get("published")).toBe("true")
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
