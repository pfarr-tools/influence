import { setTimeout as sleep } from "node:timers/promises"

import { CalendarValidationError } from "../calendar/errors.js"

/**
 * Small abstraction over a Flux-compatible HTTP image endpoint.
 */
export interface ImageModelClient {
  generateImage(input: ImageModelRequest): Promise<ImageModelResponse>
}

/**
 * Request payload for one image generation job.
 */
export interface ImageModelRequest {
  aspectRatio: string
  model: string
  negativePrompt: string
  outputFormat: "webp"
  prompt: string
  seed?: number
}

/**
 * Normalized response payload for one generated image.
 */
export interface ImageModelResponse {
  imageBase64: string
  mimeType: string
  rawResponse: unknown
  seed?: number
}

interface BflTaskSubmission {
  id?: string
  polling_url?: string
}

interface BflTaskResult {
  details?: unknown
  id?: string
  progress?: number | null
  result?: {
    sample?: string
  } | null
  status?: string
}

/**
 * Creates the default Flux-compatible HTTP client.
 *
 * @param options Endpoint and authentication settings.
 * @returns Client that supports both generic inline responses and BFL async jobs.
 */
export function createFluxImageClient(options: {
  apiBaseUrl: string
  apiKey?: string
  generatePath?: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
}): ImageModelClient {
  const normalizedBaseUrl = stripTrailingSlash(options.apiBaseUrl)
  const generatePath = normalizePath(options.generatePath ?? "/generate")
  const mode = resolveMode(normalizedBaseUrl, generatePath)

  return {
    async generateImage(input: ImageModelRequest): Promise<ImageModelResponse> {
      if (mode === "bfl-async") {
        return generateImageViaBfl({
          apiBaseUrl: normalizedBaseUrl,
          apiKey: options.apiKey,
          generatePath,
          input,
          pollIntervalMs: options.pollIntervalMs ?? 500,
          pollTimeoutMs: options.pollTimeoutMs ?? 120_000
        })
      }

      return generateImageViaInlineEndpoint({
        apiKey: options.apiKey,
        endpoint: `${normalizedBaseUrl}${generatePath}`,
        input
      })
    }
  }
}

async function generateImageViaInlineEndpoint(options: {
  apiKey?: string
  endpoint: string
  input: ImageModelRequest
}): Promise<ImageModelResponse> {
  let response: Response

  try {
    response = await fetch(options.endpoint, {
      method: "POST",
      headers: buildBearerHeaders(options.apiKey),
      body: JSON.stringify({
        model: options.input.model,
        prompt: options.input.prompt,
        negative_prompt: options.input.negativePrompt,
        aspect_ratio: options.input.aspectRatio,
        output_format: options.input.outputFormat,
        ...(options.input.seed === undefined ? {} : { seed: options.input.seed })
      })
    })
  } catch (error) {
    throw buildNetworkError(options.endpoint, error)
  }

  const rawResponse = await parseResponseBody(response)

  if (!response.ok) {
    throw new CalendarValidationError(
      `Flux request failed with ${response.status} ${response.statusText}`
    )
  }

  const imageBase64 = extractBase64Image(rawResponse)

  if (!imageBase64) {
    throw new CalendarValidationError(
      "Flux response does not contain a supported base64 image payload."
    )
  }

  return {
    imageBase64,
    mimeType: "image/webp",
    rawResponse,
    seed: extractSeed(rawResponse)
  }
}

async function generateImageViaBfl(options: {
  apiBaseUrl: string
  apiKey?: string
  generatePath: string
  input: ImageModelRequest
  pollIntervalMs: number
  pollTimeoutMs: number
}): Promise<ImageModelResponse> {
  const submitEndpoint = buildBflSubmitEndpoint(
    options.apiBaseUrl,
    options.generatePath,
    options.input.model
  )
  const dimensions = getDimensionsForAspectRatio(options.input.aspectRatio)

  let submitResponse: Response

  try {
    submitResponse = await fetch(submitEndpoint, {
      method: "POST",
      headers: buildBflHeaders(options.apiKey),
      body: JSON.stringify({
        prompt: options.input.prompt,
        width: dimensions.width,
        height: dimensions.height,
        ...(options.input.seed === undefined ? {} : { seed: options.input.seed })
      })
    })
  } catch (error) {
    throw buildNetworkError(submitEndpoint, error)
  }

  const submissionPayload = (await parseResponseBody(
    submitResponse
  )) as BflTaskSubmission

  if (!submitResponse.ok) {
    throw new CalendarValidationError(
      `Flux request failed with ${submitResponse.status} ${submitResponse.statusText}`
    )
  }

  const pollingUrl = submissionPayload.polling_url

  if (!pollingUrl) {
    throw new CalendarValidationError(
      `Flux submission to "${submitEndpoint}" did not return a polling_url.`
    )
  }

  const pollResponses: BflTaskResult[] = []
  const startedAt = Date.now()
  let finalResult: BflTaskResult | undefined

  while (Date.now() - startedAt < options.pollTimeoutMs) {
    await sleep(options.pollIntervalMs)

    let pollResponse: Response

    try {
      pollResponse = await fetch(pollingUrl, {
        method: "GET",
        headers: buildBflHeaders(options.apiKey)
      })
    } catch (error) {
      throw buildNetworkError(pollingUrl, error)
    }

    const pollPayload = (await parseResponseBody(pollResponse)) as BflTaskResult
    pollResponses.push(pollPayload)

    if (!pollResponse.ok) {
      throw new CalendarValidationError(
        `Flux polling failed with ${pollResponse.status} ${pollResponse.statusText}`
      )
    }

    if (pollPayload.status === "Ready") {
      finalResult = pollPayload
      break
    }

    if (pollPayload.status === "Error" || pollPayload.status === "Failed") {
      throw new CalendarValidationError(
        `Flux job ${submissionPayload.id ?? "unknown"} failed with status ${pollPayload.status}.`
      )
    }
  }

  if (!finalResult) {
    throw new CalendarValidationError(
      `Flux job ${submissionPayload.id ?? "unknown"} did not finish within ${options.pollTimeoutMs}ms.`
    )
  }

  const sampleUrl = finalResult.result?.sample

  if (!sampleUrl) {
    throw new CalendarValidationError(
      `Flux job ${submissionPayload.id ?? "unknown"} completed without result.sample.`
    )
  }

  let imageResponse: Response

  try {
    imageResponse = await fetch(sampleUrl)
  } catch (error) {
    throw buildNetworkError(sampleUrl, error)
  }

  if (!imageResponse.ok) {
    throw new CalendarValidationError(
      `Flux result download failed with ${imageResponse.status} ${imageResponse.statusText}`
    )
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
  const mimeType = imageResponse.headers.get("content-type") ?? "image/jpeg"

  return {
    imageBase64: imageBuffer.toString("base64"),
    mimeType,
    rawResponse: {
      delivery_url: sampleUrl,
      download_headers: {
        content_type: mimeType
      },
      polls: pollResponses,
      submission: submissionPayload
    },
    seed: options.input.seed
  }
}

function resolveMode(
  apiBaseUrl: string,
  generatePath: string
): "bfl-async" | "inline" {
  if (apiBaseUrl.includes("bfl.ai")) {
    return "bfl-async"
  }

  if (generatePath === "/v1") {
    return "bfl-async"
  }

  return "inline"
}

function buildBflSubmitEndpoint(
  apiBaseUrl: string,
  generatePath: string,
  model: string
): string {
  if (model.trim().length === 0) {
    throw new CalendarValidationError(
      "FLUX_MODEL must be set when using the BFL API."
    )
  }

  return `${apiBaseUrl}${generatePath}/${model}`
}

function getDimensionsForAspectRatio(aspectRatio: string): {
  height: number
  width: number
} {
  switch (aspectRatio) {
    case "4:5":
      return { width: 1080, height: 1350 }
    case "9:16":
      return { width: 1080, height: 1920 }
    case "1.91:1":
      return { width: 1200, height: 630 }
    default:
      throw new CalendarValidationError(
        `Unsupported aspect ratio "${aspectRatio}" for BFL image generation.`
      )
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`
}

function buildBearerHeaders(apiKey?: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
  }
}

function buildBflHeaders(apiKey?: string): HeadersInit {
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(apiKey ? { "x-key": apiKey } : {})
  }
}

function buildNetworkError(endpoint: string, error: unknown): CalendarValidationError {
  const message = error instanceof Error ? error.message : String(error)
  return new CalendarValidationError(
    `Flux request to "${endpoint}" failed before receiving a response: ${message}`
  )
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    return response.json()
  }

  return {
    text: await response.text()
  }
}

function extractBase64Image(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const candidates = [
    readPath(payload, ["image_base64"]),
    readPath(payload, ["b64_json"]),
    readPath(payload, ["data", 0, "b64_json"]),
    readPath(payload, ["data", 0, "image_base64"]),
    readPath(payload, ["images", 0, "b64_json"]),
    readPath(payload, ["images", 0, "image_base64"]),
    readPath(payload, ["output", 0, "b64_json"]),
    readPath(payload, ["output", 0, "image_base64"])
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate
    }
  }

  return null
}

function extractSeed(payload: unknown): number | undefined {
  const seed = readPath(payload, ["seed"])
  return typeof seed === "number" ? seed : undefined
}

function readPath(
  value: unknown,
  path: Array<number | string>
): unknown {
  let current: unknown = value

  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment]
      continue
    }

    if (current && typeof current === "object" && typeof segment === "string") {
      current = (current as Record<string, unknown>)[segment]
      continue
    }

    return undefined
  }

  return current
}
