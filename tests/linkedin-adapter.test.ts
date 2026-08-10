import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { LinkedInPublicationAdapter } from "../src/services/publishing/linkedin-adapter.js"

describe("LinkedIn publication adapter", () => {
  it("uploads images and publishes a native multi-image post", async () => {
    const directory = await mkdtemp(join(tmpdir(), "influence-linkedin-"))
    const first = join(directory, "first.png")
    const second = join(directory, "second.png")
    await writeFile(first, "first")
    await writeFile(second, "second")
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      if (String(url).includes("initializeUpload")) return new Response(JSON.stringify({ value: { uploadUrl: "https://upload.example", image: "urn:li:image:1" } }), { status: 200 })
      if (String(url) === "https://upload.example") return new Response(null, { status: 201 })
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } })
    }
    const adapter = new LinkedInPublicationAdapter({ accessToken: "token", authorUrn: "urn:li:organization:42" }, fetchImpl)

    const result = await adapter.publish({ job: job(), content: {} as never, assetPaths: [first, second] })

    expect(result.remoteId).toBe("urn:li:share:1")
    const post = JSON.parse(String(requests.at(-1)?.init?.body)) as { author: string; commentary: string; content: { multiImage: { images: unknown[] } } }
    expect(post.author).toBe("urn:li:organization:42")
    expect(post.commentary).toBe("LinkedIn text\n\nSecond paragraph")
    expect(post.content.multiImage.images).toHaveLength(2)
    expect(requests[0]?.init?.headers).toMatchObject({ "linkedin-version": "202606", "x-restli-protocol-version": "2.0.0" })
  })

  it("handles an empty successful post response without reading the body twice", async () => {
    const requests: string[] = []
    const fetchImpl = async (url: string | URL) => {
      requests.push(String(url))
      if (String(url).includes("initializeUpload")) return new Response(JSON.stringify({ value: { uploadUrl: "https://upload.example", image: "urn:li:image:1" } }), { status: 200 })
      if (String(url) === "https://upload.example") return new Response(null, { status: 201 })
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:2" } })
    }
    const directory = await mkdtemp(join(tmpdir(), "influence-linkedin-empty-"))
    const image = join(directory, "image.png")
    await writeFile(image, "image")

    const result = await new LinkedInPublicationAdapter({ accessToken: "token", authorUrn: "urn:li:organization:42" }, fetchImpl)
      .publish({ job: job(), content: {} as never, assetPaths: [image] })

    expect(result.remoteId).toBe("urn:li:share:2")
    expect(requests).toHaveLength(3)
  })
})

function job() {
  return {
    id: "job-1", postId: "post-1", contentDate: "2026-08-10", platform: "linkedin" as const, format: "default",
    scheduledAt: null, timezone: "Europe/Berlin", status: "processing" as const, attemptCount: 1,
    remoteId: null, remoteUrl: null, lastError: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z",
    text: "LinkedIn text\n\nSecond paragraph", assets: [], altTexts: ["Alt"], responseMetadata: null, retryHistory: []
  }
}
