<template>
  <BaseModal :open="open" dialog-class="chat-modal-dialog" title="JSON mit ChatGPT" @close="$emit('close')">
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h5 mb-0">Diskussion</h2>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" :disabled="busy || !session" @click="$emit('revise')">
            Revision anfordern
          </button>
          <button class="btn btn-outline-primary btn-sm" :disabled="busy || !session?.revision" @click="$emit('apply')">
            Revision übernehmen
          </button>
        </div>
      </div>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>
      <div class="chat-stream border rounded p-3 mb-3">
        <div v-for="message in session?.messages ?? []" :key="message.id" class="mb-3">
          <div class="fw-semibold text-capitalize">{{ message.role }}</div>
          <div class="small chat-markdown" v-html="renderMarkdown(message.text)" />
        </div>
        <div v-if="assistantDraft.length > 0" class="mb-3">
          <div class="fw-semibold text-capitalize">assistant</div>
          <div class="small chat-markdown" v-html="renderMarkdown(assistantDraft)" />
        </div>
        <div v-if="busy" class="chat-status text-secondary small">
          <span class="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          {{ loadingMessage || "Antwort wird geladen ..." }}
        </div>
      </div>
      <div v-if="session?.revision" class="alert alert-light border">
        <div class="fw-semibold">Letzte Revision</div>
        <div>{{ session.revision.summary }}</div>
      </div>
      <form @submit.prevent="submitMessage">
        <label class="form-label" for="chat-message">Nachricht</label>
        <textarea id="chat-message" v-model="draft" class="form-control" rows="4" />
        <button class="btn btn-primary mt-3" :disabled="busy || draft.trim().length === 0" type="submit">
          Nachricht senden
        </button>
      </form>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { marked } from "marked"
import { ref } from "vue"
import type { ChatSessionResponse } from "../../../server/contracts/review-contracts.js"
import BaseModal from "./BaseModal.vue"

const draft = ref("")

defineProps<{
  assistantDraft: string
  busy: boolean
  error: string
  loadingMessage: string
  open: boolean
  session: ChatSessionResponse | null
}>()

const emit = defineEmits<{
  apply: []
  close: []
  revise: []
  send: [text: string]
}>()

function submitMessage() {
  emit("send", draft.value)
  draft.value = ""
}

function renderMarkdown(text: string): string {
  return marked.parse(escapeHtml(text), { breaks: true }) as string
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
</script>

<style scoped>
.chat-stream {
  max-height: 20rem;
  overflow: auto;
}

.chat-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.chat-status {
  align-items: center;
  display: flex;
}

:deep(.chat-modal-dialog) {
  max-width: min(96vw, 78rem);
}
</style>
