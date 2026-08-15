import { extname } from "node:path"
import { readFile } from "node:fs/promises"
import sharp from "sharp"

import type { PublicationAdapter, PublicationPayload, PublicationPlatform, PublicationResult } from "./types.js"

const defaultServiceUrl = "https://bsky.social"
const maxImages = 4
const maxTextGraphemes = 300
const maxBlobBytes = 2_000_000

export interface BlueskyAdapterConfig {
  serviceUrl?: string
  accessToken?: string
  identifier?: string
  appPassword?: string
  repo?: string
}

interface BlueskyFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

interface BlueskyFetch {
  (input: string | URL, init?: RequestInit): Promise<BlueskyFetchResponse>
}

/** Publishes native AT Protocol posts with local images through Bluesky's XRPC API. */
export class BlueskyPublicationAdapter implements PublicationAdapter {
  readonly platform: PublicationPlatform = "bluesky"

  constructor(
    private readonly config: BlueskyAdapterConfig,
    private readonly fetchImpl: BlueskyFetch = fetch,
    private readonly readFileImpl: typeof readFile = readFile
  ) {}

  async publish(payload: PublicationPayload): Promise<PublicationResult> {
    const text = payload.content.platforms.bluesky.text
    if (countGraphemes(text) > maxTextGraphemes) {
      throw new Error("bluesky: Der Beitrag darf höchstens 300 Zeichen enthalten.")
    }
    const assetPaths = payload.assetPaths
    if (assetPaths.length > maxImages) {
      throw new Error("bluesky: Ein Beitrag darf höchstens vier Bilder enthalten.")
    }

    const session = await this.getSession()
    const images = [] as Array<{ alt: string; image: unknown }>
    for (const [index, assetPath] of assetPaths.entries()) {
      images.push({
        alt: payload.job.altTexts[index] ?? payload.job.altTexts[0] ?? "",
        image: await this.uploadBlob(assetPath, session.accessJwt)
      })
    }

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString()
    }
    if (images.length > 0) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: images.map(({ alt, image }) => ({ alt, image }))
      }
    }

    const response = await this.fetchImpl(this.endpoint("/xrpc/com.atproto.repo.createRecord"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessJwt}`,
        "content-type": "application/json",
        "idempotency-key": payload.job.id
      },
      body: JSON.stringify({ repo: session.repo, collection: "app.bsky.feed.post", record })
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.uri !== "string") {
      throw new Error(`bluesky: Beitrag konnte nicht veröffentlicht werden (${response.status}): ${getApiError(result)}`)
    }

    const rkey = result.uri.split("/").at(-1)
    return {
      remoteId: result.uri,
      remoteUrl: rkey ? `https://bsky.app/profile/${encodeURIComponent(session.repo)}/post/${encodeURIComponent(rkey)}` : undefined,
      metadata: { status: response.status, mediaCount: images.length }
    }
  }

  private async getSession(): Promise<{ accessJwt: string; repo: string }> {
    if (this.config.accessToken && this.config.repo) return { accessJwt: this.config.accessToken, repo: this.config.repo }
    if (!this.config.identifier || !this.config.appPassword) {
      throw new Error("bluesky: Zugangsdaten fehlen. BLUESKY_ACCESS_TOKEN und BLUESKY_REPO oder BLUESKY_IDENTIFIER und BLUESKY_APP_PASSWORD setzen.")
    }
    const response = await this.fetchImpl(this.endpoint("/xrpc/com.atproto.server.createSession"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: this.config.identifier, password: this.config.appPassword })
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || typeof result.accessJwt !== "string" || typeof result.did !== "string") {
      throw new Error(`bluesky: Sitzung konnte nicht erstellt werden (${response.status}): ${getApiError(result)}`)
    }
    return { accessJwt: result.accessJwt, repo: this.config.repo || result.did }
  }

  private async uploadBlob(assetPath: string, accessToken: string): Promise<unknown> {
    const originalBytes = await this.readFileImpl(assetPath)
    const { bytes, mimeType } = await prepareBlueskyImage(originalBytes, mimeTypeFor(assetPath))
    const response = await this.fetchImpl(this.endpoint("/xrpc/com.atproto.repo.uploadBlob"), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": mimeType },
      body: bytes as unknown as BodyInit
    })
    const result = await readJsonResponse(response)
    if (!response.ok || !isRecord(result) || !isRecord(result.blob)) {
      throw new Error(`bluesky: Bild-Upload fehlgeschlagen (${response.status}): ${getApiError(result)}`)
    }
    return result.blob
  }

  private endpoint(path: string): string {
    return `${(this.config.serviceUrl || defaultServiceUrl).replace(/\/+$/, "")}${path}`
  }
}

async function prepareBlueskyImage(
  bytes: Buffer,
  mimeType: string
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (bytes.byteLength <= maxBlobBytes) return { bytes, mimeType }

  const metadata = await sharp(bytes).metadata()
  let width = metadata.width ?? 1600
  let height = metadata.height ?? 1600
  let quality = 85
  let compressed = await sharp(bytes).jpeg({ quality, mozjpeg: true }).toBuffer()
  for (let attempt = 0; compressed.byteLength > maxBlobBytes && attempt < 12; attempt += 1) {
    if (attempt > 0) {
      const scale = Math.sqrt(maxBlobBytes / compressed.byteLength) * 0.9
      width = Math.max(1, Math.floor(width * scale))
      height = Math.max(1, Math.floor(height * scale))
      quality = Math.max(45, quality - 5)
    }
    compressed = await sharp(bytes)
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
  }
  if (compressed.byteLength > maxBlobBytes) {
    throw new Error(`bluesky: Bild konnte nicht unter das 2-MB-Limit komprimiert werden (${compressed.byteLength} Bytes).`)
  }
  return { bytes: compressed, mimeType: "image/jpeg" }
}

export function createBlueskyAdapter(environment: Record<string, string | undefined> = process.env): BlueskyPublicationAdapter | undefined {
  const accessToken = environment.BLUESKY_ACCESS_TOKEN?.trim()
  const identifier = environment.BLUESKY_IDENTIFIER?.trim()
  const appPassword = environment.BLUESKY_APP_PASSWORD?.trim()
  const repo = environment.BLUESKY_REPO?.trim()
  if ((!accessToken || !repo) && (!identifier || !appPassword)) return undefined
  return new BlueskyPublicationAdapter({
    serviceUrl: environment.BLUESKY_SERVICE_URL?.trim(),
    accessToken,
    identifier,
    appPassword,
    repo
  })
}

function mimeTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg"
    case ".webp": return "image/webp"
    case ".gif": return "image/gif"
    default: return "image/png"
  }
}

function countGraphemes(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length
}

async function readJsonResponse(response: BlueskyFetchResponse): Promise<unknown> {
  try { return await response.json() } catch { return { error: (await response.text()).slice(0, 300) } }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }

function getApiError(value: unknown): string {
  if (!isRecord(value)) return "Unbekannter API-Fehler."
  if (typeof value.message === "string") return value.message
  if (typeof value.error === "string") return value.error
  if (isRecord(value.error)) {
    const message = typeof value.error.message === "string" ? value.error.message : "Unbekannter API-Fehler."
    const code = typeof value.error.code === "number" ? ` (Code ${value.error.code})` : ""
    return `${message}${code}`
  }
  return "Unbekannter API-Fehler."
}
