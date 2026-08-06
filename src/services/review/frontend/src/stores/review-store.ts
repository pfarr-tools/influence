import { reactive } from "vue"
import type {
  PostDetailResponse,
  ReviewActionApi,
  WeekActionApi,
  WeekOverviewResponse
} from "../../../server/contracts/review-contracts.js"
import {
  fetchPost,
  fetchWeek,
  getDefaultWeekDate,
  runPostAction,
  runWeekAction
} from "../api/review-api.js"
import { createPostIdea, deletePost } from "../api/review-api.js"

export const reviewStore = reactive({
  error: "",
  loading: false,
  post: null as PostDetailResponse | null,
  week: null as WeekOverviewResponse | null
})

export async function loadWeek(weekDate?: string) {
  reviewStore.loading = true
  reviewStore.error = ""

  try {
    const selectedWeekDate = weekDate ?? (await getDefaultWeekDate())
    reviewStore.week = await fetchWeek(selectedWeekDate)
    reviewStore.post = null
  } catch (error) {
    reviewStore.error = error instanceof Error ? error.message : "Woche konnte nicht geladen werden."
  } finally {
    reviewStore.loading = false
  }
}

export async function triggerWeekAction(weekDate: string, action: WeekActionApi) {
  reviewStore.loading = true
  reviewStore.error = ""

  try {
    reviewStore.week = await runWeekAction(weekDate, action)
  } catch (error) {
    reviewStore.error = error instanceof Error ? error.message : "Wochenaktion fehlgeschlagen."
  } finally {
    reviewStore.loading = false
  }
}

export async function addPostIdea(weekDate: string, body: { date: string; rubric: string; title: string }) {
  reviewStore.loading = true
  reviewStore.error = ""
  try { reviewStore.week = await createPostIdea(weekDate, body) }
  catch (error) { reviewStore.error = error instanceof Error ? error.message : "Idee konnte nicht angelegt werden." }
  finally { reviewStore.loading = false }
}

export async function removePost(postId: string) {
  reviewStore.loading = true
  reviewStore.error = ""
  try { await deletePost(postId) }
  catch (error) { reviewStore.error = error instanceof Error ? error.message : "Beitrag konnte nicht gelöscht werden." }
  finally { reviewStore.loading = false }
}

export async function loadPost(postId: string) {
  reviewStore.loading = true
  reviewStore.error = ""

  try {
    reviewStore.post = await fetchPost(postId)
  } catch (error) {
    reviewStore.error = error instanceof Error ? error.message : "Beitrag konnte nicht geladen werden."
  } finally {
    reviewStore.loading = false
  }
}

export async function triggerPostAction(
  postId: string,
  action: Exclude<ReviewActionApi, "export">,
  body?: unknown
) {
  reviewStore.loading = true
  reviewStore.error = ""

  try {
    reviewStore.post = await runPostAction(postId, action, body)
  } catch (error) {
    reviewStore.error = error instanceof Error ? error.message : "Beitragsaktion fehlgeschlagen."
  } finally {
    reviewStore.loading = false
  }
}
