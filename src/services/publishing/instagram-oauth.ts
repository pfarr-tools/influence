import { randomUUID } from "node:crypto"

import { defaultTokenStorePath, TokenStore } from "./token-store.js"

const defaultAuthorizationBaseUrl = "https://www.instagram.com"
const defaultTokenBaseUrl = "https://api.instagram.com"
const defaultGraphApiBaseUrl = "https://graph.instagram.com"
const scopes = "instagram_business_basic,instagram_business_content_publish"
const oauthStateLifetimeMs = 10 * 60 * 1000

export const instagramOAuthCallbackPath = "/publish/instagram/oauth/callback"

export interface InstagramOAuthConfig {
  appId: string
  appSecret: string
  publicBaseUrl: string
  authorizationBaseUrl?: string
  tokenBaseUrl?: string
  graphApiBaseUrl?: string
}

interface InstagramFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

interface InstagramFetch {
  (input: string | URL, init?: RequestInit): Promise<InstagramFetchResponse>
}

interface OAuthState {
  redirectUri: string
  expiresAt: number
}

/** Handles Instagram Business Login and persists long-lived credentials. */
export class InstagramOAuthService {
  private readonly states = new Map<string, OAuthState>()

  constructor(
    private readonly config: InstagramOAuthConfig,
    private readonly fetchImpl: InstagramFetch = fetch,
    private readonly tokenStore?: TokenStore
  ) {}

  begin(): string {
    const state = randomUUID()
    const redirectUri = this.redirectUri()
    this.states.set(state, { redirectUri, expiresAt: Date.now() + oauthStateLifetimeMs })
    const url = new URL(`${(this.config.authorizationBaseUrl || defaultAuthorizationBaseUrl).replace(/\/+$/, "")}/oauth/authorize`)
    url.searchParams.set("client_id", this.config.appId)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("scope", scopes)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("state", state)
    return url.toString()
  }

  async complete(code: string, state: string): Promise<{ accessToken: string; userId: string; expiresIn: number }> {
    const pending = this.states.get(state)
    this.states.delete(state)
    if (!pending || pending.expiresAt < Date.now()) throw new Error("instagram: OAuth-Status ist ungültig oder abgelaufen.")

    const body = new URLSearchParams({ client_id: this.config.appId, client_secret: this.config.appSecret, grant_type: "authorization_code", redirect_uri: pending.redirectUri, code })
    const response = await this.fetchImpl(`${(this.config.tokenBaseUrl || defaultTokenBaseUrl).replace(/\/+$/, "")}/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })
    const result = await readJsonResponse(response)
    const userId = isRecord(result) && (typeof result.user_id === "string" || typeof result.user_id === "number") ? String(result.user_id) : undefined
    if (!response.ok || !isRecord(result) || typeof result.access_token !== "string" || !userId) throw new Error(`instagram: OAuth-Token konnte nicht abgerufen werden (${response.status}).`)

    const longLivedUrl = new URL(`${(this.config.graphApiBaseUrl || defaultGraphApiBaseUrl).replace(/\/+$/, "")}/access_token`)
    longLivedUrl.searchParams.set("grant_type", "ig_exchange_token")
    longLivedUrl.searchParams.set("client_secret", this.config.appSecret)
    longLivedUrl.searchParams.set("access_token", result.access_token)
    const longLivedResponse = await this.fetchImpl(longLivedUrl)
    const longLived = await readJsonResponse(longLivedResponse)
    if (!longLivedResponse.ok || !isRecord(longLived) || typeof longLived.access_token !== "string" || typeof longLived.expires_in !== "number" || longLived.expires_in <= 0) throw new Error(`instagram: Long-lived Token konnte nicht abgerufen werden (${longLivedResponse.status}).`)

    const token = { accessToken: longLived.access_token, userId, expiresIn: longLived.expires_in }
    await this.tokenStore?.save({ provider: "instagram", accessToken: token.accessToken, accountId: token.userId, expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString() })
    return token
  }

  redirectUri(): string { return `${this.config.publicBaseUrl.replace(/\/+$/, "")}${instagramOAuthCallbackPath}` }
}

export function createInstagramOAuthService(environment: Record<string, string | undefined> = process.env): InstagramOAuthService | undefined {
  const appId = environment.INSTAGRAM_APP_ID?.trim()
  const appSecret = environment.INSTAGRAM_APP_SECRET?.trim()
  const publicBaseUrl = environment.PUBLIC_BASE_URL?.trim()
  if (!appId || !appSecret || !publicBaseUrl) return undefined
  const store = new TokenStore(environment.TOKEN_STORE_PATH?.trim() || defaultTokenStorePath)
  return new InstagramOAuthService({ appId, appSecret, publicBaseUrl, graphApiBaseUrl: environment.INSTAGRAM_GRAPH_API_URL?.trim() }, fetch, store)
}

async function readJsonResponse(response: InstagramFetchResponse): Promise<unknown> { try { return await response.json() } catch { return { error: (await response.text()).slice(0, 300) } } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }
