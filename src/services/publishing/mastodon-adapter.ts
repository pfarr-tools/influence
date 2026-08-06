import { createHash, randomBytes, randomUUID } from "node:crypto"
import { basename, extname } from "node:path"
import { readFile } from "node:fs/promises"

import type { PublicationAdapter, PublicationPayload, PublicationPlatform, PublicationResult } from "./types.js"

const mastodonScopes = "read write:statuses write:media"
const oauthStateLifetimeMs = 10 * 60 * 1000

export const mastodonOAuthCallbackPath = "/publish/mastodon/oauth/callback"

export interface MastodonAdapterConfig {
  serverUrl: string
  accessToken: string
  visibility: string
  language: string
}

export interface MastodonOAuthConfig {
  serverUrl: string
  publicBaseUrl: string
  clientName: string
  clientId?: string
  clientSecret?: string
}

interface MastodonFetchResponse {
  ok: boolean
  status: number
  headers?: { get(name: string): string | null }
  json(): Promise<unknown>
  text(): Promise<string>
}

interface MastodonFetch {
  (input: string | URL, init?: RequestInit): Promise<MastodonFetchResponse>
}

interface MastodonOAuthState {
  clientId: string
  clientSecret: string
  codeVerifier: string
  redirectUri: string
  expiresAt: number
}

/** Publishes statuses and local media directly through a Mastodon instance API. */
export class MastodonPublicationAdapter implements PublicationAdapter {
  readonly platform: PublicationPlatform = "mastodon"

  constructor(
    private readonly config: MastodonAdapterConfig,
    private readonly fetchImpl: MastodonFetch = fetch,
    private readonly readFileImpl: typeof readFile = readFile
  ) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    if (!this.config.accessToken) {
      throw new Error("mastodon: Zugangsdaten fehlen.")
    }

    const mediaIds: string[] = []
    for (const [index, assetPath] of payload.assetPaths.entries()) {
      const media = await this.uploadMedia(assetPath, payload.job.altTexts[index] ?? payload.job.altTexts[0] ?? "")
      mediaIds.push(media.id)
    }

    const body = new URLSearchParams()
    body.set("status", payload.job.text)
    body.set("visibility", this.config.visibility)
    if (this.config.language) body.set("language", this.config.language)
    for (const mediaId of mediaIds) body.append("media_ids[]", mediaId)

    const response = await this.fetchImpl(this.endpoint("/api/v1/statuses"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.accessToken}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": payload.job.id
      },
      body
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.id !== "string") {
      throw new Error(`mastodon: Veröffentlichung fehlgeschlagen (${response.status}): ${getApiError(result)}`)
    }

    return {
      remoteId: result.id,
      remoteUrl: typeof result.url === "string" ? result.url : undefined,
      metadata: { status: response.status, mediaCount: mediaIds.length }
    }
  }

  private async uploadMedia(assetPath: string, description: string): Promise<{ id: string }> {
    const bytes = await this.readFileImpl(assetPath)
    const form = new FormData()
    form.append("file", new Blob([bytes], { type: mimeTypeFor(assetPath) }), basename(assetPath))
    if (description) form.append("description", description)

    const response = await this.fetchImpl(this.endpoint("/api/v2/media"), {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.accessToken}` },
      body: form
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.id !== "string") {
      throw new Error(`mastodon: Medien-Upload fehlgeschlagen (${response.status}): ${getApiError(result)}`)
    }
    return { id: result.id }
  }

  private endpoint(path: string): string {
    return `${this.config.serverUrl.replace(/\/+$/, "")}${path}`
  }
}

/** Handles the short-lived Mastodon OAuth setup flow without persisting tokens. */
export class MastodonOAuthService {
  private readonly states = new Map<string, MastodonOAuthState>()
  private clientId: string
  private clientSecret: string

  constructor(
    private readonly config: MastodonOAuthConfig,
    private readonly fetchImpl: MastodonFetch = fetch
  ) {
    this.clientId = config.clientId?.trim() ?? ""
    this.clientSecret = config.clientSecret?.trim() ?? ""
  }

  async begin(): Promise<string> {
    const credentials = await this.ensureApplication()
    const state = randomUUID()
    const codeVerifier = randomBytes(32).toString("base64url")
    const challenge = createHash("sha256").update(codeVerifier).digest("base64url")
    const redirectUri = this.redirectUri()
    this.states.set(state, {
      ...credentials,
      codeVerifier,
      redirectUri,
      expiresAt: Date.now() + oauthStateLifetimeMs
    })

    const authorizationUrl = new URL(this.endpoint("/oauth/authorize"))
    authorizationUrl.searchParams.set("response_type", "code")
    authorizationUrl.searchParams.set("client_id", credentials.clientId)
    authorizationUrl.searchParams.set("redirect_uri", redirectUri)
    authorizationUrl.searchParams.set("scope", mastodonScopes)
    authorizationUrl.searchParams.set("state", state)
    authorizationUrl.searchParams.set("code_challenge", challenge)
    authorizationUrl.searchParams.set("code_challenge_method", "S256")
    return authorizationUrl.toString()
  }

  async complete(code: string, state: string): Promise<{ accessToken: string; scope?: string }> {
    const pending = this.states.get(state)
    this.states.delete(state)
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error("mastodon: OAuth-Status ist ungültig oder abgelaufen.")
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: pending.clientId,
      client_secret: pending.clientSecret,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier
    })
    const response = await this.fetchImpl(this.endpoint("/oauth/token"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.access_token !== "string") {
      throw new Error(`mastodon: OAuth-Token konnte nicht abgerufen werden (${response.status}): ${getApiError(result)}`)
    }
    return {
      accessToken: result.access_token,
      scope: typeof result.scope === "string" ? result.scope : undefined
    }
  }

  redirectUri(): string {
    return `${this.config.publicBaseUrl.replace(/\/+$/, "")}${mastodonOAuthCallbackPath}`
  }

  private async ensureApplication(): Promise<{ clientId: string; clientSecret: string }> {
    if (this.clientId && this.clientSecret) return { clientId: this.clientId, clientSecret: this.clientSecret }

    const body = new URLSearchParams({
      client_name: this.config.clientName,
      redirect_uris: this.redirectUri(),
      scopes: mastodonScopes,
      website: this.config.publicBaseUrl
    })
    const response = await this.fetchImpl(this.endpoint("/api/v1/apps"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.client_id !== "string" || typeof result.client_secret !== "string") {
      throw new Error(`mastodon: Anwendung konnte nicht registriert werden (${response.status}): ${getApiError(result)}`)
    }
    this.clientId = result.client_id
    this.clientSecret = result.client_secret
    return { clientId: this.clientId, clientSecret: this.clientSecret }
  }

  private endpoint(path: string): string {
    return `${this.config.serverUrl.replace(/\/+$/, "")}${path}`
  }
}

export function createMastodonOAuthService(environment: Record<string, string | undefined> = process.env): MastodonOAuthService | undefined {
  const serverUrl = environment.MASTODON_SERVER_URL?.trim()
  const publicBaseUrl = environment.PUBLIC_BASE_URL?.trim()
  if (!serverUrl || !publicBaseUrl) return undefined
  return new MastodonOAuthService({
    serverUrl,
    publicBaseUrl,
    clientName: environment.MASTODON_CLIENT_NAME?.trim() || "Influence",
    clientId: environment.MASTODON_CLIENT_ID,
    clientSecret: environment.MASTODON_CLIENT_SECRET
  })
}

function mimeTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg"
    case ".webp": return "image/webp"
    case ".gif": return "image/gif"
    case ".mp4": return "video/mp4"
    case ".mp3": return "audio/mpeg"
    case ".wav": return "audio/wav"
    case ".png":
    default: return "image/png"
  }
}

async function readJsonResponse(response: MastodonFetchResponse): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return { error: (await response.text()).slice(0, 300) }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getApiError(value: unknown): string {
  if (!isRecord(value)) return "Unbekannter API-Fehler."
  if (typeof value.error === "string") return value.error
  if (typeof value.error_description === "string") return value.error_description
  return "Unbekannter API-Fehler."
}
