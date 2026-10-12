import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { ThreadsPublicationAdapter } from "../src/services/publishing/threads-adapter.js"
import { MetaTokenRefreshService } from "../src/services/publishing/meta-token-refresh.js"
import { TokenStore } from "../src/services/publishing/token-store.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("Threads publication adapter", () => {
  it("refreshes an expiring token before creating a container", async () => {
    const directory = await mkdtemp(join(tmpdir(), "influence-threads-adapter-"))
    temporaryDirectories.push(directory)
    const store = new TokenStore(join(directory, "tokens.json"))
    await store.save({ provider: "threads", accessToken: "old-token", accountId: "user-1", expiresAt: "2026-10-12T01:00:00.000Z" })
    const requests: Array<{ url: string; body?: URLSearchParams }> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : undefined
      requests.push({ url: String(url), body })
      if (String(url).includes("refresh_access_token")) return response({ access_token: "new-token", expires_in: 5_184_000 })
      if (String(url).endsWith("/threads_publish")) return response({ id: "thread-1" })
      if (String(url).includes("/container-1")) return response({ status: "FINISHED" })
      return response({ id: "container-1" })
    }
    const tokenRefresh = new MetaTokenRefreshService(store, { refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))
    const adapter = new ThreadsPublicationAdapter({ accessToken: "old-token", userId: "user-1", publicBaseUrl: "https://influence.example", pollIntervalMs: 0, tokenStore: store, tokenRefresh }, fetchImpl)

    await adapter.publish({ job: job(), content: {} as never, assetPaths: [] })

    expect(requests[0]?.url).toContain("refresh_access_token")
    expect(requests.find((request) => request.url.endsWith("/threads"))?.body?.get("access_token")).toBe("new-token")
  })

  it("publishes with the current token when refresh fails before expiry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "influence-threads-adapter-"))
    temporaryDirectories.push(directory)
    const store = new TokenStore(join(directory, "tokens.json"))
    await store.save({ provider: "threads", accessToken: "current-token", accountId: "user-1", expiresAt: "2026-10-13T00:00:00.000Z" })
    const fetchImpl = async (url: string | URL) => String(url).includes("refresh_access_token")
      ? response({ error: "temporary" }, 500)
      : String(url).includes("/container-1?") ? response({ status: "FINISHED" }) : String(url).endsWith("/threads_publish") ? response({ id: "thread-1" }) : response({ id: "container-1" })
    const tokenRefresh = new MetaTokenRefreshService(store, { refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))
    const adapter = new ThreadsPublicationAdapter({ accessToken: "current-token", userId: "user-1", publicBaseUrl: "https://influence.example", pollIntervalMs: 0, tokenStore: store, tokenRefresh }, fetchImpl)

    await expect(adapter.publish({ job: job(), content: {} as never, assetPaths: [] })).resolves.toBeDefined()
  })

  it("requires reconnect after an expired token cannot be refreshed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "influence-threads-adapter-"))
    temporaryDirectories.push(directory)
    const store = new TokenStore(join(directory, "tokens.json"))
    const secret = "expired-secret"
    await store.save({ provider: "threads", accessToken: secret, accountId: "user-1", expiresAt: "2026-10-11T00:00:00.000Z" })
    const fetchImpl = async () => response({ error: "expired" }, 400)
    const tokenRefresh = new MetaTokenRefreshService(store, { refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))
    const adapter = new ThreadsPublicationAdapter({ accessToken: secret, userId: "user-1", publicBaseUrl: "https://influence.example", pollIntervalMs: 0, tokenStore: store, tokenRefresh }, fetchImpl)

    await expect(adapter.publish({ job: job(), content: {} as never, assetPaths: [] })).rejects.toThrow(/erneut verbinden/i)
    await expect(adapter.publish({ job: job(), content: {} as never, assetPaths: [] })).rejects.not.toThrow(secret)
  })

  it("shortens overlong text before creating a container", async () => {
    const requests: Array<{ body?: URLSearchParams }> = []
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      requests.push({ body: init?.body instanceof URLSearchParams ? init.body : undefined })
      return response(requests.length === 1 ? { id: "container-1" } : requests.length === 2 ? { status: "FINISHED" } : { id: "thread-1" })
    }
    const adapter = new ThreadsPublicationAdapter({ accessToken: "token", userId: "user-1", publicBaseUrl: "https://influence.example", pollIntervalMs: 0 }, fetchImpl)

    await adapter.publish({ job: { ...job(), text: "x".repeat(301) }, content: {} as never, assetPaths: [] })

    expect(requests[0]?.body?.get("text")).toBe("x".repeat(297) + "...")
  })

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
function response(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }) }
