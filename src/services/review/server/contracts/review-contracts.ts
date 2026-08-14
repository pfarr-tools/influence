import { z } from "zod"

const workflowSchema = z.object({
  contentGenerated: z.boolean(),
  exportGenerated: z.boolean(),
  imagesGenerated: z.boolean(),
  qaReadyForApproval: z.boolean(),
  qaRun: z.boolean(),
  reelImagesGenerated: z.boolean(),
  reelRendered: z.boolean(),
  rendered: z.boolean(),
  scaffolded: z.boolean()
})

const reviewActionSchema = z.enum([
  "approve",
  "approve-publication",
  "edit",
  "export",
  "generate",
  "images",
  "images-reel",
  "mark-generated",
  "qa",
  "render",
  "render-reel",
  "scaffold"
])

const weekActionSchema = z.enum([
  "generate",
  "images",
  "images-reel",
  "qa",
  "render",
  "render-reel",
  "scaffold"
])

const assetKindSchema = z.enum([
  "background-1.91x1",
  "background-4x5",
  "background-9x16",
  "reel-audio",
  "reel-shot"
])

const reviewActionButtonSchema = z.object({
  action: reviewActionSchema,
  completed: z.boolean(),
  disabled: z.boolean(),
  label: z.string(),
  method: z.enum(["GET", "POST"]),
  primary: z.boolean(),
  supportsForce: z.boolean()
})

const weekActionButtonSchema = z.object({
  action: weekActionSchema,
  completed: z.boolean(),
  disabled: z.boolean(),
  label: z.string(),
  method: z.enum(["POST"]),
  primary: z.boolean(),
  supportsForce: z.boolean()
})

const postCardSchema = z.object({
  actionHref: z.string(),
  badges: z.array(z.string()),
  date: z.string(),
  postId: z.string(),
  rubric: z.string(),
  scheduledTime: z.string(),
  status: z.string(),
  theme: z.string(),
  weekday: z.string(),
  workflow: workflowSchema
})

const weekSummarySchema = z.object({
  endDate: z.string(),
  focus: z.string(),
  id: z.string(),
  postCount: z.number(),
  posts: z.array(postCardSchema),
  startDate: z.string()
})

const noticeSchema = z.object({
  kind: z.enum(["error", "notice"]),
  text: z.string()
})

const weekOverviewResponseSchema = z.object({
  defaultWeekDate: z.string(),
  notices: z.array(noticeSchema),
  selectedWeek: weekSummarySchema,
  weekActions: z.array(weekActionButtonSchema),
  weekOptions: z.array(
    z.object({
      endDate: z.string(),
      id: z.string(),
      label: z.string(),
      startDate: z.string()
    })
  )
})

const previewItemSchema = z.object({
  href: z.string(),
  label: z.string()
})

const assetItemSchema = z.object({
  href: z.string(),
  kind: assetKindSchema,
  label: z.string()
})

const postDetailResponseSchema = z.object({
  assets: z.array(assetItemSchema),
  chatContext: z.object({
    contextType: z.literal("post"),
    postId: z.string()
  }),
  content: z.object({
    altText: z.string(),
    audience: z.string(),
    concept: z.string(),
    facebookHeadline: z.string(),
    facebookText: z.string(),
    fluxPrompt: z.string(),
    instagramCaption: z.string(),
    instagramCarousel: z.array(
      z.object({
        text: z.string(),
        type: z.string()
      })
    ),
    mainMessage: z.string(),
    mastodonText: z.string(),
    blueskyText: z.string().optional().default(""),
    platforms: z.object({
      bluesky: z.object({ text: z.string() })
    }).optional(),
    reelHook: z.string(),
    reelScript: z.string(),
    storySlides: z.array(z.string()),
    title: z.string()
  }),
  exportDownloadHref: z.string(),
  facebookImageHref: z.string().nullable(),
  facebookShareUrl: z.string().nullable(),
  notices: z.array(noticeSchema),
  publicationDefaultTime: z.string(),
  post: z.object({
    date: z.string(),
    publicationTime: z.string(),
    postId: z.string(),
    rubric: z.string(),
    status: z.string(),
    theme: z.string(),
    weekday: z.string()
  }),
  publicationApproved: z.boolean(),
  publicationChannels: z.array(z.object({
    platform: z.string(),
    format: z.string(),
    scheduledAt: z.string().nullable(),
    timezone: z.string(),
    status: z.string(),
    remoteUrl: z.string().nullable()
  })),
  previousPostHref: z.string().nullable(),
  nextPostHref: z.string().nullable(),
  previewGroups: z.array(
    z.object({
      items: z.array(previewItemSchema),
      title: z.string()
    })
  ),
  qaSummary: z.object({
    errors: z.array(z.string()),
    readyForApproval: z.boolean(),
    warnings: z.array(z.string())
  }),
  reel: z.object({
    audioAssetHref: z.string().nullable(),
    audioLabel: z.string(),
    durationSeconds: z.number(),
    previewHref: z.string().nullable(),
    subtitleFontName: z.string(),
    subtitleFontsDir: z.string(),
    voiceoverSegments: z.array(
      z.object({
        endSeconds: z.number(),
        index: z.number(),
        startSeconds: z.number(),
        text: z.string()
      })
    )
  }),
  viewBackHref: z.string(),
  workflow: workflowSchema,
  workflowActions: z.array(reviewActionButtonSchema)
})

const chatMessageSchema = z.object({
  id: z.string(),
  kind: z.enum(["discussion", "revision_request", "revision_result"]),
  role: z.enum(["assistant", "system", "user"]),
  text: z.string()
})

const chatRevisionSchema = z.object({
  applied: z.boolean(),
  errors: z.array(z.string()),
  instructions: z.string(),
  rawOutput: z.string().nullable(),
  summary: z.string()
})

const chatSessionResponseSchema = z.object({
  contextLabel: z.string(),
  id: z.string(),
  messages: z.array(chatMessageSchema),
  revision: chatRevisionSchema.nullable(),
  status: z.string()
})

export const postEditRequestSchema = z.object({
  altText: z.string(),
  audience: z.string(),
  concept: z.string(),
  facebookHeadline: z.string(),
  facebookText: z.string(),
  fluxPrompt: z.string(),
  instagramCaption: z.string(),
  instagramCarousel: z.array(
    z.object({
      text: z.string(),
      type: z.string()
    })
  ),
  mainMessage: z.string(),
  mastodonText: z.string(),
  publicationTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  blueskyText: z.string().optional().default(""),
  reelHook: z.string(),
  reelScript: z.string(),
  storySlides: z.array(z.string()),
  title: z.string()
})

export const postIdeaRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rubric: z.string().min(1),
  title: z.string().min(1)
})

export const weekPostMoveRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  position: z.number().int().min(0).optional()
})

export const postScheduleRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  position: z.number().int().min(0).optional()
})

export const chatSessionCreateRequestSchema = z.object({
  contextType: z.enum(["plan", "post", "week"]),
  model: z.string().optional(),
  planPath: z.string().optional(),
  postId: z.string().optional(),
  prompt: z.string().optional(),
  weekDate: z.string().optional()
})

export const chatMessageRequestSchema = z.object({
  model: z.string().optional(),
  text: z.string().min(1)
})

export const chatRevisionRequestSchema = z.object({
  model: z.string().optional(),
  text: z.string().optional()
})

export const jsonDocumentResponseSchema = z.object({
  document: z.unknown(),
  filename: z.string()
})

export const jsonDocumentSaveResponseSchema = z.object({
  document: z.unknown(),
  filename: z.string(),
  notice: z.string()
})

export const jsonDocumentSaveRequestSchema = z.object({
  document: z.unknown()
})

export const voiceoverUploadResponseSchema = z.object({
  notice: z.string(),
  storedPath: z.string()
})

export const assetUploadResponseSchema = z.object({
  notice: z.string(),
  storedPath: z.string()
})

export const noticeResponseSchema = z.object({
  notice: z.string()
})

export const reviewActionSchemaPublic = reviewActionSchema
export const weekActionSchemaPublic = weekActionSchema
export const assetKindSchemaPublic = assetKindSchema
export const publicationPlatformSchemaPublic = z.enum([
  "instagram",
  "mastodon",
  "threads",
  "bluesky",
  "linkedin",
  "facebook"
])
export const workflowSchemaPublic = workflowSchema
export const weekOverviewResponseSchemaPublic = weekOverviewResponseSchema
export const postDetailResponseSchemaPublic = postDetailResponseSchema
export const chatSessionResponseSchemaPublic = chatSessionResponseSchema

export type AssetKindApi = z.infer<typeof assetKindSchema>
export type ChatSessionCreateRequest = z.infer<
  typeof chatSessionCreateRequestSchema
>
export type ChatSessionResponse = z.infer<typeof chatSessionResponseSchema>
export type PostDetailResponse = z.infer<typeof postDetailResponseSchema>
export type PostEditRequest = z.infer<typeof postEditRequestSchema>
export type PostIdeaRequest = z.infer<typeof postIdeaRequestSchema>
export type ReviewActionApi = z.infer<typeof reviewActionSchema>
export type ReviewActionButton = z.infer<typeof reviewActionButtonSchema>
export type WeekActionApi = z.infer<typeof weekActionSchema>
export type WeekOverviewResponse = z.infer<typeof weekOverviewResponseSchema>
