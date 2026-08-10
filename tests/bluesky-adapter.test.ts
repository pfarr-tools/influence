import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { BlueskyPublicationAdapter } from "../src/services/publishing/bluesky-adapter.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  const { rm } = await import("node:fs/promises")
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("Bluesky publication adapter", () => {
  it("uploads images and creates a native feed post", async () => {
    const directory = await mkdtemp(join(tmpdir(), "influence-bluesky-"))
    temporaryDirectories.push(directory)
    const assetPath = join(directory, "image.jpg")
    await writeFile(assetPath, "image bytes")
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return jsonResponse(requests.length === 1
        ? { blob: { $type: "blob", ref: { $link: "blob-1" }, mimeType: "image/jpeg", size: 11 } }
        : { uri: "at://did:plc:author/app.bsky.feed.post/rkey-1", cid: "cid-1" })
    }
    const adapter = new BlueskyPublicationAdapter({ serviceUrl: "https://bsky.example", accessToken: "token", repo: "did:plc:author" }, fetchImpl)

    const result = await adapter.publish({ job: job(), content: content(), assetPaths: [assetPath] })

    expect(result).toEqual({
      remoteId: "at://did:plc:author/app.bsky.feed.post/rkey-1",
      remoteUrl: "https://bsky.app/profile/did%3Aplc%3Aauthor/post/rkey-1",
      metadata: { status: 200, mediaCount: 1 }
    })
    expect(requests.map((request) => request.url)).toEqual([
      "https://bsky.example/xrpc/com.atproto.repo.uploadBlob",
      "https://bsky.example/xrpc/com.atproto.repo.createRecord"
    ])
    expect(requests[0]?.init?.headers).toEqual({ authorization: "Bearer token", "content-type": "image/jpeg" })
    const record = JSON.parse(String(requests[1]?.init?.body)) as { repo: string; collection: string; record: { text: string; embed: { images: Array<{ alt: string }> } } }
    expect(record.repo).toBe("did:plc:author")
    expect(record.collection).toBe("app.bsky.feed.post")
    expect(record.record.text).toBe("Guten Morgen")
    expect(record.record.embed.images[0]?.alt).toBe("Ein Bild")
  })

  it("creates a session when configured with an app password", async () => {
    const requests: string[] = []
    const fetchImpl = async (url: string | URL) => {
      requests.push(String(url))
      return jsonResponse(requests.length === 1 ? { accessJwt: "jwt", did: "did:plc:author" } : { uri: "at://did:plc:author/app.bsky.feed.post/text-1" })
    }
    const adapter = new BlueskyPublicationAdapter({ serviceUrl: "https://bsky.example", identifier: "author.example", appPassword: "app-password" }, fetchImpl)
    await adapter.publish({ job: job(), content: content(), assetPaths: [] })
    expect(requests).toEqual([
      "https://bsky.example/xrpc/com.atproto.server.createSession",
      "https://bsky.example/xrpc/com.atproto.repo.createRecord"
    ])
  })
})

function job() {
  return { id: "job-1", postId: "post-1", contentDate: "2026-08-10", platform: "bluesky" as const, format: "post", scheduledAt: null, timezone: "Europe/Berlin", status: "processing" as const, attemptCount: 1, remoteId: null, remoteUrl: null, lastError: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z", text: "Guten Morgen", assets: [], altTexts: ["Ein Bild"], responseMetadata: null, retryHistory: [] }
}

function content() {
  return { platforms: { bluesky: { text: "Guten Morgen" } } } as never
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } })
}
