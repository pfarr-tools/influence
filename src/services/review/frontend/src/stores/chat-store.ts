import { reactive } from "vue"
import type { ChatSessionResponse } from "../../../server/contracts/review-contracts.js"
import {
  applyChatRevision,
  createChatSession,
  requestChatRevision,
  sendChatMessage
} from "../api/chat-api.js"

export const chatStore = reactive({
  error: "",
  loading: false,
  session: null as ChatSessionResponse | null
})

export async function ensurePostChatSession(postId: string) {
  chatStore.loading = true
  chatStore.error = ""

  try {
    if (!chatStore.session) {
      chatStore.session = await createChatSession({
        contextType: "post",
        postId
      })
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

  try {
    chatStore.session = await sendChatMessage(chatStore.session.id, text)
  } catch (error) {
    chatStore.error = error instanceof Error ? error.message : "Nachricht konnte nicht gesendet werden."
  } finally {
    chatStore.loading = false
  }
}

export async function reviseCurrentSession() {
  if (!chatStore.session) {
    throw new Error("Keine Chat-Sitzung vorhanden.")
  }

  chatStore.loading = true
  chatStore.error = ""

  try {
    chatStore.session = await requestChatRevision(chatStore.session.id)
  } catch (error) {
    chatStore.error = error instanceof Error ? error.message : "Revision konnte nicht angefordert werden."
  } finally {
    chatStore.loading = false
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
  }
}
