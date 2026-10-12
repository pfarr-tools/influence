import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { InstagramOAuthService } from "../src/services/publishing/instagram-oauth.js"
import { ThreadsOAuthService } from "../src/services/publishing/threads-adapter.js"
import { TokenStore } from "../src/services/publishing/token-store.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("Meta OAuth token persistence", () => {
  it("persists the long-lived Threads token without changing the OAuth result", async () => {
    const store = await createStore()
    const fetchImpl = async (url: string | URL) => String(url).includes("/oauth/access_token")
      ? response({ access_token: "short-lived", user_id: "threads-user" })
      : response({ access_token: "long-lived", expires_in: 5_184_000 })
    const service = new ThreadsOAuthService({ appId: "app", appSecret: "secret", publicBaseUrl: "https://influence.example" }, fetchImpl, store)
    const state = new URL(service.begin()).searchParams.get("state") ?? ""

    const result = await service.complete("code", state)

    expect(result.accessToken).toBe("long-lived")
    expect(await store.get("threads")).toMatchObject({ accessToken: "long-lived", accountId: "threads-user" })
    expect(await readFile(storePath(store), "utf8")).not.toContain("short-lived")
  })

  it("accepts the numeric Threads user ID returned by Meta", async () => {
    const store = await createStore()
    const fetchImpl = async (url: string | URL) => String(url).includes("/oauth/access_token")
      ? response({ access_token: "short-lived", user_id: 17841405793187218 })
      : response({ access_token: "long-lived", expires_in: 5_184_000 })
    const service = new ThreadsOAuthService({ appId: "app", appSecret: "secret", publicBaseUrl: "https://influence.example" }, fetchImpl, store)
    const state = new URL(service.begin()).searchParams.get("state") ?? ""

    await expect(service.complete("code", state)).resolves.toMatchObject({ accessToken: "long-lived", userId: "17841405793187218" })
    expect(await store.get("threads")).toMatchObject({ accountId: "17841405793187218" })
  })

  it("exchanges and persists the long-lived Instagram token", async () => {
    const store = await createStore()
    const requests: string[] = []
    const fetchImpl = async (url: string | URL) => {
      requests.push(String(url))
      return requests.length === 1
        ? response({ access_token: "short-lived", user_id: "instagram-account" })
        : response({ access_token: "long-lived", expires_in: 5_184_000 })
    }
    const service = new InstagramOAuthService({ appId: "app", appSecret: "secret", publicBaseUrl: "https://influence.example" }, fetchImpl, store)
    const state = new URL(service.begin()).searchParams.get("state") ?? ""

    await service.complete("code", state)

    expect(requests[0]).toBe("https://api.instagram.com/oauth/access_token")
    expect(requests[1]).toContain("https://graph.instagram.com/access_token")
    expect(await store.get("instagram")).toMatchObject({ accessToken: "long-lived", accountId: "instagram-account" })
  })

  it("does not persist a short-lived Threads token when the durable exchange fails", async () => {
    const store = await createStore()
    const fetchImpl = async (url: string | URL) => String(url).includes("/oauth/access_token")
      ? response({ access_token: "short-lived", user_id: "threads-user", expires_in: 3600 })
      : response({ error: { message: "exchange failed" } }, 400)
    const service = new ThreadsOAuthService({ appId: "app", appSecret: "secret", publicBaseUrl: "https://influence.example" }, fetchImpl, store)
    const state = new URL(service.begin()).searchParams.get("state") ?? ""

    await expect(service.complete("code", state)).rejects.toThrow("Token konnte nicht dauerhaft gemacht werden")
    expect(await store.get("threads")).toBeUndefined()
  })
})

async function createStore(): Promise<TokenStore> {
  const directory = await mkdtemp(join(tmpdir(), "influence-meta-oauth-"))
  temporaryDirectories.push(directory)
  return new TokenStore(join(directory, "tokens.json"))
}

function storePath(store: TokenStore): string {
  return (store as unknown as { path: string }).path
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
}
