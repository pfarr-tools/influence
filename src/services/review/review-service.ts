import { dirname, extname, join, relative } from "node:path"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"

import type {
  Calendar,
  CalendarPost,
  CalendarWeek
} from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { getPostById, getWeekForDate } from "../calendar/calendar-service.js"
import { CalendarValidationError } from "../calendar/errors.js"
import type {
  ContentGeneratorDependencies,
  GenerateContentOptions,
  GenerateContentResult
} from "../content/content-generator.js"
import { generateContentForPost } from "../content/content-generator.js"
import {
  getContentOutputPaths,
  pathExists,
  readContentPackage,
  readJsonFile,
  writeJsonFile
} from "../content/content-storage.js"

type PersistedQaSummary = {
  errors?: string[]
  ready_for_approval?: boolean
  warnings?: string[]
}

type PersistedRenderSummary = {
  renders?: Array<{
    format?: string
    html_path?: string
    image_path?: string
    page_label?: string
    page_count?: number
    page_index?: number
    variant?: string
  }>
  warnings?: string[]
}

type PersistedImageSummary = {
  jobs?: Array<{
    assetPath?: string
    aspectRatio?: string
    status?: string
  }>
}

type PersistedReelRenderSummary = {
  audio_path?: string | null
  duration_seconds?: number
  segments?: Array<{
    duration_seconds?: number
    image_path?: string
    segment_index?: number
    subtitle_text?: string
  }>
  subtitle_font_name?: string | null
  subtitle_fonts_dir?: string | null
  subtitle_path?: string
  video_path?: string
}

export interface ReviewWeekOverview {
  selectedWeek: ReviewWeekSummary
  weekOptions: ReviewWeekSummary[]
}

export interface ReviewWeekSummary {
  endDate: string
  focus: string
  id: string
  postCount: number
  posts: ReviewPostCard[]
  startDate: string
}

export interface ReviewPostCard {
  contentExists: boolean
  date: string
  hasAssets: boolean
  hasRenderedPreviews: boolean
  isApproved: boolean
  postId: string
  qaReadyForApproval: boolean
  rubric: string
  status: string
  theme: string
  weekday: string
  workflow: ReviewWorkflowState
}

export interface ReviewPostDetail {
  assetPaths: string[]
  post: CalendarPost
  content: ContentPackage
  contentPath: string
  exportPath: string
  imagePreviewPaths: string[]
  imageSummary?: PersistedImageSummary
  qaSummary?: PersistedQaSummary
  reelAudioAssetPath?: string
  reelAudioPath: string
  reelSubtitleFontName: string
  reelSubtitleFontsDir: string
  reelPreviewPath?: string
  reelRenderSummary?: PersistedReelRenderSummary
  renderPreviewPaths: string[]
  renderSummary?: PersistedRenderSummary
  workflow: ReviewWorkflowState
}

export interface ReviewWorkflowState {
  contentGenerated: boolean
  exportGenerated: boolean
  imagesGenerated: boolean
  qaReadyForApproval: boolean
  qaRun: boolean
  reelImagesGenerated: boolean
  reelRendered: boolean
  rendered: boolean
  scaffolded: boolean
}

export interface UpdateReviewPostInput {
  altText: string
  audience: string
  concept: string
  facebookHeadline: string
  facebookText: string
  fluxPrompt: string
  instagramCaption: string
  instagramCarousel: Array<{
    text: string
    type: string
  }>
  mainMessage: string
  mastodonText: string
  reelHook: string
  reelScript: string
  storySlides: string[]
  title: string
}

export interface RescheduleReviewPostInput {
  date: string
  position?: number
}

export interface ReviewExportResult {
  exportPath: string
  fileName: string
}

export interface ReviewUploadedFile {
  buffer: Buffer
  fileName: string
  mimeType: string
}

export type ReviewAssetKind =
  | "background-1.91x1"
  | "background-4x5"
  | "background-9x16"
  | "reel-audio"
  | "reel-shot"

export interface StoreReviewAssetInput {
  assetKind: ReviewAssetKind
  file: ReviewUploadedFile
  reelShotIndex?: number
}

export interface ReviewRegenerateDependencies extends ContentGeneratorDependencies {
  generateContent?: (
    calendar: Calendar,
    postId: string,
    options: GenerateContentOptions,
    dependencies: ContentGeneratorDependencies
  ) => Promise<GenerateContentResult>
}

export async function loadReviewWeek(
  calendar: Calendar,
  date: string,
  outputRoot: string
): Promise<ReviewWeekOverview> {
  const selectedWeek = getWeekForDate(calendar, date)

  return {
    selectedWeek: await buildReviewWeekSummary(selectedWeek, outputRoot),
    weekOptions: await Promise.all(
      calendar.wochen.map((week) =>
        buildReviewWeekSummary(week, outputRoot, false)
      )
    )
  }
}

export async function loadReviewPost(
  calendar: Calendar,
  postId: string,
  outputRoot: string
): Promise<ReviewPostDetail> {
  const post = getPostById(calendar, postId)
  const contentPaths = getContentOutputPaths(outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  const qaPath = join(contentPaths.baseDir, "qa-results.json")
  const renderPath = join(contentPaths.baseDir, "render-results.json")
  const imagePath = join(contentPaths.baseDir, "image-generation-results.json")
  const reelRenderPath = join(contentPaths.baseDir, "reel-render-results.json")
  const qaSummary = await readOptionalJson<PersistedQaSummary>(qaPath)
  const renderSummary =
    await readOptionalJson<PersistedRenderSummary>(renderPath)
  const imageSummary = await readOptionalJson<PersistedImageSummary>(imagePath)
  const reelRenderSummary =
    await readOptionalJson<PersistedReelRenderSummary>(reelRenderPath)

  return {
    assetPaths: resolveManualAssetPaths(
      contentPaths.baseDir,
      outputRoot,
      content
    ),
    post,
    content,
    contentPath: contentPaths.contentPath,
    exportPath: join(contentPaths.baseDir, "review-export.json"),
    imagePreviewPaths: resolveImagePreviewPaths(
      contentPaths.baseDir,
      outputRoot,
      content,
      imageSummary
    ),
    imageSummary,
    qaSummary,
    reelAudioAssetPath: resolveReelAudioAssetPath(
      contentPaths.baseDir,
      outputRoot,
      content,
      reelRenderSummary
    ),
    reelAudioPath: resolveReelAudioDisplayPath(content, reelRenderSummary),
    reelSubtitleFontName: reelRenderSummary?.subtitle_font_name ?? "",
    reelSubtitleFontsDir: reelRenderSummary?.subtitle_fonts_dir ?? "",
    reelPreviewPath: resolveReelPreviewPath(
      contentPaths.baseDir,
      outputRoot,
      reelRenderSummary
    ),
    reelRenderSummary,
    renderPreviewPaths: resolveRenderPreviewPaths(
      contentPaths.baseDir,
      outputRoot,
      renderSummary
    ),
    renderSummary,
    workflow: await buildWorkflowState(
      contentPaths.baseDir,
      content,
      qaSummary,
      imageSummary,
      renderSummary,
      reelRenderSummary
    )
  }
}

export async function storeReviewReelAudioAsset(
  calendar: Calendar,
  postId: string,
  outputRoot: string,
  file: ReviewUploadedFile
): Promise<string> {
  return storeReviewAsset(calendar, postId, outputRoot, {
    assetKind: "reel-audio",
    file
  })
}

export async function storeReviewAsset(
  calendar: Calendar,
  postId: string,
  outputRoot: string,
  input: StoreReviewAssetInput
): Promise<string> {
  const post = getPostById(calendar, postId)
  const contentPaths = getContentOutputPaths(outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  const assetRelativePath = resolveAssetRelativePath(input)
  const assetAbsolutePath = join(contentPaths.baseDir, assetRelativePath)
  const assets = updateAssetList(
    content.metadata.assets,
    assetRelativePath,
    input.assetKind
  )

  await mkdir(join(contentPaths.baseDir, "assets"), { recursive: true })
  await writeFile(assetAbsolutePath, input.file.buffer)
  await writeJsonFile(contentPaths.contentPath, {
    ...content,
    metadata: {
      ...content.metadata,
      assets
    }
  })

  return assetAbsolutePath
}

export async function updateReviewPost(
  calendar: Calendar,
  postId: string,
  outputRoot: string,
  input: UpdateReviewPostInput
): Promise<ContentPackage> {
  const post = getPostById(calendar, postId)
  const contentPaths = getContentOutputPaths(outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  const normalizedStorySlides = input.storySlides
    .map((slide) => slide.trim())
    .filter((slide) => slide.length > 0)
  const normalizedInstagramCarousel = input.instagramCarousel
    .map((card) => ({
      text: card.text.trim(),
      type: card.type.trim()
    }))
    .filter((card) => card.text.length > 0 || card.type.length > 0)

  const updatedContent: ContentPackage = {
    ...content,
    status: content.status === "verworfen" ? "verworfen" : "in Arbeit",
    editorial_core: {
      ...content.editorial_core,
      audience: input.audience,
      main_message: input.mainMessage,
      title: input.title
    },
    platforms: {
      ...content.platforms,
      facebook: {
        headline: input.facebookHeadline,
        text: input.facebookText
      },
      instagram: {
        ...content.platforms.instagram,
        caption: input.instagramCaption,
        carousel: normalizedInstagramCarousel
      },
      mastodon: {
        text: input.mastodonText
      },
      reel: {
        ...content.platforms.reel,
        hook: input.reelHook,
        script: input.reelScript
      },
      story: {
        slides:
          normalizedStorySlides.length > 0
            ? normalizedStorySlides.map((text) => ({ text }))
            : [{ text: "" }]
      }
    },
    qa: {
      approved: false,
      warnings: content.qa.warnings
    },
    visual: {
      ...content.visual,
      alt_text: input.altText,
      concept: input.concept,
      flux_prompt: input.fluxPrompt
    }
  }

  await writeJsonFile(contentPaths.contentPath, updatedContent)

  return updatedContent
}

export async function approveReviewPost(
  calendar: Calendar,
  postId: string,
  outputRoot: string
): Promise<ContentPackage> {
  const post = getPostById(calendar, postId)
  const contentPaths = getContentOutputPaths(outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  const qaSummary = await readOptionalJson<PersistedQaSummary>(
    join(contentPaths.baseDir, "qa-results.json")
  )

  if (!qaSummary?.ready_for_approval) {
    throw new CalendarValidationError(
      `Post "${postId}" cannot be approved because QA is missing or still blocked.`
    )
  }

  const approvedContent: ContentPackage = {
    ...content,
    status: "freigegeben",
    qa: {
      approved: true,
      warnings: qaSummary.warnings ?? content.qa.warnings
    }
  }

  await writeJsonFile(contentPaths.contentPath, approvedContent)

  return approvedContent
}

export async function exportReviewPost(
  calendar: Calendar,
  postId: string,
  outputRoot: string
): Promise<ReviewExportResult> {
  const post = getPostById(calendar, postId)
  const contentPaths = getContentOutputPaths(outputRoot, post)
  const detail = await loadReviewPost(calendar, postId, outputRoot)
  const exportPath = join(contentPaths.baseDir, "review-export.json")

  await writeJsonFile(exportPath, {
    content: detail.content,
    export_generated_at: new Date().toISOString(),
    post: {
      date: post.datum,
      id: post.id,
      rubric: post.rubrik,
      theme: post.thema,
      weekday: post.wochentag
    },
    qa: detail.qaSummary ?? null,
    rendered_files: detail.renderPreviewPaths,
    source_files: {
      content_json: relative(contentPaths.baseDir, contentPaths.contentPath),
      image_generation_results: (await pathExists(
        join(contentPaths.baseDir, "image-generation-results.json")
      ))
        ? "image-generation-results.json"
        : null,
      qa_results: (await pathExists(
        join(contentPaths.baseDir, "qa-results.json")
      ))
        ? "qa-results.json"
        : null,
      render_results: (await pathExists(
        join(contentPaths.baseDir, "render-results.json")
      ))
        ? "render-results.json"
        : null,
      reel_render_results: (await pathExists(
        join(contentPaths.baseDir, "reel-render-results.json")
      ))
        ? "reel-render-results.json"
        : null
    },
    reel: detail.reelRenderSummary ?? null,
    reel_video: detail.reelPreviewPath ?? null,
    visual_assets: detail.imagePreviewPaths
  })

  return {
    exportPath,
    fileName: `${post.id}-review-export.json`
  }
}

export async function regenerateReviewPost(
  calendar: Calendar,
  postId: string,
  options: GenerateContentOptions,
  dependencies: ReviewRegenerateDependencies
): Promise<GenerateContentResult> {
  const generateContent = dependencies.generateContent ?? generateContentForPost

  return generateContent(
    calendar,
    postId,
    {
      ...options,
      force: true
    },
    dependencies
  )
}

export async function rescheduleReviewPost(
  calendar: Calendar,
  postId: string,
  outputRoot: string,
  calendarPath: string,
  input: RescheduleReviewPostInput
): Promise<void> {
  const post = getPostById(calendar, postId)
  const sourceWeek = getWeekForDate(calendar, post.datum)
  const targetWeek = getWeekForDate(calendar, input.date)
  const sourceIndex = sourceWeek.beitraege.findIndex(
    (entry) => entry.id === postId
  )

  if (sourceIndex < 0) {
    throw new CalendarValidationError(`No post found for id "${postId}"`)
  }

  if (sourceWeek !== targetWeek && sourceWeek.beitraege.length <= 1) {
    throw new CalendarValidationError(
      "Der letzte Beitrag einer Woche kann nicht in eine andere Woche verschoben werden."
    )
  }

  const previousPostSnapshot = { ...post }
  const previousPaths = getContentOutputPaths(outputRoot, previousPostSnapshot)

  sourceWeek.beitraege.splice(sourceIndex, 1)
  post.datum = input.date
  post.wochentag = formatGermanWeekday(input.date)

  const insertionIndex = clampInsertionIndex(
    input.position,
    targetWeek.beitraege.length
  )
  targetWeek.beitraege.splice(insertionIndex, 0, post)

  const nextPaths = getContentOutputPaths(outputRoot, post)
  await persistCalendarWithUpdatedCounts(calendarPath, calendar)

  if (previousPaths.baseDir !== nextPaths.baseDir) {
    await movePostOutputDirectory(previousPaths.baseDir, nextPaths.baseDir)
    await updateMovedContentArtifacts(
      previousPaths.baseDir,
      nextPaths.baseDir,
      nextPaths.contentPath,
      input.date
    )
  } else {
    await updateContentSourceDate(nextPaths.contentPath, input.date)
  }
}

async function buildReviewWeekSummary(
  week: CalendarWeek,
  outputRoot: string,
  includePosts = true
): Promise<ReviewWeekSummary> {
  return {
    endDate: week.zeitraum.bis,
    focus: week.redaktioneller_fokus,
    id: week.id,
    postCount: week.beitraege.length,
    posts: includePosts
      ? await Promise.all(
          week.beitraege.map((post) => buildReviewPostCard(post, outputRoot))
        )
      : [],
    startDate: week.zeitraum.von
  }
}

async function buildReviewPostCard(
  post: CalendarPost,
  outputRoot: string
): Promise<ReviewPostCard> {
  const contentPaths = getContentOutputPaths(outputRoot, post)
  const contentExists = await pathExists(contentPaths.contentPath)

  if (!contentExists) {
    return {
      contentExists,
      date: post.datum,
      hasAssets: false,
      hasRenderedPreviews: false,
      isApproved: false,
      postId: post.id,
      qaReadyForApproval: false,
      rubric: post.rubrik,
      status: "missing",
      theme: post.thema,
      weekday: post.wochentag,
      workflow: {
        contentGenerated: false,
        exportGenerated: false,
        imagesGenerated: false,
        qaReadyForApproval: false,
        qaRun: false,
        reelImagesGenerated: false,
        reelRendered: false,
        rendered: false,
        scaffolded: false
      }
    }
  }

  const content = await readContentPackage(contentPaths.contentPath)
  const qaSummary = await readOptionalJson<PersistedQaSummary>(
    join(contentPaths.baseDir, "qa-results.json")
  )
  const imageSummary = await readOptionalJson<PersistedImageSummary>(
    join(contentPaths.baseDir, "image-generation-results.json")
  )
  const renderSummary = await readOptionalJson<PersistedRenderSummary>(
    join(contentPaths.baseDir, "render-results.json")
  )
  const reelRenderSummary = await readOptionalJson<PersistedReelRenderSummary>(
    join(contentPaths.baseDir, "reel-render-results.json")
  )
  const workflow = await buildWorkflowState(
    contentPaths.baseDir,
    content,
    qaSummary,
    imageSummary,
    renderSummary,
    reelRenderSummary
  )

  return {
    contentExists,
    date: post.datum,
    hasAssets: content.metadata.assets.length > 0,
    hasRenderedPreviews: (renderSummary?.renders?.length ?? 0) > 0,
    isApproved: content.qa.approved,
    postId: post.id,
    qaReadyForApproval: qaSummary?.ready_for_approval ?? false,
    rubric: post.rubrik,
    status: content.status,
    theme: content.editorial_core.title || post.thema,
    weekday: post.wochentag,
    workflow
  }
}

async function buildWorkflowState(
  baseDir: string,
  content: ContentPackage,
  qaSummary?: PersistedQaSummary,
  imageSummary?: PersistedImageSummary,
  renderSummary?: PersistedRenderSummary,
  reelRenderSummary?: PersistedReelRenderSummary
): Promise<ReviewWorkflowState> {
  const reelAssetPaths = content.metadata.assets.filter((assetPath) =>
    assetPath.startsWith("assets/reel-shot-")
  )

  return {
    contentGenerated: content.metadata.generated_at.trim().length > 0,
    exportGenerated: await pathExists(join(baseDir, "review-export.json")),
    imagesGenerated:
      (imageSummary?.jobs?.some((job) => job.status === "succeeded") ??
        false) ||
      content.metadata.assets.length > 0,
    qaReadyForApproval: qaSummary?.ready_for_approval ?? false,
    qaRun: qaSummary !== undefined,
    reelImagesGenerated: reelAssetPaths.length > 0,
    reelRendered:
      typeof reelRenderSummary?.video_path === "string" &&
      reelRenderSummary.video_path.length > 0,
    rendered: (renderSummary?.renders?.length ?? 0) > 0,
    scaffolded: true
  }
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  if (!(await pathExists(path))) {
    return undefined
  }

  return readJsonFile<T>(path)
}

function resolveImagePreviewPaths(
  baseDir: string,
  outputRoot: string,
  content: ContentPackage,
  imageSummary?: PersistedImageSummary
): string[] {
  const successfulJobs =
    imageSummary?.jobs
      ?.filter(
        (job) => job.status === "succeeded" && typeof job.assetPath === "string"
      )
      .map((job) =>
        toOutputRelativePath(outputRoot, job.assetPath as string)
      ) ?? []

  const contentAssets = content.metadata.assets.map((assetPath) =>
    toOutputRelativePath(outputRoot, join(baseDir, assetPath))
  )

  return Array.from(new Set([...successfulJobs, ...contentAssets]))
}

function resolveManualAssetPaths(
  baseDir: string,
  outputRoot: string,
  content: ContentPackage
): string[] {
  return content.metadata.assets
    .filter(
      (assetPath) =>
        assetPath.startsWith("assets/") && !assetPath.includes("..")
    )
    .map((assetPath) =>
      toOutputRelativePath(outputRoot, join(baseDir, assetPath))
    )
}

function resolveRenderPreviewPaths(
  baseDir: string,
  outputRoot: string,
  renderSummary?: PersistedRenderSummary
): string[] {
  return (
    renderSummary?.renders
      ?.map((render) =>
        typeof render.image_path === "string"
          ? toOutputRelativePath(outputRoot, join(baseDir, render.image_path))
          : undefined
      )
      .filter(
        (path): path is string => typeof path === "string" && path.length > 0
      ) ?? []
  )
}

function resolveReelPreviewPath(
  baseDir: string,
  outputRoot: string,
  reelRenderSummary?: PersistedReelRenderSummary
): string | undefined {
  if (typeof reelRenderSummary?.video_path !== "string") {
    return undefined
  }

  return toOutputRelativePath(
    outputRoot,
    join(baseDir, reelRenderSummary.video_path)
  )
}

function resolveReelAudioDisplayPath(
  content: ContentPackage,
  reelRenderSummary?: PersistedReelRenderSummary
): string {
  const summaryPath = reelRenderSummary?.audio_path

  if (typeof summaryPath === "string" && summaryPath.length > 0) {
    return summaryPath
  }

  return findReelAudioAssetRelativePath(content) ?? ""
}

function resolveReelAudioAssetPath(
  baseDir: string,
  outputRoot: string,
  content: ContentPackage,
  reelRenderSummary?: PersistedReelRenderSummary
): string | undefined {
  const candidatePaths = [
    typeof reelRenderSummary?.audio_path === "string"
      ? reelRenderSummary.audio_path
      : undefined,
    findReelAudioAssetRelativePath(content)
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  )

  for (const candidate of candidatePaths) {
    if (candidate.startsWith("..")) {
      continue
    }

    return toOutputRelativePath(outputRoot, join(baseDir, candidate))
  }

  return undefined
}

function findReelAudioAssetRelativePath(
  content: ContentPackage
): string | undefined {
  const audioAsset = [...content.metadata.assets]
    .reverse()
    .find((assetPath) => assetPath.startsWith("assets/reel-audio."))

  return audioAsset
}

function resolveAssetRelativePath(input: StoreReviewAssetInput): string {
  if (input.assetKind === "background-1.91x1") {
    return "assets/background-1.91x1.webp"
  }

  if (input.assetKind === "background-4x5") {
    return "assets/background-4x5.webp"
  }

  if (input.assetKind === "background-9x16") {
    return "assets/background-9x16.webp"
  }

  if (input.assetKind === "reel-shot") {
    if (
      !Number.isInteger(input.reelShotIndex) ||
      (input.reelShotIndex ?? 0) < 1
    ) {
      throw new CalendarValidationError(
        "Reel-Shot-Uploads require a valid 1-based shot index."
      )
    }

    return `assets/reel-shot-${String(input.reelShotIndex).padStart(2, "0")}.webp`
  }

  return `assets/reel-audio${normalizeAudioExtension(input.file.fileName, input.file.mimeType)}`
}

function updateAssetList(
  existingAssets: string[],
  assetRelativePath: string,
  assetKind: ReviewAssetKind
): string[] {
  if (assetKind === "reel-audio") {
    return Array.from(
      new Set([
        ...existingAssets.filter(
          (assetPath) => !assetPath.startsWith("assets/reel-audio.")
        ),
        assetRelativePath
      ])
    )
  }

  return Array.from(new Set([...existingAssets, assetRelativePath]))
}

function normalizeAudioExtension(fileName: string, mimeType: string): string {
  const fromName = extname(fileName).toLowerCase()

  if (
    fromName === ".mp3" ||
    fromName === ".m4a" ||
    fromName === ".wav" ||
    fromName === ".ogg" ||
    fromName === ".webm"
  ) {
    return fromName
  }

  if (mimeType === "audio/mpeg") {
    return ".mp3"
  }

  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") {
    return ".m4a"
  }

  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return ".wav"
  }

  if (mimeType === "audio/ogg") {
    return ".ogg"
  }

  if (mimeType === "audio/webm") {
    return ".webm"
  }

  return ".bin"
}

function toOutputRelativePath(outputRoot: string, path: string): string {
  return relative(outputRoot, path)
}

function clampInsertionIndex(
  position: number | undefined,
  length: number
): number {
  if (typeof position !== "number" || Number.isNaN(position)) {
    return length
  }

  return Math.max(0, Math.min(position, length))
}

function formatGermanWeekday(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    weekday: "long"
  }).format(new Date(`${date}T00:00:00Z`))
}

async function persistCalendarWithUpdatedCounts(
  calendarPath: string,
  calendar: Calendar
): Promise<void> {
  calendar.meta.umfang.wochen = calendar.wochen.length
  calendar.meta.umfang.beitraege = calendar.wochen.reduce(
    (total, week) => total + week.beitraege.length,
    0
  )
  await writeFile(
    calendarPath,
    `${JSON.stringify(calendar, null, 2)}\n`,
    "utf8"
  )
}

async function movePostOutputDirectory(
  sourceDir: string,
  targetDir: string
): Promise<void> {
  if (!(await pathExists(sourceDir))) {
    return
  }

  if (await pathExists(targetDir)) {
    throw new CalendarValidationError(
      `Zielordner "${targetDir}" existiert bereits. Bitte Konflikt manuell prüfen.`
    )
  }

  await mkdir(dirname(targetDir), { recursive: true })
  await rename(sourceDir, targetDir)
}

async function updateMovedContentArtifacts(
  previousBaseDir: string,
  nextBaseDir: string,
  contentPath: string,
  nextDate: string
): Promise<void> {
  await updateContentSourceDate(contentPath, nextDate)

  const imageSummaryPath = join(nextBaseDir, "image-generation-results.json")
  if (await pathExists(imageSummaryPath)) {
    const imageSummary =
      await readJsonFile<PersistedImageSummary>(imageSummaryPath)
    await writeJsonFile(imageSummaryPath, {
      ...imageSummary,
      jobs: imageSummary.jobs?.map((job) => ({
        ...job,
        assetPath:
          typeof job.assetPath === "string"
            ? job.assetPath.replace(previousBaseDir, nextBaseDir)
            : job.assetPath
      }))
    })
  }

  const exportPath = join(nextBaseDir, "review-export.json")
  if (await pathExists(exportPath)) {
    await rm(exportPath, { force: true })
  }
}

async function updateContentSourceDate(
  contentPath: string,
  nextDate: string
): Promise<void> {
  if (!(await pathExists(contentPath))) {
    return
  }

  const content = await readContentPackage(contentPath)
  await writeJsonFile(contentPath, {
    ...content,
    source: {
      ...content.source,
      date: nextDate
    }
  })
}
