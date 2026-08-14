import type { PublicationAdapter, PublicationPayload, PublicationResult } from "./types.js"

const defaultGraphApiBaseUrl = "https://graph.instagram.com"
const defaultGraphApiVersion = "v23.0"

export interface InstagramAdapterConfig {
  accessToken: string
  accountId: string
  publicBaseUrl: string
  graphApiBaseUrl?: string
  graphApiVersion?: string
  pollIntervalMs?: number
  maxPollAttempts?: number
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

interface InstagramContainer {
  id: string
  statusCode?: string
}

/** Publishes one rendered Instagram feed carousel through Meta's Graph API. */
export class InstagramPostPublicationAdapter implements PublicationAdapter {
  readonly platform = "instagram" as const

  constructor(
    protected readonly config: InstagramAdapterConfig,
    protected readonly fetchImpl: InstagramFetch = fetch,
    protected readonly sleepImpl: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    this.assertConfigured()
    if (payload.assetPaths.length < 2) throw new Error("instagram: Ein Feed-Post benötigt mindestens zwei gerenderte Carousel-Bilder.")
    if (payload.assetPaths.length > 10) throw new Error("instagram: Ein Carousel darf höchstens zehn Bilder enthalten.")

    const childIds: string[] = []
    for (const assetPath of payload.assetPaths) {
      const child = await this.createContainer({
        image_url: this.publicAssetUrl(assetPath, payload.job.contentDate, payload.job.postId),
        media_type: "IMAGE",
        is_carousel_item: "true"
      })
      await this.waitUntilFinished(child.id)
      childIds.push(child.id)
    }

    const carousel = await this.createContainer({
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: payload.job.text
    })
    await this.waitUntilFinished(carousel.id)
    const published = await this.publishContainer(carousel.id)
    return {
      remoteId: published,
      metadata: { mediaCount: childIds.length, mediaType: "CAROUSEL", status: 200 }
    }
  }

  protected assertConfigured(): void {
    if (!this.config.accessToken || !this.config.accountId) throw new Error("instagram: Zugangsdaten oder Instagram-Konto fehlen.")
    if (!this.config.publicBaseUrl) throw new Error("instagram: PUBLIC_BASE_URL fehlt; Meta benötigt öffentlich erreichbare Bild-URLs.")
  }

  protected endpoint(path: string): string {
    const base = (this.config.graphApiBaseUrl || defaultGraphApiBaseUrl).replace(/\/+$/, "")
    const version = (this.config.graphApiVersion || defaultGraphApiVersion).replace(/^\/+|\/+$/g, "")
    return `${base}/${version}/${this.config.accountId}${path}`
  }

  protected publicAssetUrl(assetPath: string, contentDate: string, postId: string): string {
    const relativeAssetPath = assetPath.split("\\").join("/").split("/").at(-1) ?? assetPath
    return `${this.config.publicBaseUrl.replace(/\/+$/, "")}/files/${[contentDate, postId, relativeAssetPath].map(encodeURIComponent).join("/")}`
  }

  private async createContainer(parameters: Record<string, string>): Promise<InstagramContainer> {
    const body = new URLSearchParams({ ...parameters, access_token: this.config.accessToken })
    const response = await this.fetchImpl(this.endpoint("/media"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.id !== "string") {
      throw new Error(`instagram: Medien-Container konnte nicht erstellt werden (${response.status}): ${getApiError(result)}`)
    }
    return { id: result.id }
  }

  private async publishContainer(containerId: string): Promise<string> {
    const attempts = 4
    const delay = this.config.pollIntervalMs ?? 2000
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await this.sleepImpl(delay)
      const body = new URLSearchParams({ creation_id: containerId, access_token: this.config.accessToken })
      const response = await this.fetchImpl(this.endpoint("/media_publish"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      })
      const result = await readJsonResponse(response)
      if (response.ok && isRecord(result) && typeof result.id === "string") return result.id
      const apiError = getApiError(result)
      if (!apiError.toLowerCase().includes("media id is not available") || attempt === attempts - 1) {
        throw new Error(`instagram: Container konnte nicht veröffentlicht werden (${response.status}): ${apiError}`)
      }
    }
    throw new Error("instagram: Container konnte nicht veröffentlicht werden.")
  }

  protected async waitUntilFinished(containerId: string): Promise<void> {
    const maxAttempts = this.config.maxPollAttempts ?? 30
    const interval = this.config.pollIntervalMs ?? 2000
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const url = new URL(this.endpointForContainer(containerId))
      url.searchParams.set("fields", "status_code,status")
      url.searchParams.set("access_token", this.config.accessToken)
      const response = await this.fetchImpl(url)
      const result = await readJsonResponse(response)
      if (!response.ok || !isRecord(result)) throw new Error(`instagram: Containerstatus konnte nicht gelesen werden (${response.status}): ${getApiError(result)}`)
      const status = typeof result.status_code === "string" ? result.status_code : typeof result.status === "string" ? result.status : ""
      if (status === "FINISHED") return
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`instagram: Medien-Container ist ${status}.`)
      if (attempt < maxAttempts - 1) await this.sleepImpl(interval)
    }
    throw new Error(`instagram: Medien-Container ${containerId} wurde nicht rechtzeitig fertig.`)
  }

  private endpointForContainer(containerId: string): string {
    const base = (this.config.graphApiBaseUrl || defaultGraphApiBaseUrl).replace(/\/+$/, "")
    const version = (this.config.graphApiVersion || defaultGraphApiVersion).replace(/^\/+|\/+$/g, "")
    return `${base}/${version}/${containerId}`
  }
}

/** Publishes generated 9:16 renders as sequential Instagram Stories. */
export class InstagramStoryPublicationAdapter extends InstagramPostPublicationAdapter {
  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    this.assertConfigured()
    if (payload.assetPaths.length === 0) throw new Error("instagram: Eine Story benötigt mindestens ein gerendertes Story-Bild.")
    let remoteId = ""
    for (const assetPath of payload.assetPaths) {
      const body = new URLSearchParams({
        access_token: this.config.accessToken,
        image_url: this.publicAssetUrl(assetPath, payload.job.contentDate, payload.job.postId),
        media_type: "STORIES"
      })
      const response = await this.fetchImpl(this.endpoint("/media"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      })
      const result = await readJsonResponse(response)
      if (!response.ok || !isRecord(result) || typeof result.id !== "string") {
        throw new Error(`instagram: Story-Container konnte nicht erstellt werden (${response.status}): ${getApiError(result)}`)
      }
      await this.waitUntilFinished(result.id)
      remoteId = await this.publishContainerForStory(result.id)
    }
    return { remoteId, metadata: { mediaCount: payload.assetPaths.length, mediaType: "STORIES", status: 200 } }
  }

  private async publishContainerForStory(containerId: string): Promise<string> {
    const attempts = 4
    const delay = this.config.pollIntervalMs ?? 2000
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await this.sleepImpl(delay)
      const body = new URLSearchParams({ creation_id: containerId, access_token: this.config.accessToken })
      const response = await this.fetchImpl(this.endpoint("/media_publish"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })
      const result = await readJsonResponse(response)
      if (response.ok && isRecord(result) && typeof result.id === "string") return result.id
      const apiError = getApiError(result)
      if (!apiError.toLowerCase().includes("media id is not available") || attempt === attempts - 1) {
        throw new Error(`instagram: Story konnte nicht veröffentlicht werden (${response.status}): ${apiError}`)
      }
    }
    throw new Error("instagram: Story konnte nicht veröffentlicht werden.")
  }
}

/** Routes Instagram publication jobs to the post or story flow. */
export class InstagramPublicationAdapter implements PublicationAdapter {
  readonly platform = "instagram" as const
  private readonly postAdapter: InstagramPostPublicationAdapter
  private readonly storyAdapter: InstagramStoryPublicationAdapter

  constructor(config: InstagramAdapterConfig, fetchImpl: InstagramFetch = fetch, sleepImpl?: (milliseconds: number) => Promise<void>) {
    this.postAdapter = new InstagramPostPublicationAdapter(config, fetchImpl, sleepImpl)
    this.storyAdapter = new InstagramStoryPublicationAdapter(config, fetchImpl, sleepImpl)
  }

  publish(payload: PublicationPayload): Promise<PublicationResult> {
    return payload.job.format === "story" ? this.storyAdapter.publish(payload) : this.postAdapter.publish(payload)
  }
}

async function readJsonResponse(response: InstagramFetchResponse): Promise<unknown> {
  try { return await response.json() } catch { return { error: (await response.text()).slice(0, 300) } }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }

function getApiError(value: unknown): string {
  if (!isRecord(value)) return "Unbekannter API-Fehler."
  if (typeof value.error === "string") return value.error
  if (isRecord(value.error) && typeof value.error.message === "string") return value.error.message
  if (typeof value.error_description === "string") return value.error_description
  return "Unbekannter API-Fehler."
}
