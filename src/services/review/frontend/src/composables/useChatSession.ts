import { watch } from "vue"
import {
  applyCurrentRevision,
  chatStore,
  ensurePostChatSession,
  reviseCurrentSession,
  sendMessage
} from "../stores/chat-store.js"

export function useChatSession(postId: () => string) {
  watch(
    postId,
    async (value) => {
      if (value.length > 0) {
        chatStore.session = null
        await ensurePostChatSession(value)
      }
    },
    { immediate: true }
  )

  return {
    applyCurrentRevision,
    chatStore,
    reviseCurrentSession,
    sendMessage
  }
}
