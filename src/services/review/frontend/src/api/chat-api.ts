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

export async function streamChatMessage(
  sessionId: string,
  text: string,
  handlers: {
    onComplete: (session: ChatSessionResponse) => void
    onDelta: (snapshot: string) => void
  }
): Promise<void> {
  const response = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages/stream`, {
    body: JSON.stringify({ text }),
    headers: { "content-type": "application/json" },
    method: "POST"
  })

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => ({ error: "Unbekannter Fehler." }))
    throw new Error(errorBody.error ?? "Unbekannter Fehler.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }

    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) {
        continue
      }

      const event = JSON.parse(line) as
        | { type: "delta"; snapshot: string }
        | { error: string; type: "error" }
        | { session: ChatSessionResponse; type: "done" }

      if (event.type === "delta") {
        handlers.onDelta(event.snapshot)
        continue
      }

      if (event.type === "done") {
        handlers.onComplete(event.session)
        continue
      }

      throw new Error(event.error)
    }
  }
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
