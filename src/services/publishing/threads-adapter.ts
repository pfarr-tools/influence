import { randomUUID } from "node:crypto"

import type { PublicationAdapter, PublicationPayload, PublicationPlatform, PublicationResult } from "./types.js"

const defaultGraphApiBaseUrl = "https://graph.threads.net"
const defaultGraphApiVersion = "v1.0"
const threadsScopes = "threads_basic,threads_content_publish"
const oauthStateLifetimeMs = 10 * 60 * 1000

export const threadsOAuthCallbackPath = "/publish/threads/oauth/callback"

export interface ThreadsAdapterConfig {
  accessToken: string
  userId?: string
  publicBaseUrl: string
  graphApiBaseUrl?: string
  graphApiVersion?: string
  pollIntervalMs?: number
  maxPollAttempts?: number
}

export interface ThreadsOAuthConfig {
  appId: string
  appSecret: string
  publicBaseUrl: string
  graphApiBaseUrl?: string
  authorizationBaseUrl?: string
}

interface ThreadsFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

interface ThreadsFetch {
  (input: string | URL, init?: RequestInit): Promise<ThreadsFetchResponse>
}

interface ThreadsOAuthState {
  redirectUri: string
  expiresAt: number
}

/** Publishes text, image, and carousel posts through the native Threads API. */
export class ThreadsPublicationAdapter implements PublicationAdapter {
  readonly platform: PublicationPlatform = "threads"

  constructor(
    private readonly config: ThreadsAdapterConfig,
    private readonly fetchImpl: ThreadsFetch = fetch,
    private readonly sleepImpl: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    this.assertConfigured()
    if (payload.assetPaths.length > 20) throw new Error("threads: Ein Carousel darf höchstens zwanzig Bilder enthalten.")

    const children: string[] = []
    if (payload.assetPaths.length > 1) {
      for (const [index, assetPath] of payload.assetPaths.entries()) {
        const child = await this.createContainer({
          media_type: "IMAGE",
          image_url: this.publicAssetUrl(assetPath, payload.job.contentDate, payload.job.postId),
          alt_text: payload.job.altTexts[index] ?? payload.job.altTexts[0] ?? ""
        })
        await this.waitUntilFinished(child)
        children.push(child)
      }
    }

    const parent = payload.assetPaths.length === 0
      ? await this.createContainer({ media_type: "TEXT", text: payload.job.text })
      : payload.assetPaths.length === 1
        ? await this.createContainer({
            media_type: "IMAGE",
            image_url: this.publicAssetUrl(payload.assetPaths[0]!, payload.job.contentDate, payload.job.postId),
            text: payload.job.text,
            alt_text: payload.job.altTexts[0] ?? ""
          })
        : await this.createContainer({ media_type: "CAROUSEL", children: children.join(","), text: payload.job.text })

    await this.waitUntilFinished(parent)
    const published = await this.publishContainer(parent)
    return { remoteId: published, metadata: { mediaCount: payload.assetPaths.length, mediaType: payload.assetPaths.length > 1 ? "CAROUSEL" : payload.assetPaths.length === 1 ? "IMAGE" : "TEXT", status: 200 } }
  }

  private assertConfigured(): void {
    if (!this.config.accessToken) throw new Error("threads: Zugangstoken fehlt.")
    if (!this.config.publicBaseUrl) throw new Error("threads: PUBLIC_BASE_URL fehlt; Threads benötigt öffentlich erreichbare Bild-URLs.")
  }

  private endpoint(path: string): string {
    const base = (this.config.graphApiBaseUrl || defaultGraphApiBaseUrl).replace(/\/+$/, "")
    const version = (this.config.graphApiVersion || defaultGraphApiVersion).replace(/^\/+|\/+$/g, "")
    return `${base}/${version}/${this.config.userId || "me"}${path}`
  }

  private publicAssetUrl(assetPath: string, contentDate: string, postId: string): string {
    const name = assetPath.split("\\").join("/").split("/").at(-1) ?? assetPath
    return `${this.config.publicBaseUrl.replace(/\/+$/, "")}/files/${[contentDate, postId, name].map(encodeURIComponent).join("/")}`
  }

  private async createContainer(parameters: Record<string, string>): Promise<string> {
    const body = new URLSearchParams({ ...parameters, access_token: this.config.accessToken })
    const response = await this.fetchImpl(this.endpoint("/threads"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.id !== "string") throw new Error(`threads: Container konnte nicht erstellt werden (${response.status}): ${getApiError(result)}`)
    return result.id
  }

  private async publishContainer(containerId: string): Promise<string> {
    const body = new URLSearchParams({ creation_id: containerId, access_token: this.config.accessToken })
    const response = await this.fetchImpl(this.endpoint("/threads_publish"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.id !== "string") throw new Error(`threads: Container konnte nicht veröffentlicht werden (${response.status}): ${getApiError(result)}`)
    return result.id
  }

  private async waitUntilFinished(containerId: string): Promise<void> {
    const maxAttempts = this.config.maxPollAttempts ?? 30
    const interval = this.config.pollIntervalMs ?? 2000
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const url = new URL(this.containerEndpoint(containerId))
      url.searchParams.set("fields", "status")
      url.searchParams.set("access_token", this.config.accessToken)
      const response = await this.fetchImpl(url)
      const result = await readJsonResponse(response)
      if (!response.ok || !isRecord(result)) throw new Error(`threads: Containerstatus konnte nicht gelesen werden (${response.status}): ${getApiError(result)}`)
      const status = typeof result.status === "string" ? result.status : typeof result.status_code === "string" ? result.status_code : ""
      if (status === "FINISHED") return
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`threads: Medien-Container ist ${status}.`)
      if (attempt < maxAttempts - 1) await this.sleepImpl(interval)
    }
    throw new Error(`threads: Medien-Container ${containerId} wurde nicht rechtzeitig fertig.`)
  }

  private containerEndpoint(containerId: string): string {
    const base = (this.config.graphApiBaseUrl || defaultGraphApiBaseUrl).replace(/\/+$/, "")
    const version = (this.config.graphApiVersion || defaultGraphApiVersion).replace(/^\/+|\/+$/g, "")
    return `${base}/${version}/${containerId}`
  }
}

/** Handles Threads OAuth without persisting credentials in the application. */
export class ThreadsOAuthService {
  private readonly states = new Map<string, ThreadsOAuthState>()

  constructor(private readonly config: ThreadsOAuthConfig, private readonly fetchImpl: ThreadsFetch = fetch) {}

  begin(): string {
    const state = randomUUID()
    const redirectUri = this.redirectUri()
    this.states.set(state, { redirectUri, expiresAt: Date.now() + oauthStateLifetimeMs })
    const url = new URL(`${(this.config.authorizationBaseUrl || "https://threads.net").replace(/\/+$/, "")}/oauth/authorize`)
    url.searchParams.set("client_id", this.config.appId)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("scope", threadsScopes)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("state", state)
    return url.toString()
  }

  async complete(code: string, state: string): Promise<{ accessToken: string; userId: string; expiresIn?: number }> {
    const pending = this.states.get(state)
    this.states.delete(state)
    if (!pending || pending.expiresAt < Date.now()) throw new Error("threads: OAuth-Status ist ungültig oder abgelaufen.")
    const body = new URLSearchParams({ client_id: this.config.appId, client_secret: this.config.appSecret, code, grant_type: "authorization_code", redirect_uri: pending.redirectUri })
    const response = await this.fetchImpl(`${this.graphEndpoint()}/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.access_token !== "string" || typeof result.user_id !== "string") throw new Error(`threads: OAuth-Token konnte nicht abgerufen werden (${response.status}): ${getApiError(result)}`)
    let accessToken = result.access_token
    let expiresIn = typeof result.expires_in === "number" ? result.expires_in : undefined
    const longLivedUrl = new URL(`${this.graphEndpoint()}/access_token`)
    longLivedUrl.searchParams.set("grant_type", "th_exchange_token")
    longLivedUrl.searchParams.set("client_secret", this.config.appSecret)
    longLivedUrl.searchParams.set("access_token", accessToken)
    const longLivedResponse = await this.fetchImpl(longLivedUrl)
    const longLived = await readJsonResponse(longLivedResponse)
    if (longLivedResponse.ok && isRecord(longLived) && typeof longLived.access_token === "string") {
      accessToken = longLived.access_token
      expiresIn = typeof longLived.expires_in === "number" ? longLived.expires_in : expiresIn
    }
    return { accessToken, userId: result.user_id, expiresIn }
  }

  redirectUri(): string { return `${this.config.publicBaseUrl.replace(/\/+$/, "")}${threadsOAuthCallbackPath}` }
  private graphEndpoint(): string { return (this.config.graphApiBaseUrl || defaultGraphApiBaseUrl).replace(/\/+$/, "") }
}

export function createThreadsOAuthService(environment: Record<string, string | undefined> = process.env): ThreadsOAuthService | undefined {
  const appId = environment.THREADS_APP_ID?.trim()
  const appSecret = environment.THREADS_APP_SECRET?.trim()
  const publicBaseUrl = environment.PUBLIC_BASE_URL?.trim()
  if (!appId || !appSecret || !publicBaseUrl) return undefined
  return new ThreadsOAuthService({ appId, appSecret, publicBaseUrl, graphApiBaseUrl: environment.THREADS_GRAPH_API_URL?.trim() })
}

async function readJsonResponse(response: ThreadsFetchResponse): Promise<unknown> { try { return await response.json() } catch { return { error: (await response.text()).slice(0, 300) } } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }
function getApiError(value: unknown): string {
  if (!isRecord(value)) return "Unbekannter API-Fehler."
  if (typeof value.error === "string") return value.error
  if (isRecord(value.error) && typeof value.error.message === "string") return value.error.message
  if (typeof value.error_description === "string") return value.error_description
  if (typeof value.error_message === "string") return value.error_message
  return "Unbekannter API-Fehler."
}
