import type { StoredToken, TokenProvider, TokenStore } from "./token-store.js"

const defaultThreadsApiBaseUrl = "https://graph.threads.net"
const defaultInstagramApiBaseUrl = "https://graph.instagram.com"
const defaultRefreshWindowMs = 7 * 24 * 60 * 60 * 1000

export interface MetaTokenRefreshConfig {
  threadsApiBaseUrl?: string
  instagramApiBaseUrl?: string
  refreshWindowMs?: number
}

interface MetaFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

interface MetaFetch {
  (input: string | URL, init?: RequestInit): Promise<MetaFetchResponse>
}

interface TokenStoreLike {
  save(record: StoredToken): Promise<void>
}

export async function refreshThreadsToken(record: StoredToken, config: MetaTokenRefreshConfig = {}, fetchImpl: MetaFetch = fetch, now = new Date()): Promise<StoredToken> {
  return refreshToken(record, `${config.threadsApiBaseUrl || defaultThreadsApiBaseUrl}/refresh_access_token`, "th_refresh_token", fetchImpl, now)
}

export async function refreshInstagramToken(record: StoredToken, config: MetaTokenRefreshConfig = {}, fetchImpl: MetaFetch = fetch, now = new Date()): Promise<StoredToken> {
  return refreshToken(record, `${config.instagramApiBaseUrl || defaultInstagramApiBaseUrl}/refresh_access_token`, "ig_refresh_token", fetchImpl, now)
}

/** Refreshes valid Meta tokens once per provider and persists rotation. */
export class MetaTokenRefreshService {
  private readonly inFlight = new Map<TokenProvider, Promise<StoredToken>>()

  constructor(
    private readonly store: TokenStoreLike | TokenStore,
    private readonly config: MetaTokenRefreshConfig = {},
    private readonly fetchImpl: MetaFetch = fetch,
    private readonly nowImpl: () => Date = () => new Date()
  ) {}

  async getOrRefreshToken(record: StoredToken): Promise<StoredToken> {
    const now = this.nowImpl()
    const expiresAt = Date.parse(record.expiresAt)
    const refreshWindowMs = this.config.refreshWindowMs ?? defaultRefreshWindowMs
    if (expiresAt - now.getTime() > refreshWindowMs) return record

    const existing = this.inFlight.get(record.provider)
    if (existing) return existing

    const refresh = this.refreshAndPersist(record, now)
    this.inFlight.set(record.provider, refresh)
    try {
      return await refresh
    } finally {
      if (this.inFlight.get(record.provider) === refresh) this.inFlight.delete(record.provider)
    }
  }

  private async refreshAndPersist(record: StoredToken, now: Date): Promise<StoredToken> {
    try {
      const refreshed = record.provider === "threads"
        ? await refreshThreadsToken(record, this.config, this.fetchImpl, now)
        : await refreshInstagramToken(record, this.config, this.fetchImpl, now)
      await this.store.save(refreshed)
      return refreshed
    } catch (error) {
      if (Date.parse(record.expiresAt) > now.getTime()) return record
      throw new Error(`${record.provider}: Token abgelaufen oder ungültig; bitte über den OAuth-Dialog erneut verbinden.`)
    }
  }
}

async function refreshToken(record: StoredToken, endpoint: string, grantType: string, fetchImpl: MetaFetch, now: Date): Promise<StoredToken> {
  const url = new URL(endpoint)
  url.searchParams.set("grant_type", grantType)
  url.searchParams.set("access_token", record.accessToken)
  const response = await fetchImpl(url)
  const result = await readJsonResponse(response)
  if (!response.ok || !isRecord(result) || typeof result.access_token !== "string" || typeof result.expires_in !== "number" || result.expires_in <= 0) {
    throw new Error("Meta-Token konnte nicht erneuert werden.")
  }
  return {
    ...record,
    accessToken: result.access_token,
    expiresAt: new Date(now.getTime() + result.expires_in * 1000).toISOString()
  }
}

async function readJsonResponse(response: MetaFetchResponse): Promise<unknown> {
  try { return await response.json() } catch { return { error: (await response.text()).slice(0, 300) } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
