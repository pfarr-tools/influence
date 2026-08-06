import { basename } from "node:path"

import type {
  ReviewPostDetail,
  ReviewWeekOverview,
  ReviewWorkflowState
} from "../../review-service.js"
import type { ContentChatSession } from "../../content-chat-service.js"
import type {
  ChatSessionResponse,
  PostDetailResponse,
  ReviewActionApi,
  ReviewActionButton,
  WeekActionApi,
  WeekOverviewResponse
} from "../contracts/review-contracts.js"

const reviewActionOrder: ReviewActionApi[] = [
  "edit",
  "scaffold",
  "generate",
  "qa",
  "approve",
  "images",
  "images-reel",
  "render",
  "render-reel",
  "export"
]

const weekActionOrder: WeekActionApi[] = [
  "scaffold",
  "generate",
  "qa",
  "images",
  "images-reel",
  "render",
  "render-reel"
]

const reviewActionLabels: Record<ReviewActionApi, string> = {
  approve: "Freigeben",
  edit: "Speichern",
  export: "Exportieren",
  generate: "Generieren",
  images: "Bilder erzeugen",
  "images-reel": "Reelbilder erzeugen",
  qa: "Prüfen",
  render: "Social-Bilder rendern",
  "render-reel": "Reel rendern",
  scaffold: "Gerüst anlegen"
}

const weekActionLabels: Record<WeekActionApi, string> = {
  generate: "Woche generieren",
  images: "Wochenbilder erzeugen",
  "images-reel": "Wochen-Reelbilder erzeugen",
  qa: "Woche prüfen",
  render: "Woche rendern",
  "render-reel": "Wochen-Reels rendern",
  scaffold: "Wochengerüste anlegen"
}

export function buildWeekOverviewResponse(
  overview: ReviewWeekOverview,
  notices: Array<{ kind: "error" | "notice"; text: string }> = []
): WeekOverviewResponse {
  return {
    defaultWeekDate: overview.selectedWeek.startDate,
    notices,
    selectedWeek: {
      ...overview.selectedWeek,
      posts: overview.selectedWeek.posts.map((post) => ({
        actionHref: `/posts/${encodeURIComponent(post.postId)}`,
        badges: summarizeWorkflowBadges(post.workflow, post),
        date: post.date,
        postId: post.postId,
        rubric: post.rubric,
        status: post.status,
        theme: post.theme,
        weekday: post.weekday,
        workflow: post.workflow
      }))
    },
    weekActions: weekActionOrder.map((action, index) => ({
      action,
      completed: isWeekActionCompleted(action, overview.selectedWeek.posts),
      disabled: false,
      label: weekActionLabels[action],
      method: "POST",
      primary: index === 0,
      supportsForce: supportsForceAction(action)
    })),
    weekOptions: overview.weekOptions.map((week) => ({
      endDate: week.endDate,
      id: week.id,
      label: `${week.startDate} bis ${week.endDate}`,
      startDate: week.startDate
    }))
  }
}

export function buildPostDetailResponse(
  detail: ReviewPostDetail,
  weekDate: string,
  notices: Array<{ kind: "error" | "notice"; text: string }> = [],
  navigation: { previousPostId?: string; nextPostId?: string } = {}
): PostDetailResponse {
  const cacheVersion = Date.now()

  return {
    assets: detail.assetPaths.map((assetPath) => ({
      href: buildCacheBustedFileHref(assetPath, cacheVersion),
      kind: inferAssetKind(assetPath),
      label: basename(assetPath)
    })),
    chatContext: {
      contextType: "post",
      postId: detail.post.id
    },
    content: {
      altText: detail.content.visual.alt_text,
      audience: detail.content.editorial_core.audience,
      concept: detail.content.visual.concept,
      facebookHeadline: detail.content.platforms.facebook.headline,
      facebookText: detail.content.platforms.facebook.text,
      fluxPrompt: detail.content.visual.flux_prompt,
      instagramCaption: detail.content.platforms.instagram.caption,
      instagramCarousel: detail.content.platforms.instagram.carousel.map(
        (card) => ({
          text: card.text,
          type: card.type
        })
      ),
      mainMessage: detail.content.editorial_core.main_message,
      mastodonText: detail.content.platforms.mastodon.text,
      reelHook: detail.content.platforms.reel.hook,
      reelScript: detail.content.platforms.reel.script,
      storySlides: detail.content.platforms.story.slides.map(
        (slide) => slide.text
      ),
      title: detail.content.editorial_core.title
    },
    exportDownloadHref: `/api/posts/${encodeURIComponent(detail.post.id)}/export`,
    notices,
    post: {
      date: detail.post.datum,
      postId: detail.post.id,
      rubric: detail.post.rubrik,
      status: detail.content.status,
      theme: detail.post.thema,
      weekday: detail.post.wochentag
    },
    previousPostHref: navigation.previousPostId
      ? `/posts/${encodeURIComponent(navigation.previousPostId)}`
      : null,
    nextPostHref: navigation.nextPostId
      ? `/posts/${encodeURIComponent(navigation.nextPostId)}`
      : null,
    previewGroups: [
      {
        items: detail.renderPreviewPaths.map((path, index) => ({
          href: buildCacheBustedFileHref(path, cacheVersion),
          label: `Social-Bild ${index + 1}`
        })),
        title: "Social-Bilder"
      },
      {
        items: detail.imagePreviewPaths.map((path, index) => ({
          href: buildCacheBustedFileHref(path, cacheVersion),
          label: `Bild ${index + 1}`
        })),
        title: "Generierte Assets"
      }
    ].filter((group) => group.items.length > 0),
    qaSummary: {
      errors: detail.qaSummary?.errors ?? [],
      readyForApproval: detail.qaSummary?.ready_for_approval ?? false,
      warnings: detail.qaSummary?.warnings ?? []
    },
    reel: {
      audioAssetHref: detail.reelAudioAssetPath
        ? buildCacheBustedFileHref(detail.reelAudioAssetPath, cacheVersion)
        : null,
      audioLabel: detail.reelAudioPath,
      durationSeconds: resolveVoiceoverDurationSeconds(detail),
      previewHref: detail.reelPreviewPath
        ? buildCacheBustedFileHref(detail.reelPreviewPath, cacheVersion)
        : null,
      subtitleFontName: detail.reelSubtitleFontName,
      subtitleFontsDir: detail.reelSubtitleFontsDir,
      voiceoverSegments: buildVoiceoverCueSegments(detail)
    },
    viewBackHref: `/weeks/${encodeURIComponent(weekDate)}`,
    workflow: detail.workflow,
    workflowActions: buildReviewActionButtons(detail.workflow)
  }
}

function buildCacheBustedFileHref(
  relativePath: string,
  cacheVersion: number
): string {
  return `/files/${relativePath}?v=${encodeURIComponent(String(cacheVersion))}`
}

function buildVoiceoverCueSegments(detail: ReviewPostDetail): Array<{
  endSeconds: number
  index: number
  startSeconds: number
  text: string
}> {
  const durationSeconds = resolveVoiceoverDurationSeconds(detail)
  const shots = detail.content.platforms.reel.shots
  const script = detail.content.platforms.reel.script
  const scriptChunks = buildVoiceoverScriptChunks(script)
  const cueTexts =
    scriptChunks.length > 0
      ? scriptChunks
      : shots.filter((shot) => shot.trim().length > 0)
  const segmentCount = Math.max(cueTexts.length, shots.length, 1)
  const safeDurationSeconds = Math.max(durationSeconds, segmentCount)
  const segmentDuration = safeDurationSeconds / segmentCount
  const segments: Array<{
    endSeconds: number
    index: number
    startSeconds: number
    text: string
  }> = []

  for (let index = 0; index < segmentCount; index += 1) {
    segments.push({
      endSeconds: Number(((index + 1) * segmentDuration).toFixed(3)),
      index,
      startSeconds: Number((index * segmentDuration).toFixed(3)),
      text:
        cueTexts[Math.min(index, cueTexts.length - 1)] ??
        "Voiceover ohne Skript"
    })
  }

  return segments
}

function buildVoiceoverScriptChunks(script: string): string[] {
  const normalized = script.replace(/\s+/g, " ").trim()

  if (normalized.length === 0) {
    return []
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)

  if (sentences.length <= 1) {
    return wrapVoiceoverChunk(normalized)
  }

  const chunks: string[] = []

  for (let index = 0; index < sentences.length; index += 2) {
    chunks.push(
      wrapVoiceoverChunk(sentences.slice(index, index + 2).join(" ")).join("\n")
    )
  }

  return chunks
}

function wrapVoiceoverChunk(text: string): string[] {
  if (text.length <= 54) {
    return [text]
  }

  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`

    if (candidate.length > 54 && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = word
      continue
    }

    currentLine = candidate
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines
}

function resolveVoiceoverDurationSeconds(detail: ReviewPostDetail): number {
  const persistedDuration = detail.reelRenderSummary?.duration_seconds

  if (
    typeof persistedDuration === "number" &&
    Number.isFinite(persistedDuration) &&
    persistedDuration > 0
  ) {
    return persistedDuration
  }

  const scriptChunks = buildVoiceoverScriptChunks(
    detail.content.platforms.reel.script
  )
  const shotCount = detail.content.platforms.reel.shots.length
  return Math.max(6, shotCount * 3, scriptChunks.length * 2, 1)
}

export function buildChatSessionResponse(
  session: ContentChatSession
): ChatSessionResponse {
  const latestRevision = session.revisions.at(-1)

  return {
    contextLabel:
      session.contextType === "post"
        ? `Beitrag ${session.contextRef}`.trim()
        : session.contextType === "week"
          ? `Woche ${session.contextRef}`.trim()
          : `Plan ${session.contextRef}`.trim(),
    id: session.id,
    messages: session.messages.map((message, index) => ({
      id: `${message.role}-${index}`,
      kind: message.kind,
      role: message.role,
      text: message.content
    })),
    revision: latestRevision
      ? {
          applied: latestRevision.appliedAt !== null,
          instructions: latestRevision.diff.join("\n"),
          summary:
            latestRevision.validationStatus === "valid"
              ? "Revision ist strukturell gültig."
              : `Revision enthält ${latestRevision.validationErrors.length} Validierungsfehler.`
        }
      : null,
    status: latestRevision ? latestRevision.validationStatus : "ohne Revision"
  }
}

function buildReviewActionButtons(
  workflow: ReviewWorkflowState
): ReviewActionButton[] {
  return reviewActionOrder.map((action, index) => ({
    action,
    completed: isReviewActionCompleted(action, workflow),
    disabled: isReviewActionDisabled(action, workflow),
    label: reviewActionLabels[action],
    method: action === "export" ? "GET" : "POST",
    primary: index === 0,
    supportsForce: supportsForceAction(action)
  }))
}

function isReviewActionCompleted(
  action: ReviewActionApi,
  workflow: ReviewWorkflowState
): boolean {
  switch (action) {
    case "generate":
      return workflow.contentGenerated
    case "images":
      return workflow.imagesGenerated
    case "images-reel":
      return workflow.reelImagesGenerated
    case "render":
      return workflow.rendered
    case "render-reel":
      return workflow.reelRendered
    default:
      return false
  }
}

function isWeekActionCompleted(
  action: WeekActionApi,
  posts: ReviewWeekOverview["selectedWeek"]["posts"]
): boolean {
  if (posts.length === 0) {
    return false
  }

  switch (action) {
    case "generate":
      return posts.every((post) => post.workflow.contentGenerated)
    case "images":
      return posts.every((post) => post.workflow.imagesGenerated)
    case "images-reel":
      return posts.every((post) => post.workflow.reelImagesGenerated)
    case "render":
      return posts.every((post) => post.workflow.rendered)
    case "render-reel":
      return posts.every((post) => post.workflow.reelRendered)
    default:
      return false
  }
}

function supportsForceAction(action: ReviewActionApi | WeekActionApi): boolean {
  return [
    "generate",
    "images",
    "images-reel",
    "render",
    "render-reel"
  ].includes(action)
}

function isReviewActionDisabled(
  action: ReviewActionApi,
  workflow: ReviewWorkflowState
): boolean {
  switch (action) {
    case "approve":
      return !workflow.qaReadyForApproval
    case "export":
      return !workflow.rendered
    case "images":
    case "images-reel":
    case "qa":
    case "render":
    case "render-reel":
      return !workflow.contentGenerated
    default:
      return false
  }
}

function summarizeWorkflowBadges(
  workflow: ReviewWorkflowState,
  post: {
    contentExists: boolean
    isApproved: boolean
    qaReadyForApproval: boolean
  }
): string[] {
  return [
    post.contentExists ? "Inhalt vorhanden" : "Kein Inhalt",
    workflow.qaRun ? "QA erfolgt" : "QA offen",
    post.qaReadyForApproval ? "Freigabereif" : "Nicht freigabereif",
    post.isApproved ? "Freigegeben" : "Nicht freigegeben"
  ]
}

function inferAssetKind(assetPath: string) {
  if (assetPath.includes("background-1.91x1")) {
    return "background-1.91x1" as const
  }
  if (assetPath.includes("background-9x16")) {
    return "background-9x16" as const
  }
  if (assetPath.includes("reel-audio")) {
    return "reel-audio" as const
  }
  if (assetPath.includes("reel-shot")) {
    return "reel-shot" as const
  }
  return "background-4x5" as const
}
