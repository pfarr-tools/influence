import type { PublicationAdapter, PublicationPayload, PublicationResult } from "./types.js"

const defaultGraphApiBaseUrl = "https://graph.facebook.com"
const defaultGraphApiVersion = "v23.0"

export interface FacebookPageAdapterConfig {
  accessToken: string
  pageId: string
  publicBaseUrl: string
  graphApiBaseUrl?: string
  graphApiVersion?: string
}

interface FacebookFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

interface FacebookFetch {
  (input: string | URL, init?: RequestInit): Promise<FacebookFetchResponse>
}

/** Publishes the generated Facebook landscape render to a Facebook Page. */
export class FacebookPagePublicationAdapter implements PublicationAdapter {
  readonly platform = "facebook" as const
  private pageAccessToken: string | null = null

  constructor(
    private readonly config: FacebookPageAdapterConfig,
    private readonly fetchImpl: FacebookFetch = fetch
  ) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    this.assertConfigured()
    const assetPath = payload.assetPaths[0]
    if (!assetPath) throw new Error("facebook: Für einen Page-Post wird ein gerendertes Bild benötigt.")

    const body = new URLSearchParams({
      access_token: await this.resolvePageAccessToken(),
      caption: payload.job.text,
      published: "true",
      url: this.publicAssetUrl(assetPath, payload.job.contentDate, payload.job.postId)
    })
    const response = await this.fetchImpl(this.endpoint("/photos"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result)) {
      throw new Error(`facebook: Page-Post konnte nicht veröffentlicht werden (${response.status}): ${getApiError(result)}`)
    }

    const remoteId = typeof result.post_id === "string" ? result.post_id : typeof result.id === "string" ? result.id : ""
    if (!remoteId) throw new Error(`facebook: Page-Post lieferte keine ID (${response.status}): ${getApiError(result)}`)
    return { remoteId, metadata: { mediaCount: 1, mediaType: "PHOTO", status: response.status } }
  }

  private async resolvePageAccessToken(): Promise<string> {
    if (this.pageAccessToken) return this.pageAccessToken

    const accountsUrl = new URL(this.endpoint("/../me/accounts"))
    accountsUrl.searchParams.set("fields", "id,access_token,tasks")
    accountsUrl.searchParams.set("access_token", this.config.accessToken)
    const response = await this.fetchImpl(accountsUrl, { method: "GET" })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || !Array.isArray(result.data)) {
      throw new Error(`facebook: Page-Token konnte nicht ermittelt werden (${response.status}): ${getApiError(result)}`)
    }

    const page = result.data.find((entry) => (
      isRecord(entry) && entry.id === this.config.pageId && typeof entry.access_token === "string"
    ))
    if (!isRecord(page) || typeof page.access_token !== "string") {
      throw new Error(`facebook: Keine passende Page mit veröffentlichbarem Token für ${this.config.pageId} gefunden.`)
    }

    this.pageAccessToken = page.access_token
    return this.pageAccessToken
  }

  private assertConfigured(): void {
    if (!this.config.accessToken || !this.config.pageId) throw new Error("facebook: Page-ID oder Page-Access-Token fehlt.")
    if (!this.config.publicBaseUrl) throw new Error("facebook: PUBLIC_BASE_URL fehlt; Meta benötigt eine öffentlich erreichbare Bild-URL.")
  }

  private endpoint(path: string): string {
    const base = (this.config.graphApiBaseUrl || defaultGraphApiBaseUrl).replace(/\/+$/, "")
    const version = (this.config.graphApiVersion || defaultGraphApiVersion).replace(/^\/+|\/+$/g, "")
    return `${base}/${version}/${this.config.pageId}${path}`
  }

  private publicAssetUrl(assetPath: string, contentDate: string, postId: string): string {
    const relativeAssetPath = assetPath.split("\\").join("/").split("/").at(-1) ?? assetPath
    return `${this.config.publicBaseUrl.replace(/\/+$/, "")}/files/${[contentDate, postId, relativeAssetPath].map(encodeURIComponent).join("/")}`
  }
}

async function readJsonResponse(response: FacebookFetchResponse): Promise<unknown> {
  try { return await response.json() } catch { return { error: (await response.text()).slice(0, 300) } }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }

function getApiError(value: unknown): string {
  if (!isRecord(value)) return "Unbekannter API-Fehler."
  if (typeof value.error === "string") return value.error
  if (isRecord(value.error) && typeof value.error.message === "string") return value.error.message
  return "Unbekannter API-Fehler."
}
