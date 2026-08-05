import { join, relative } from "node:path"

import type { Calendar, CalendarPost, CalendarWeek } from "../../domain/calendar.js"
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
  post: CalendarPost
  content: ContentPackage
  contentPath: string
  exportPath: string
  imagePreviewPaths: string[]
  imageSummary?: PersistedImageSummary
  qaSummary?: PersistedQaSummary
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
  mainMessage: string
  mastodonText: string
  reelHook: string
  reelScript: string
  storySlides: string[]
  title: string
}

export interface ReviewExportResult {
  exportPath: string
  fileName: string
}

export interface ReviewRegenerateDependencies
  extends ContentGeneratorDependencies {
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
      calendar.wochen.map((week) => buildReviewWeekSummary(week, outputRoot, false))
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
  const qaSummary = await readOptionalJson<PersistedQaSummary>(qaPath)
  const renderSummary = await readOptionalJson<PersistedRenderSummary>(renderPath)
  const imageSummary = await readOptionalJson<PersistedImageSummary>(imagePath)

  return {
    post,
    content,
    contentPath: contentPaths.contentPath,
    exportPath: join(contentPaths.baseDir, "review-export.json"),
    imagePreviewPaths: resolveImagePreviewPaths(contentPaths.baseDir, outputRoot, content, imageSummary),
    imageSummary,
    qaSummary,
    renderPreviewPaths: resolveRenderPreviewPaths(contentPaths.baseDir, outputRoot, renderSummary),
    renderSummary,
    workflow: await buildWorkflowState(contentPaths.baseDir, content, qaSummary, imageSummary, renderSummary)
  }
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
        caption: input.instagramCaption
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
      image_generation_results:
        (await pathExists(join(contentPaths.baseDir, "image-generation-results.json")))
          ? "image-generation-results.json"
          : null,
      qa_results:
        (await pathExists(join(contentPaths.baseDir, "qa-results.json")))
          ? "qa-results.json"
          : null,
      render_results:
        (await pathExists(join(contentPaths.baseDir, "render-results.json")))
          ? "render-results.json"
          : null
    },
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
      ? await Promise.all(week.beitraege.map((post) => buildReviewPostCard(post, outputRoot)))
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
  const workflow = await buildWorkflowState(
    contentPaths.baseDir,
    content,
    qaSummary,
    imageSummary,
    renderSummary
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
  renderSummary?: PersistedRenderSummary
): Promise<ReviewWorkflowState> {
  return {
    contentGenerated: content.metadata.generated_at.trim().length > 0,
    exportGenerated: await pathExists(join(baseDir, "review-export.json")),
    imagesGenerated:
      (imageSummary?.jobs?.some((job) => job.status === "succeeded") ?? false) ||
      content.metadata.assets.length > 0,
    qaReadyForApproval: qaSummary?.ready_for_approval ?? false,
    qaRun: qaSummary !== undefined,
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
      ?.filter((job) => job.status === "succeeded" && typeof job.assetPath === "string")
      .map((job) => toOutputRelativePath(outputRoot, job.assetPath as string)) ?? []

  const contentAssets = content.metadata.assets.map((assetPath) =>
    toOutputRelativePath(outputRoot, join(baseDir, assetPath))
  )

  return Array.from(new Set([...successfulJobs, ...contentAssets]))
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
      .filter((path): path is string => typeof path === "string" && path.length > 0) ?? []
  )
}

function toOutputRelativePath(outputRoot: string, path: string): string {
  return relative(outputRoot, path)
}
