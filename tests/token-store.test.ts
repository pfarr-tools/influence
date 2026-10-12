import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { TokenStore, type StoredToken } from "../src/services/publishing/token-store.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("TokenStore", () => {
  it("saves provider-isolated credentials with restrictive permissions and loads them", async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, "tokens.json")
    const store = new TokenStore(path)
    const instagram = token("instagram", "instagram-token", "instagram-account")
    const threads = token("threads", "threads-token", "threads-user")

    await store.save(instagram)
    await store.save(threads)

    expect(await store.get("instagram")).toEqual(instagram)
    expect(await store.get("threads")).toEqual(threads)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it("replaces the file atomically without leaving temporary files", async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, "nested", "tokens.json")
    const store = new TokenStore(path)

    await store.save(token("threads", "first", "user"))
    await store.save(token("threads", "second", "user"))

    expect(await readFile(path, "utf8")).toContain("second")
    expect((await readdir(join(directory, "nested"))).filter((entry) => entry.includes("tmp")).length).toBe(0)
  })

  it("does not return malformed records or expose their secret values", async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, "tokens.json")
    await writeFile(path, JSON.stringify({ instagram: { provider: "instagram", accessToken: "must-not-leak" } }))
    const store = new TokenStore(path)

    expect(await store.get("instagram")).toBeUndefined()
    await store.remove("instagram")
    expect(await readFile(path, "utf8")).not.toContain("must-not-leak")
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "influence-token-store-"))
  temporaryDirectories.push(directory)
  return directory
}

function token(provider: StoredToken["provider"], accessToken: string, accountId: string): StoredToken {
  return { provider, accessToken, accountId, expiresAt: "2026-12-01T00:00:00.000Z" }
}
