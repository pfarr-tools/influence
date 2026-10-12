import { describe, expect, it, vi } from "vitest"

import { MetaTokenRefreshService } from "../src/services/publishing/meta-token-refresh.js"
import type { StoredToken } from "../src/services/publishing/token-store.js"

describe("MetaTokenRefreshService", () => {
  it("refreshes Threads tokens with the provider endpoint", async () => {
    const store = new MemoryTokenStore()
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("https://graph.threads.net/refresh_access_token")
      expect(String(url)).toContain("grant_type=th_refresh_token")
      expect(String(url)).toContain("access_token=old-token")
      return response({ access_token: "new-token", expires_in: 5_184_000 })
    })
    const service = new MetaTokenRefreshService(store, { threadsAppSecret: "app-secret", refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))

    const refreshed = await service.getOrRefreshToken(token("threads", "old-token", "2026-10-12T12:00:00.000Z"))

    expect(refreshed).toMatchObject({ provider: "threads", accessToken: "new-token", accountId: "account", expiresAt: "2026-12-11T00:00:00.000Z" })
    expect(store.saved).toEqual([refreshed])
  })

  it("refreshes Instagram tokens with the provider endpoint", async () => {
    const store = new MemoryTokenStore()
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("https://graph.instagram.com/refresh_access_token")
      expect(String(url)).toContain("grant_type=ig_refresh_token")
      return response({ access_token: "new-token", expires_in: 5_184_000 })
    })
    const service = new MetaTokenRefreshService(store, { refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))

    await expect(service.getOrRefreshToken(token("instagram", "old-token", "2026-10-12T12:00:00.000Z"))).resolves.toMatchObject({ accessToken: "new-token" })
  })

  it("reuses a token outside the refresh window", async () => {
    const fetchImpl = vi.fn()
    const service = new MetaTokenRefreshService(new MemoryTokenStore(), { refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))
    const current = token("threads", "current", "2026-12-01T00:00:00.000Z")

    await expect(service.getOrRefreshToken(current)).resolves.toEqual(current)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("shares one refresh request between concurrent callers of the same provider", async () => {
    const store = new MemoryTokenStore()
    let release: (() => void) | undefined
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(response({ access_token: "new-token", expires_in: 5_184_000 }))
    }))
    const service = new MetaTokenRefreshService(store, { threadsAppSecret: "app-secret", refreshWindowMs: 86_400_000 }, fetchImpl, () => new Date("2026-10-12T00:00:00.000Z"))
    const current = token("threads", "old-token", "2026-10-12T12:00:00.000Z")
    const first = service.getOrRefreshToken(current)
    const second = service.getOrRefreshToken(current)
    release?.()

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("falls back to the current token when refresh fails before expiry", async () => {
    const current = token("instagram", "current-secret", "2026-10-12T12:00:00.000Z")
    const service = new MetaTokenRefreshService(new MemoryTokenStore(), { refreshWindowMs: 86_400_000 }, async () => response({ error: { message: "temporary" } }, 500), () => new Date("2026-10-12T00:00:00.000Z"))

    await expect(service.getOrRefreshToken(current)).resolves.toEqual(current)
  })

  it("requires reconnect for an expired token without exposing it", async () => {
    const secret = "expired-secret"
    const service = new MetaTokenRefreshService(new MemoryTokenStore(), { refreshWindowMs: 86_400_000 }, async () => response({ error: "expired" }, 400), () => new Date("2026-10-13T00:00:00.000Z"))

    await expect(service.getOrRefreshToken(token("threads", secret, "2026-10-12T00:00:00.000Z"))).rejects.toThrow(/erneut verbinden/i)
    await expect(service.getOrRefreshToken(token("threads", secret, "2026-10-12T00:00:00.000Z"))).rejects.not.toThrow(secret)
  })
})

function token(provider: StoredToken["provider"], accessToken: string, expiresAt: string): StoredToken {
  return { provider, accessToken, accountId: "account", expiresAt }
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
}

class MemoryTokenStore {
  saved: StoredToken[] = []
  async save(record: StoredToken): Promise<void> { this.saved.push(record) }
}
