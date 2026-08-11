import { reactive } from "vue"
import type { ChatSessionResponse } from "../../../server/contracts/review-contracts.js"
import {
  applyChatRevision,
  createChatSession,
  streamChatRevision,
  streamChatMessage
} from "../api/chat-api.js"

export const chatStore = reactive({
  assistantDraft: "",
  error: "",
  loading: false,
  loadingMessage: "",
  revisionDraft: "",
  session: null as ChatSessionResponse | null
})

export async function ensurePostChatSession(postId: string) {
  await ensureChatSession({
    contextType: "post",
    postId
  })
}

export async function ensureWeekChatSession(weekDate: string) {
  await ensureChatSession({
    contextType: "week",
    weekDate
  })
}

export async function ensurePlanChatSession() {
  await ensureChatSession({
    contextType: "plan"
  })
}

async function ensureChatSession(
  input:
    | { contextType: "plan" }
    | { contextType: "post"; postId: string }
    | { contextType: "week"; weekDate: string }
) {
  chatStore.loading = true
  chatStore.error = ""

  try {
    if (!chatStore.session) {
      chatStore.session = await createChatSession(input)
      return
    }
  } catch (error) {
    chatStore.error = error instanceof Error ? error.message : "Chat konnte nicht gestartet werden."
  } finally {
    chatStore.loading = false
  }
}

export async function sendMessage(text: string) {
  if (!chatStore.session) {
    throw new Error("Keine Chat-Sitzung vorhanden.")
  }

  chatStore.loading = true
  chatStore.error = ""
  chatStore.loadingMessage = "ChatGPT antwortet ..."
  const pendingSession = chatStore.session
  const optimisticUserMessage = {
    id: `user-pending-${Date.now()}`,
    kind: "discussion" as const,
    role: "user" as const,
    text
  }

  chatStore.session = {
    ...pendingSession,
    messages: [...pendingSession.messages, optimisticUserMessage]
  }
  chatStore.assistantDraft = ""

  try {
    await streamChatMessage(pendingSession.id, text, {
      onComplete: (session) => {
        chatStore.session = session
        chatStore.assistantDraft = ""
      },
      onDelta: (snapshot) => {
        chatStore.assistantDraft = snapshot
      }
    })
  } catch (error) {
    chatStore.session = pendingSession
    chatStore.error = error instanceof Error ? error.message : "Nachricht konnte nicht gesendet werden."
  } finally {
    chatStore.assistantDraft = ""
    chatStore.loading = false
    chatStore.loadingMessage = ""
  }
}

export async function sendMessageAndRevise(text: string) {
  await reviseCurrentSession(text)
}

export async function reviseCurrentSession(instruction = "") {
  if (!chatStore.session) {
    throw new Error("Keine Chat-Sitzung vorhanden.")
  }

  chatStore.loading = true
  chatStore.error = ""
  chatStore.loadingMessage = "Vollständigen Plan erstellen und validieren ..."
  chatStore.revisionDraft = ""

  try {
    await streamChatRevision(chatStore.session.id, instruction, {
      onComplete: (session) => {
        chatStore.session = session
        chatStore.revisionDraft = ""
      },
      onDelta: (snapshot) => {
        chatStore.revisionDraft = snapshot
      }
    })
  } catch (error) {
    chatStore.error = error instanceof Error ? error.message : "Revision konnte nicht angefordert werden."
  } finally {
    chatStore.loading = false
    chatStore.loadingMessage = ""
    chatStore.revisionDraft = ""
  }
}

export async function applyCurrentRevision() {
  if (!chatStore.session) {
    throw new Error("Keine Chat-Sitzung vorhanden.")
  }

  chatStore.loading = true
  chatStore.error = ""

  try {
    chatStore.session = await applyChatRevision(chatStore.session.id)
  } catch (error) {
    chatStore.error = error instanceof Error ? error.message : "Revision konnte nicht übernommen werden."
  } finally {
    chatStore.loading = false
    chatStore.loadingMessage = ""
  }
}
