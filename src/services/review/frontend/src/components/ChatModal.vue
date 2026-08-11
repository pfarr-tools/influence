<template>
  <BaseModal :open="open" dialog-class="chat-modal-dialog" title="JSON mit ChatGPT" @close="$emit('close')">
    <div>
      <h2 class="h5 mb-3">Diskussion</h2>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>
      <div ref="chatStream" class="chat-stream border rounded p-3 mb-3">
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
            <div v-if="session.revision.errors.length > 0" class="alert alert-danger small mt-3 mb-0">
              <div v-for="errorDetail in session.revision.errors" :key="errorDetail">{{ errorDetail }}</div>
            </div>
            <details v-if="session.revision.rawOutput" class="mt-3">
              <summary class="small text-secondary">Roh-Ausgabe anzeigen</summary>
              <pre class="raw-revision-output small mt-2 mb-0">{{ session.revision.rawOutput }}</pre>
            </details>
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
          {{ loadingMessage || "Antwort wird geladen ..." }} ({{ loadingSeconds }} s)
        </div>
        <details v-if="busy && revisionDraft" open class="revision-live-output mb-3">
          <summary class="small text-secondary">Laufende Roh-Ausgabe</summary>
          <pre class="raw-revision-output small mt-2 mb-0">{{ revisionDraft }}</pre>
        </details>
      </div>
      <form @submit.prevent="submitMessage">
        <label class="form-label" for="chat-message">Nachricht</label>
        <textarea
          id="chat-message"
          v-model="draft"
          class="form-control"
          rows="4"
          @keydown.ctrl.enter.prevent="submitMessage"
        />
        <button class="btn btn-primary mt-3" :disabled="busy || draft.trim().length === 0" type="submit">
          Nachricht senden
        </button>
        <button
          class="btn btn-outline-primary mt-3 ms-2"
          :disabled="busy || draft.trim().length === 0"
          type="button"
          @click="submitAndRevise"
        >
          Senden und Revision anfordern
        </button>
      </form>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { marked } from "marked"
import { computed, nextTick, onUnmounted, ref, watch } from "vue"
import type { ChatSessionResponse } from "../../../server/contracts/review-contracts.js"
import BaseModal from "./BaseModal.vue"

const draft = ref("")
const chatStream = ref<HTMLElement | null>(null)
const loadingSeconds = ref(0)
let loadingTimer: ReturnType<typeof setInterval> | null = null

const props = defineProps<{
  assistantDraft: string
  busy: boolean
  error: string
  loadingMessage: string
  revisionDraft: string
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
  sendAndRevise: [text: string]
  send: [text: string]
}>()

function submitMessage() {
  if (props.busy || draft.value.trim().length === 0) {
    return
  }

  emit("send", draft.value)
  draft.value = ""
}

function submitAndRevise() {
  if (props.busy || draft.value.trim().length === 0) {
    return
  }

  emit("sendAndRevise", draft.value)
  draft.value = ""
}

watch(
  () => [props.session?.messages.length, props.assistantDraft, props.busy],
  async () => {
    await nextTick()
    if (chatStream.value) {
      chatStream.value.scrollTop = chatStream.value.scrollHeight
    }
  }
)

watch(
  () => props.busy,
  (busy) => {
    if (loadingTimer) {
      clearInterval(loadingTimer)
      loadingTimer = null
    }

    if (!busy) {
      loadingSeconds.value = 0
      return
    }

    const startedAt = Date.now()
    loadingSeconds.value = 0
    loadingTimer = setInterval(() => {
      loadingSeconds.value = Math.floor((Date.now() - startedAt) / 1000)
    }, 1000)
  },
  { immediate: true }
)

onUnmounted(() => {
  if (loadingTimer) {
    clearInterval(loadingTimer)
  }
})

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

.raw-revision-output {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

:deep(.chat-modal-dialog) {
  max-width: min(96vw, 78rem);
}
</style>
