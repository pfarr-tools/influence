import { describe, expect, it } from "vitest"
import { ThreadsPublicationAdapter } from "../src/services/publishing/threads-adapter.js"

describe("Threads publication adapter", () => {
  it("publishes generated images as a Threads carousel", async () => {
    const requests: Array<{ url: string; body?: URLSearchParams }> = []
    let number = 0
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : undefined
      requests.push({ url: String(url), body })
      if (String(url).endsWith("/threads_publish")) return response({ id: "thread-1" })
      if (String(url).match(/\/threads$/)) return response({ id: `container-${++number}` })
      return response({ status: "FINISHED" })
    }
    const adapter = new ThreadsPublicationAdapter({ accessToken: "token", userId: "user-1", publicBaseUrl: "https://influence.example", pollIntervalMs: 0 }, fetchImpl)
    const result = await adapter.publish({ job: job(), content: {} as never, assetPaths: ["/tmp/render-01.png", "/tmp/render-02.png"] })
    expect(result.remoteId).toBe("thread-1")
    expect(requests[0]?.url).toContain("/v1.0/user-1/threads")
    expect(requests[0]?.body?.get("image_url")).toBe("https://influence.example/files/2026-08-10/post-1/render-01.png")
    expect(String(requests.find((request) => request.url.includes("/container-1"))?.url)).toContain("fields=status")
    const carouselRequest = requests.find((request) => request.body?.get("media_type") === "CAROUSEL")
    expect(carouselRequest?.body?.get("children")).toBe("container-1,container-2")
  })
})

function job() { return { id: "job-1", postId: "post-1", contentDate: "2026-08-10", platform: "threads" as const, format: "post", scheduledAt: null, timezone: "Europe/Berlin", status: "processing" as const, attemptCount: 1, remoteId: null, remoteUrl: null, lastError: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z", text: "Text", assets: [], altTexts: ["Alt"], responseMetadata: null, retryHistory: [] } }
function response(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }) }
