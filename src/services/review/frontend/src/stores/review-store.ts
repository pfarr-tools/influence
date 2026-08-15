import { reactive } from "vue"
import type {
  PostDetailResponse,
  PublicationQueueResponse,
  ReviewActionApi,
  WeekActionApi,
  WeekOverviewResponse
} from "../../../server/contracts/review-contracts.js"
import {
  fetchPost,
  fetchPublicationQueue,
  fetchWeek,
  getDefaultWeekDate,
  moveWeekPost as moveWeekPostApi,
  duplicatePublicationJob as duplicatePublicationJobApi,
  removePublicationJob as removePublicationJobApi,
  reschedulePublicationJob as reschedulePublicationJobApi,
  cancelScheduledPublication as cancelScheduledPublicationApi,
  publishPostNow as publishPostNowApi,
  runPostAction,
  schedulePost as schedulePostApi,
  runWeekAction
} from "../api/review-api.js"
import { createPostIdea, deletePost } from "../api/review-api.js"

export const reviewStore = reactive({
  activeAction: "" as string,
  error: "",
  loading: false,
  loadingMessage: "",
  post: null as PostDetailResponse | null,
  publicationQueue: null as PublicationQueueResponse | null,
  week: null as WeekOverviewResponse | null
})

export async function loadWeek(weekDate?: string) {
  await withLoading("", async () => {
    const selectedWeekDate = weekDate ?? (await getDefaultWeekDate())
    reviewStore.week = await fetchWeek(selectedWeekDate)
    reviewStore.post = null
  }, "Woche konnte nicht geladen werden.")
}

export async function loadPublicationQueue() {
  await withLoading("", async () => {
    reviewStore.publicationQueue = await fetchPublicationQueue()
  }, "Warteschlange konnte nicht geladen werden.")
}

export async function reschedulePublicationJob(jobId: string, scheduledAt: string) {
  await withLoading("", async () => {
    reviewStore.publicationQueue = await reschedulePublicationJobApi(jobId, scheduledAt)
  }, "Veröffentlichung konnte nicht umgeplant werden.")
}

export async function removePublicationJob(jobId: string) {
  await withLoading("", async () => {
    reviewStore.publicationQueue = await removePublicationJobApi(jobId)
  }, "Veröffentlichung konnte nicht entfernt werden.")
}

export async function duplicatePublicationJob(jobId: string) {
  await withLoading("", async () => {
    reviewStore.publicationQueue = await duplicatePublicationJobApi(jobId)
  }, "Veröffentlichung konnte nicht dupliziert werden.")
}

export async function triggerWeekAction(
  weekDate: string,
  action: WeekActionApi,
  options: { force?: boolean } = {}
) {
  await withLoading(
    getWeekActionLoadingMessage(action, options.force ?? false),
    async () => {
      reviewStore.week = await runWeekAction(weekDate, action, options)
    },
    "Wochenaktion fehlgeschlagen.",
    action
  )
}

export async function addPostIdea(weekDate: string, body: { date: string; rubric: string; title: string }) {
  await withLoading("", async () => {
    reviewStore.week = await createPostIdea(weekDate, body)
  }, "Idee konnte nicht angelegt werden.")
}

export async function moveWeekPost(
  weekDate: string,
  postId: string,
  body: { date: string; position?: number }
) {
  await withLoading("", async () => {
    reviewStore.week = await moveWeekPostApi(weekDate, postId, body)
  }, "Beitrag konnte nicht verschoben werden.")
}

export async function removePost(postId: string) {
  await withLoading("", async () => {
    await deletePost(postId)
  }, "Beitrag konnte nicht gelöscht werden.")
}

export async function loadPost(postId: string) {
  await withLoading("", async () => {
    reviewStore.post = await fetchPost(postId)
  }, "Beitrag konnte nicht geladen werden.")
}

export async function triggerPostAction(
  postId: string,
  action: Exclude<ReviewActionApi, "export">,
  body?: unknown,
  options: { force?: boolean } = {}
) {
  await withLoading(
    getPostActionLoadingMessage(action, options.force ?? false),
    async () => {
      reviewStore.post = await runPostAction(postId, action, body, options)
    },
    "Beitragsaktion fehlgeschlagen.",
    action
  )
}

export async function reschedulePost(
  postId: string,
  body: { date: string; position?: number }
) {
  await withLoading("", async () => {
    reviewStore.post = await schedulePostApi(postId, body)
  }, "Termin konnte nicht aktualisiert werden.")
}

export async function publishPostNow(postId: string, platform: string) {
  await withLoading(
    "Veröffentlichung wird gestartet ...",
    async () => {
      reviewStore.post = await publishPostNowApi(postId, platform)
    },
    "Veröffentlichung konnte nicht gestartet werden.",
    platform
  )
}

export async function cancelScheduledPublication(
  postId: string,
  platform: string,
  format = "default"
) {
  await withLoading(
    "Planung wird aufgehoben ...",
    async () => {
      reviewStore.post = await cancelScheduledPublicationApi(postId, platform, format)
    },
    "Veröffentlichungsplanung konnte nicht aufgehoben werden.",
    platform
  )
}

async function withLoading(
  loadingMessage: string,
  run: () => Promise<void>,
  fallbackError: string,
  action = ""
) {
  reviewStore.loading = true
  reviewStore.loadingMessage = loadingMessage
  reviewStore.activeAction = action
  reviewStore.error = ""

  try {
    await run()
  } catch (error) {
    reviewStore.error = error instanceof Error ? error.message : fallbackError
  } finally {
    reviewStore.activeAction = ""
    reviewStore.loading = false
    reviewStore.loadingMessage = ""
  }
}

function getPostActionLoadingMessage(
  action: Exclude<ReviewActionApi, "export">,
  force: boolean
) {
  switch (action) {
    case "generate":
      return force ? "Beitrag wird neu generiert ..." : "Beitrag wird generiert ..."
    case "mark-generated":
      return "Manueller Inhalt wird als generiert markiert ..."
    case "images":
      return force ? "Bilder werden neu erzeugt ..." : "Bilder werden erzeugt ..."
    case "images-reel":
      return force ? "Reelbilder werden neu erzeugt ..." : "Reelbilder werden erzeugt ..."
    case "render":
      return force
        ? "Social-Bilder werden neu gerendert ..."
        : "Social-Bilder werden gerendert ..."
    case "render-reel":
      return force ? "Reel wird neu gerendert ..." : "Reel wird gerendert ..."
    default:
      return ""
  }
}

function getWeekActionLoadingMessage(action: WeekActionApi, force: boolean) {
  switch (action) {
    case "generate":
      return force ? "Woche wird neu generiert ..." : "Woche wird generiert ..."
    case "images":
      return force ? "Wochenbilder werden neu erzeugt ..." : "Wochenbilder werden erzeugt ..."
    case "images-reel":
      return force ? "Wochen-Reelbilder werden neu erzeugt ..." : "Wochen-Reelbilder werden erzeugt ..."
    case "render":
      return force ? "Woche wird neu gerendert ..." : "Woche wird gerendert ..."
    case "render-reel":
      return force ? "Wochen-Reels werden neu gerendert ..." : "Wochen-Reels werden gerendert ..."
    default:
      return ""
  }
}
