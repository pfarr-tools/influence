import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { MastodonOAuthService, MastodonPublicationAdapter } from "../src/services/publishing/mastodon-adapter.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  const { rm } = await import("node:fs/promises")
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("MastodonPublicationAdapter", () => {
  it("uploads local media and creates an idempotent status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "influence-mastodon-"))
    temporaryDirectories.push(directory)
    const assetPath = join(directory, "image.png")
    await writeFile(assetPath, "image bytes")
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return jsonResponse(requests.length === 1 ? { id: "media-1" } : { id: "status-1", url: "https://mastodon.example/@pfarrer/1" })
    }
    const adapter = new MastodonPublicationAdapter({
      serverUrl: "https://mastodon.example/",
      accessToken: "token",
      visibility: "public",
      language: "de"
    }, fetchImpl)

    const result = await adapter.publish({
      job: {
        id: "job-1",
        postId: "post-1",
        contentDate: "2026-08-10",
        platform: "mastodon",
        format: "default",
        scheduledAt: null,
        timezone: "Europe/Berlin",
        status: "processing",
        attemptCount: 1,
        remoteId: null,
        remoteUrl: null,
        lastError: null,
        createdAt: "2026-08-10T08:00:00.000Z",
        updatedAt: "2026-08-10T08:00:00.000Z",
        text: "Guten Morgen",
        assets: ["assets/image.png"],
        altTexts: ["Ein Bild"],
        responseMetadata: null,
        retryHistory: []
      },
      content: {} as never,
      assetPaths: [assetPath]
    })

    expect(result).toEqual({
      remoteId: "status-1",
      remoteUrl: "https://mastodon.example/@pfarrer/1",
      metadata: { status: 200, mediaCount: 1 }
    })
    expect(requests.map((request) => request.url)).toEqual([
      "https://mastodon.example/api/v2/media",
      "https://mastodon.example/api/v1/statuses"
    ])
    expect(requests[0]?.init?.headers).toEqual({ authorization: "Bearer token" })
    expect(requests[1]?.init?.headers).toEqual({
      authorization: "Bearer token",
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": "job-1"
    })
    expect(new URLSearchParams(requests[1]?.init?.body as URLSearchParams)).toEqual(
      new URLSearchParams("status=Guten+Morgen&visibility=public&language=de&media_ids%5B%5D=media-1")
    )
  })
})

describe("MastodonOAuthService", () => {
  it("registers an app, creates a PKCE authorization URL, and exchanges the callback", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return jsonResponse(requests.length === 1
        ? { client_id: "client-1", client_secret: "secret-1" }
        : { access_token: "access-1", scope: "read write:statuses write:media" })
    }
    const service = new MastodonOAuthService({
      serverUrl: "https://mastodon.example",
      publicBaseUrl: "https://influence.example",
        clientName: "example.org",
    }, fetchImpl)

    const authorizationUrl = new URL(await service.begin())
    expect(authorizationUrl.pathname).toBe("/oauth/authorize")
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("https://influence.example/publish/mastodon/oauth/callback")
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256")
    expect(new URLSearchParams(requests[0]?.init?.body as URLSearchParams).get("client_name")).toBe("example.org")

    const token = await service.complete("code-1", authorizationUrl.searchParams.get("state") ?? "")
    expect(token).toEqual({ accessToken: "access-1", scope: "read write:statuses write:media" })
    expect(requests[1]?.url).toBe("https://mastodon.example/oauth/token")
    expect(new URLSearchParams(requests[1]?.init?.body as URLSearchParams).get("code_verifier")).toBeTruthy()
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}
