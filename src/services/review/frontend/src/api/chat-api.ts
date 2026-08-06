import type {
  ChatSessionCreateRequest,
  ChatSessionResponse
} from "../../../server/contracts/review-contracts.js"

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Unbekannter Fehler." }))
    throw new Error(errorBody.error ?? "Unbekannter Fehler.")
  }

  return response.json() as Promise<T>
}

export async function createChatSession(
  body: ChatSessionCreateRequest
): Promise<ChatSessionResponse> {
  return readJson<ChatSessionResponse>(
    await fetch("/api/chat/sessions", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
  )
}

export async function fetchChatSession(sessionId: string): Promise<ChatSessionResponse> {
  return readJson<ChatSessionResponse>(
    await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`)
  )
}

export async function sendChatMessage(
  sessionId: string,
  text: string
): Promise<ChatSessionResponse> {
  return readJson<ChatSessionResponse>(
    await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
      body: JSON.stringify({ text }),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
  )
}

export async function requestChatRevision(
  sessionId: string
): Promise<ChatSessionResponse> {
  return readJson<ChatSessionResponse>(
    await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/revise`, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
  )
}

export async function applyChatRevision(
  sessionId: string
): Promise<ChatSessionResponse> {
  return readJson<ChatSessionResponse>(
    await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/apply`, {
      method: "POST"
    })
  )
}
