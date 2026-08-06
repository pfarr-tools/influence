<template>
  <BaseModal :open="open" dialog-class="chat-modal-dialog" title="JSON mit ChatGPT" @close="$emit('close')">
    <div>
      <h2 class="h5 mb-3">Diskussion</h2>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>
      <div class="chat-stream border rounded p-3 mb-3">
        <div v-for="message in session?.messages ?? []" :key="message.id" class="mb-3">
          <div class="fw-semibold text-capitalize">{{ message.role }}</div>
          <div class="small chat-markdown" v-html="renderMarkdown(message.text)" />
          <button
            v-if="message.role === 'assistant' && message.kind === 'discussion'"
            class="btn btn-outline-secondary btn-sm mt-3"
            :disabled="busy"
            type="button"
            @click="$emit('revise')"
          >
            Revision anfordern
          </button>
          <div
            v-if="message.kind === 'revision_result' && message.id === latestRevisionMessageId && session?.revision"
            class="revision-result mt-3"
          >
            <div class="fw-semibold">Revision</div>
            <div class="small">{{ session.revision.summary }}</div>
            <button
              v-if="session.status === 'valid' && !session.revision.applied"
              class="btn btn-outline-primary btn-sm mt-3"
              :disabled="busy"
              type="button"
              @click="$emit('apply')"
            >
              Übernehmen
            </button>
          </div>
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
import { computed, ref } from "vue"
import type { ChatSessionResponse } from "../../../server/contracts/review-contracts.js"
import BaseModal from "./BaseModal.vue"

const draft = ref("")

const props = defineProps<{
  assistantDraft: string
  busy: boolean
  error: string
  loadingMessage: string
  open: boolean
  session: ChatSessionResponse | null
}>()

const latestRevisionMessageId = computed(() =>
  [...(props.session?.messages ?? [])].reverse().find((message) => message.kind === "revision_result")?.id
)

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

.revision-result {
  border-left: 3px solid var(--bs-primary);
  padding-left: 0.75rem;
}

:deep(.chat-modal-dialog) {
  max-width: min(96vw, 78rem);
}
</style>
