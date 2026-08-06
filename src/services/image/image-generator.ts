import { mkdir, writeFile } from "node:fs/promises"
import { dirname, relative } from "node:path"

import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import {
  getPostById,
  getWeekForDate
} from "../calendar/calendar-service.js"
import { CalendarValidationError } from "../calendar/errors.js"
import {
  assertContentApproved,
  getContentOutputPaths,
  pathExists,
  readContentPackage,
  writeJsonFile
} from "../content/content-storage.js"
import type {
  ImageModelClient,
  ImageModelRequest
} from "./flux-client.js"

const supportedFormats = {
  "1.91:1": { width: 1200, height: 630, slug: "1.91x1" },
  "4:5": { width: 1080, height: 1350, slug: "4x5" },
  "9:16": { width: 1080, height: 1920, slug: "9x16" }
} as const

type SupportedFormat = keyof typeof supportedFormats

/**
 * Options shared by image generation commands.
 */
export interface GenerateImagesOptions {
  dryRun: boolean
  force: boolean
  model: string
  outputRoot: string
  seed?: number
}

/**
 * Result of one post-level image generation pass.
 */
export interface GenerateImagesResult {
  contentPath: string
  dryRunRequests?: ImageGenerationRequestPreview[]
  jobs: StoredImageJobResult[]
  postId: string
  summaryPath: string
}

export interface GenerateReelImagesResult {
  contentPath: string
  dryRunRequests?: ImageGenerationRequestPreview[]
  jobs: StoredImageJobResult[]
  postId: string
  summaryPath: string
}

/**
 * Request preview used by dry-run mode.
 */
export interface ImageGenerationRequestPreview
  extends Omit<ImageModelRequest, "aspectRatio"> {
  aspectRatio: SupportedFormat
  height: number
  postId: string
  width: number
}

/**
 * Persisted status per generated aspect ratio.
 */
export interface StoredImageJobResult {
  assetPath: string
  aspectRatio: SupportedFormat
  error?: string
  height: number
  mimeType: string
  rawResponsePath: string
  request: ImageModelRequest
  seed?: number
  status: "failed" | "succeeded"
  width: number
}

/**
 * Dependencies injected for testable image generation.
 */
export interface ImageGeneratorDependencies {
  imageClient?: ImageModelClient
  now?: () => Date
}

/**
 * Generates images for one post by reading its existing content package.
 *
 * @param calendar Parsed calendar data.
 * @param postId Calendar post identifier.
 * @param options Image generation options.
 * @param dependencies External dependencies such as the image client and time source.
 * @returns Result details for the generated post assets.
 */
export async function generateImagesForPost(
  calendar: Calendar,
  postId: string,
  options: GenerateImagesOptions,
  dependencies: ImageGeneratorDependencies
): Promise<GenerateImagesResult> {
  const post = getPostById(calendar, postId)
  return generateImagesForCalendarPost(post, options, dependencies)
}

/**
 * Generates images for every post in the week containing the given date.
 *
 * @param calendar Parsed calendar data.
 * @param date ISO date inside the target week.
 * @param options Image generation options.
 * @param dependencies External dependencies such as the image client and time source.
 * @returns Generation results for the week.
 */
export async function generateImagesForWeek(
  calendar: Calendar,
  date: string,
  options: GenerateImagesOptions,
  dependencies: ImageGeneratorDependencies
): Promise<GenerateImagesResult[]> {
  const week = getWeekForDate(calendar, date)
  const results: GenerateImagesResult[] = []

  for (const post of week.beitraege) {
    results.push(await generateImagesForCalendarPost(post, options, dependencies))
  }

  return results
}

export async function generateReelImagesForPost(
  calendar: Calendar,
  postId: string,
  options: GenerateImagesOptions,
  dependencies: ImageGeneratorDependencies
): Promise<GenerateReelImagesResult> {
  const post = getPostById(calendar, postId)
  return generateReelImagesForCalendarPost(post, options, dependencies)
}

export async function generateReelImagesForWeek(
  calendar: Calendar,
  date: string,
  options: GenerateImagesOptions,
  dependencies: ImageGeneratorDependencies
): Promise<GenerateReelImagesResult[]> {
  const week = getWeekForDate(calendar, date)
  const results: GenerateReelImagesResult[] = []

  for (const post of week.beitraege) {
    results.push(await generateReelImagesForCalendarPost(post, options, dependencies))
  }

  return results
}

async function generateImagesForCalendarPost(
  post: CalendarPost,
  options: GenerateImagesOptions,
  dependencies: ImageGeneratorDependencies
): Promise<GenerateImagesResult> {
  const contentPaths = getContentOutputPaths(options.outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  assertContentApproved(content, contentPaths.contentPath)
  const safePrompt = sanitizeFluxPrompt(content.visual.flux_prompt)

  if (safePrompt.length === 0) {
    throw new CalendarValidationError(
      `Content package "${contentPaths.contentPath}" does not contain a safe Flux prompt.`
    )
  }

  const targetFormats = resolveTargetFormats(post, content)
  const summaryPath = `${contentPaths.baseDir}/image-generation-results.json`
  const requests = targetFormats.map((format) =>
    buildRequestPreview(post.id, content, options.model, format, safePrompt, options.seed)
  )

  if (options.dryRun) {
    return {
      contentPath: contentPaths.contentPath,
      dryRunRequests: requests,
      jobs: requests.map((request) => ({
        assetPath: buildAssetPath(contentPaths.baseDir, request.aspectRatio),
        aspectRatio: request.aspectRatio,
        height: request.height,
        mimeType: "image/webp",
        rawResponsePath: buildRawResponsePath(contentPaths.baseDir, request.aspectRatio),
        request: requestToStoredRequest(request),
        seed: request.seed,
        status: "succeeded",
        width: request.width
      })),
      postId: post.id,
      summaryPath
    }
  }

  await assertWritableImageTargets(contentPaths.baseDir, targetFormats, summaryPath, options.force)

  const imageClient = dependencies.imageClient

  if (!imageClient) {
    throw new CalendarValidationError(
      "FLUX_API_BASE_URL is required for image generation unless --dry-run is used."
    )
  }

  const now = dependencies.now ?? (() => new Date())
  const jobs: StoredImageJobResult[] = []

  for (const request of requests) {
    const assetPath = buildAssetPath(contentPaths.baseDir, request.aspectRatio)
    const rawResponsePath = buildRawResponsePath(contentPaths.baseDir, request.aspectRatio)

    try {
      const response = await imageClient.generateImage(requestToStoredRequest(request))
      await mkdir(dirname(assetPath), { recursive: true })
      await writeFile(assetPath, Buffer.from(response.imageBase64, "base64"))
      await writeJsonFile(rawResponsePath, response.rawResponse)

      jobs.push({
        assetPath,
        aspectRatio: request.aspectRatio,
        height: request.height,
        mimeType: response.mimeType,
        rawResponsePath,
        request: requestToStoredRequest(request),
        seed: response.seed ?? request.seed,
        status: "succeeded",
        width: request.width
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      await writeJsonFile(rawResponsePath, {
        error: message,
        status: "failed"
      })

      jobs.push({
        assetPath,
        aspectRatio: request.aspectRatio,
        error: message,
        height: request.height,
        mimeType: "image/webp",
        rawResponsePath,
        request: requestToStoredRequest(request),
        seed: request.seed,
        status: "failed",
        width: request.width
      })
    }
  }

  await writeJsonFile(summaryPath, {
    generated_at: now().toISOString(),
    jobs,
    model: options.model,
    post_id: post.id
  })

  await updateContentAssets(contentPaths.contentPath, contentPaths.baseDir, content, jobs)

  return {
    contentPath: contentPaths.contentPath,
    jobs,
    postId: post.id,
    summaryPath
  }
}

async function generateReelImagesForCalendarPost(
  post: CalendarPost,
  options: GenerateImagesOptions,
  dependencies: ImageGeneratorDependencies
): Promise<GenerateReelImagesResult> {
  const contentPaths = getContentOutputPaths(options.outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  assertContentApproved(content, contentPaths.contentPath)
  const safePrompt = sanitizeFluxPrompt(content.visual.flux_prompt)

  if (safePrompt.length === 0) {
    throw new CalendarValidationError(
      `Content package "${contentPaths.contentPath}" does not contain a safe Flux prompt.`
    )
  }

  const shots = content.platforms.reel.shots
    .map((shot) => shot.trim())
    .filter((shot) => shot.length > 0)

  if (shots.length === 0) {
    throw new CalendarValidationError(
      `Content package "${contentPaths.contentPath}" does not contain any reel shots.`
    )
  }

  const summaryPath = `${contentPaths.baseDir}/reel-image-generation-results.json`
  const requests = shots.map((shot, index) =>
    buildRequestPreview(
      post.id,
      content,
      options.model,
      "9:16",
      `${safePrompt}, scene focus: ${shot}`,
      options.seed === undefined ? undefined : options.seed + index
    )
  )

  if (options.dryRun) {
    return {
      contentPath: contentPaths.contentPath,
      dryRunRequests: requests,
      jobs: requests.map((request, index) => ({
        assetPath: buildReelAssetPath(contentPaths.baseDir, index + 1),
        aspectRatio: request.aspectRatio,
        height: request.height,
        mimeType: "image/webp",
        rawResponsePath: buildReelRawResponsePath(contentPaths.baseDir, index + 1),
        request: requestToStoredRequest(request),
        seed: request.seed,
        status: "succeeded",
        width: request.width
      })),
      postId: post.id,
      summaryPath
    }
  }

  await assertWritableReelImageTargets(contentPaths.baseDir, shots.length, summaryPath, options.force)

  const imageClient = dependencies.imageClient

  if (!imageClient) {
    throw new CalendarValidationError(
      "FLUX_API_BASE_URL is required for reel image generation unless --dry-run is used."
    )
  }

  const now = dependencies.now ?? (() => new Date())
  const jobs: StoredImageJobResult[] = []

  for (const [index, request] of requests.entries()) {
    const sequence = index + 1
    const assetPath = buildReelAssetPath(contentPaths.baseDir, sequence)
    const rawResponsePath = buildReelRawResponsePath(contentPaths.baseDir, sequence)

    try {
      const response = await imageClient.generateImage(requestToStoredRequest(request))
      await mkdir(dirname(assetPath), { recursive: true })
      await writeFile(assetPath, Buffer.from(response.imageBase64, "base64"))
      await writeJsonFile(rawResponsePath, response.rawResponse)

      jobs.push({
        assetPath,
        aspectRatio: request.aspectRatio,
        height: request.height,
        mimeType: response.mimeType,
        rawResponsePath,
        request: requestToStoredRequest(request),
        seed: response.seed ?? request.seed,
        status: "succeeded",
        width: request.width
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      await writeJsonFile(rawResponsePath, {
        error: message,
        status: "failed"
      })

      jobs.push({
        assetPath,
        aspectRatio: request.aspectRatio,
        error: message,
        height: request.height,
        mimeType: "image/webp",
        rawResponsePath,
        request: requestToStoredRequest(request),
        seed: request.seed,
        status: "failed",
        width: request.width
      })
    }
  }

  await writeJsonFile(summaryPath, {
    generated_at: now().toISOString(),
    jobs,
    model: options.model,
    post_id: post.id
  })

  await updateContentAssets(contentPaths.contentPath, contentPaths.baseDir, content, jobs)

  return {
    contentPath: contentPaths.contentPath,
    jobs,
    postId: post.id,
    summaryPath
  }
}

function resolveTargetFormats(
  post: CalendarPost,
  content: ContentPackage
): SupportedFormat[] {
  const platformFormats = [
    ...post.plattformen_und_formate.facebook.map(() => "1.91:1" as const),
    ...post.plattformen_und_formate.instagram.map((format) =>
      format.toLowerCase().includes("story") ? ("9:16" as const) : ("4:5" as const)
    ),
    ...post.plattformen_und_formate.mastodon.map(() => "1.91:1" as const)
  ]
  const fallbackFormats = content.visual.formats.filter(isSupportedFormat)
  const formats = Array.from(
    new Set(platformFormats.length > 0 ? platformFormats : fallbackFormats)
  )

  if (formats.length === 0) {
    throw new CalendarValidationError(
      `Post "${post.id}" does not declare any supported target formats.`
    )
  }

  return formats
}

function isSupportedFormat(format: string): format is SupportedFormat {
  return format in supportedFormats
}

function buildRequestPreview(
  postId: string,
  content: ContentPackage,
  model: string,
  format: SupportedFormat,
  safePrompt: string,
  seed?: number
): ImageGenerationRequestPreview {
  const dimensions = supportedFormats[format]

  return {
    aspectRatio: format,
    height: dimensions.height,
    model,
    negativePrompt: mergeNegativePrompt(content.visual.negative_prompt),
    outputFormat: "webp",
    postId,
    prompt: ensurePromptHasNoTextInstruction(safePrompt),
    ...(seed === undefined ? {} : { seed }),
    width: dimensions.width
  }
}

function ensurePromptHasNoTextInstruction(prompt: string): string {
  const trimmed = prompt.trim()

  if (trimmed.length === 0) {
    return trimmed
  }

  if (trimmed.toLowerCase().includes("no text")) {
    return trimmed
  }

  return `${trimmed}, no text, no letters, no typography, no logo, no watermark`
}

function mergeNegativePrompt(negativePrompt: string): string {
  const requiredTokens = ["text", "letters", "typography", "logo", "watermark"]
  const existing = negativePrompt
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const lowered = new Set(existing.map((item) => item.toLowerCase()))

  for (const token of requiredTokens) {
    if (!lowered.has(token)) {
      existing.push(token)
    }
  }

  return existing.join(", ")
}

function sanitizeFluxPrompt(prompt: string): string {
  const lowered = prompt.toLowerCase()
  const explicitNoTextPatterns = [
    "no text",
    "without text",
    "ohne text",
    "no letters",
    "without letters",
    "ohne schrift",
    "no typography"
  ]

  if (explicitNoTextPatterns.some((pattern) => lowered.includes(pattern))) {
    return prompt.trim()
  }

  if (
    lowered.includes("text") ||
    lowered.includes("schrift") ||
    lowered.includes("buchstaben") ||
    lowered.includes("typography")
  ) {
    return ""
  }

  return prompt.trim()
}

function buildAssetPath(baseDir: string, format: SupportedFormat): string {
  return `${baseDir}/assets/background-${supportedFormats[format].slug}.webp`
}

function buildRawResponsePath(baseDir: string, format: SupportedFormat): string {
  return `${baseDir}/raw-flux-response-${supportedFormats[format].slug}.json`
}

function buildReelAssetPath(baseDir: string, sequence: number): string {
  return `${baseDir}/assets/reel-shot-${formatSequence(sequence)}.webp`
}

function buildReelRawResponsePath(baseDir: string, sequence: number): string {
  return `${baseDir}/raw-flux-reel-shot-${formatSequence(sequence)}.json`
}

async function assertWritableImageTargets(
  baseDir: string,
  formats: SupportedFormat[],
  summaryPath: string,
  force: boolean
): Promise<void> {
  const paths = [
    summaryPath,
    ...formats.flatMap((format) => [
      buildAssetPath(baseDir, format),
      buildRawResponsePath(baseDir, format)
    ])
  ]

  for (const path of paths) {
    if ((await pathExists(path)) && !force) {
      throw new CalendarValidationError(
        `Image output already exists at "${path}". Use --force to overwrite it.`
      )
    }
  }
}

async function assertWritableReelImageTargets(
  baseDir: string,
  shotCount: number,
  summaryPath: string,
  force: boolean
): Promise<void> {
  const paths = [
    summaryPath,
    ...Array.from({ length: shotCount }, (_, index) => [
      buildReelAssetPath(baseDir, index + 1),
      buildReelRawResponsePath(baseDir, index + 1)
    ]).flat()
  ]

  for (const path of paths) {
    if ((await pathExists(path)) && !force) {
      throw new CalendarValidationError(
        `Image output already exists at "${path}". Use --force to overwrite it.`
      )
    }
  }
}

async function updateContentAssets(
  contentPath: string,
  baseDir: string,
  content: ContentPackage,
  jobs: StoredImageJobResult[]
): Promise<void> {
  const successfulAssets = jobs
    .filter((job) => job.status === "succeeded")
    .map((job) => relative(baseDir, job.assetPath))
  const assets = Array.from(
    new Set([...content.metadata.assets, ...successfulAssets])
  )

  await writeJsonFile(contentPath, {
    ...content,
    metadata: {
      ...content.metadata,
      assets
    }
  })
}

function requestToStoredRequest(
  request: ImageGenerationRequestPreview
): ImageModelRequest {
  return {
    aspectRatio: request.aspectRatio,
    model: request.model,
    negativePrompt: request.negativePrompt,
    outputFormat: request.outputFormat,
    prompt: request.prompt,
    ...(request.seed === undefined ? {} : { seed: request.seed })
  }
}

function formatSequence(value: number): string {
  return value.toString().padStart(2, "0")
}
