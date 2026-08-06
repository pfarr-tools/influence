import type {
  PostDetailResponse,
  ReviewActionApi,
  WeekActionApi,
  WeekOverviewResponse
} from "../../../server/contracts/review-contracts.js"

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Unbekannter Fehler." }))
    throw new Error(errorBody.error ?? "Unbekannter Fehler.")
  }

  return response.json() as Promise<T>
}

export async function getDefaultWeekDate(): Promise<string> {
  const body = await readJson<{ date: string }>(await fetch("/api/weeks/default"))
  return body.date
}

export async function fetchWeek(weekDate: string): Promise<WeekOverviewResponse> {
  return readJson<WeekOverviewResponse>(await fetch(`/api/weeks/${encodeURIComponent(weekDate)}`))
}

export async function runWeekAction(
  weekDate: string,
  action: WeekActionApi
): Promise<WeekOverviewResponse> {
  return readJson<WeekOverviewResponse>(
    await fetch(`/api/weeks/${encodeURIComponent(weekDate)}/actions/${action}`, {
      method: "POST"
    })
  )
}

export async function createPostIdea(weekDate: string, body: { date: string; rubric: string; title: string }): Promise<WeekOverviewResponse> {
  return readJson<WeekOverviewResponse>(await fetch(`/api/weeks/${encodeURIComponent(weekDate)}/posts`, {
    body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST"
  }))
}

export async function fetchPost(postId: string): Promise<PostDetailResponse> {
  return readJson<PostDetailResponse>(await fetch(`/api/posts/${encodeURIComponent(postId)}`))
}

export async function runPostAction(
  postId: string,
  action: Exclude<ReviewActionApi, "export">,
  body?: unknown
): Promise<PostDetailResponse> {
  return readJson<PostDetailResponse>(
    await fetch(`/api/posts/${encodeURIComponent(postId)}/actions/${action}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "content-type": "application/json" } : undefined,
      method: "POST"
    })
  )
}

export async function deletePost(postId: string): Promise<{ notice: string }> {
  return readJson(await fetch(`/api/posts/${encodeURIComponent(postId)}`, { method: "DELETE" }))
}
