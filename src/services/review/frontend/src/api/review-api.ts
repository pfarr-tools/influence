import type {
  PostDetailResponse,
  ReviewActionApi,
  WeekActionApi,
  WeekOverviewResponse
} from "../../../server/contracts/review-contracts.js"

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => ({ error: "Unbekannter Fehler." }))
    throw new Error(errorBody.error ?? "Unbekannter Fehler.")
  }

  return response.json() as Promise<T>
}

export async function getDefaultWeekDate(): Promise<string> {
  const body = await readJson<{ date: string }>(
    await fetch("/api/weeks/default")
  )
  return body.date
}

export async function fetchWeek(
  weekDate: string
): Promise<WeekOverviewResponse> {
  return readJson<WeekOverviewResponse>(
    await fetch(`/api/weeks/${encodeURIComponent(weekDate)}`)
  )
}

export async function runWeekAction(
  weekDate: string,
  action: WeekActionApi,
  options: { force?: boolean } = {}
): Promise<WeekOverviewResponse> {
  const search = options.force ? "?force=1" : ""
  return readJson<WeekOverviewResponse>(
    await fetch(
      `/api/weeks/${encodeURIComponent(weekDate)}/actions/${action}${search}`,
      {
        method: "POST"
      }
    )
  )
}

export async function createPostIdea(
  weekDate: string,
  body: { date: string; rubric: string; title: string }
): Promise<WeekOverviewResponse> {
  return readJson<WeekOverviewResponse>(
    await fetch(`/api/weeks/${encodeURIComponent(weekDate)}/posts`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
  )
}

export async function moveWeekPost(
  weekDate: string,
  postId: string,
  body: { date: string; position?: number }
): Promise<WeekOverviewResponse> {
  return readJson<WeekOverviewResponse>(
    await fetch(
      `/api/weeks/${encodeURIComponent(weekDate)}/posts/${encodeURIComponent(postId)}/move`,
      {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST"
      }
    )
  )
}

export async function fetchPost(postId: string): Promise<PostDetailResponse> {
  return readJson<PostDetailResponse>(
    await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      cache: "no-store"
    })
  )
}

export async function fetchJsonDocument(scope: "plan" | { postId: string }): Promise<{ document: unknown; filename: string }> {
  const path = scope === "plan" ? "/api/plan/json" : `/api/posts/${encodeURIComponent(scope.postId)}/json`
  return readJson(await fetch(path, { cache: "no-store" }))
}

export async function saveJsonDocument(
  scope: "plan" | { postId: string },
  document: unknown
): Promise<{ document: unknown; filename: string; notice: string }> {
  const path = scope === "plan" ? "/api/plan/json" : `/api/posts/${encodeURIComponent(scope.postId)}/json`
  return readJson(await fetch(path, {
    body: JSON.stringify({ document }),
    headers: { "content-type": "application/json" },
    method: "PUT"
  }))
}

export async function runPostAction(
  postId: string,
  action: Exclude<ReviewActionApi, "export">,
  body?: unknown,
  options: { force?: boolean } = {}
): Promise<PostDetailResponse> {
  const search = options.force ? "?force=1" : ""
  return readJson<PostDetailResponse>(
    await fetch(
      `/api/posts/${encodeURIComponent(postId)}/actions/${action}${search}`,
      {
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { "content-type": "application/json" } : undefined,
        method: "POST"
      }
    )
  )
}

export async function deletePost(postId: string): Promise<{ notice: string }> {
  return readJson(
    await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE"
    })
  )
}

export async function schedulePost(
  postId: string,
  body: { date: string; position?: number }
): Promise<PostDetailResponse> {
  return readJson<PostDetailResponse>(
    await fetch(`/api/posts/${encodeURIComponent(postId)}/schedule`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
  )
}

/** Starts one existing automatic publication job immediately. */
export async function publishPostNow(
  postId: string,
  platform: string
): Promise<PostDetailResponse> {
  return readJson<PostDetailResponse>(
    await fetch(
      `/api/posts/${encodeURIComponent(postId)}/publication/${encodeURIComponent(platform)}/now`,
      { method: "POST" }
    )
  )
}

export async function cancelScheduledPublication(
  postId: string,
  platform: string,
  format = "default"
): Promise<PostDetailResponse> {
  return readJson<PostDetailResponse>(
    await fetch(
      `/api/posts/${encodeURIComponent(postId)}/publication/${encodeURIComponent(platform)}?format=${encodeURIComponent(format)}`,
      { method: "DELETE" }
    )
  )
}
