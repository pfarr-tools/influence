import { readFile } from "node:fs/promises"

import type { PublicationAdapter, PublicationPayload, PublicationResult } from "./types.js"

const defaultApiBaseUrl = "https://api.linkedin.com"
const defaultApiVersion = "202606"

export interface LinkedInAdapterConfig {
  accessToken: string
  authorUrn: string
  apiBaseUrl?: string
  apiVersion?: string
}

interface LinkedInFetchResponse {
  ok: boolean
  status: number
  headers?: { get(name: string): string | null }
  json(): Promise<unknown>
  text(): Promise<string>
}

interface LinkedInFetch {
  (input: string | URL, init?: RequestInit): Promise<LinkedInFetchResponse>
}

/** Publishes text, image, and native multi-image posts through LinkedIn's REST API. */
export class LinkedInPublicationAdapter implements PublicationAdapter {
  readonly platform = "linkedin" as const

  constructor(
    private readonly config: LinkedInAdapterConfig,
    private readonly fetchImpl: LinkedInFetch = fetch
  ) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    this.assertConfigured()
    const assetPaths = payload.assetPaths
    if (assetPaths.length > 20) throw new Error("linkedin: Ein Multi-Image-Post darf höchstens zwanzig Bilder enthalten.")

    const images = []
    for (const [index, assetPath] of assetPaths.entries()) {
      images.push({
        id: await this.uploadImage(assetPath),
        altText: payload.job.altTexts[index] ?? payload.job.altTexts[0] ?? ""
      })
    }

    const content = images.length === 0
      ? undefined
      : images.length === 1
        ? { media: images[0] }
        : { multiImage: { images } }
    const body = {
      author: this.config.authorUrn,
      commentary: payload.job.text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {})
    }
    const response = await this.fetchImpl(this.endpoint("/rest/posts"), {
      method: "POST",
      headers: this.apiHeaders("application/json"),
      body: JSON.stringify(body)
    })
    const result = await readJsonResponse(response)
    if (!response.ok) throw new Error(`linkedin: Post konnte nicht veröffentlicht werden (${response.status}): ${getApiError(result)}`)

    const remoteId = response.headers?.get("x-restli-id") ?? (isRecord(result) && typeof result.id === "string" ? result.id : undefined)
    if (!remoteId) throw new Error("linkedin: LinkedIn hat keine Post-ID zurückgegeben.")
    return { remoteId, metadata: { mediaCount: images.length, mediaType: images.length > 1 ? "MULTI_IMAGE" : images.length === 1 ? "IMAGE" : "TEXT", status: response.status } }
  }

  private assertConfigured(): void {
    if (!this.config.accessToken) throw new Error("linkedin: Zugangstoken fehlt.")
    if (!this.config.authorUrn) throw new Error("linkedin: LINKEDIN_AUTHOR_URN fehlt.")
  }

  private async uploadImage(assetPath: string): Promise<string> {
    const initializeResponse = await this.fetchImpl(this.endpoint("/rest/images?action=initializeUpload"), {
      method: "POST",
      headers: this.apiHeaders("application/json"),
      body: JSON.stringify({ initializeUploadRequest: { owner: this.config.authorUrn } })
    })
    const initialized = await readJsonResponse(initializeResponse)
    const value = isRecord(initialized) && isRecord(initialized.value) ? initialized.value : undefined
    if (!initializeResponse.ok || !value || typeof value.uploadUrl !== "string" || typeof value.image !== "string") {
      throw new Error(`linkedin: Bild-Upload konnte nicht initialisiert werden (${initializeResponse.status}): ${getApiError(initialized)}`)
    }

    const file = await readFile(assetPath)
    const uploadResponse = await this.fetchImpl(value.uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType(assetPath) },
      body: file
    })
    if (!uploadResponse.ok) throw new Error(`linkedin: Bild konnte nicht hochgeladen werden (${uploadResponse.status}).`)
    return value.image
  }

  private endpoint(path: string): string {
    return `${(this.config.apiBaseUrl || defaultApiBaseUrl).replace(/\/+$/, "")}${path}`
  }

  private apiHeaders(contentTypeValue: string): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.accessToken}`,
      "content-type": contentTypeValue,
      "linkedin-version": this.config.apiVersion || defaultApiVersion,
      "x-restli-protocol-version": "2.0.0"
    }
  }
}

export function createLinkedInAdapter(environment: Record<string, string | undefined> = process.env): LinkedInPublicationAdapter | undefined {
  const accessToken = environment.LINKEDIN_ACCESS_TOKEN?.trim()
  const authorUrn = environment.LINKEDIN_AUTHOR_URN?.trim()
  if (!accessToken || !authorUrn) return undefined
  return new LinkedInPublicationAdapter({ accessToken, authorUrn, apiBaseUrl: environment.LINKEDIN_API_URL?.trim(), apiVersion: environment.LINKEDIN_API_VERSION?.trim() })
}

async function readJsonResponse(response: LinkedInFetchResponse): Promise<unknown> {
  const body = await response.text()
  if (!body) return {}
  try { return JSON.parse(body) as unknown } catch { return { error: body.slice(0, 300) } }
}

function contentType(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase()
  return extension === "png" ? "image/png" : extension === "gif" ? "image/gif" : "image/jpeg"
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }

function getApiError(value: unknown): string {
  if (!isRecord(value)) return "Unbekannter API-Fehler."
  if (typeof value.message === "string") return value.message
  if (typeof value.error === "string") return value.error
  if (isRecord(value.error) && typeof value.error.message === "string") return value.error.message
  return "Unbekannter API-Fehler."
}
