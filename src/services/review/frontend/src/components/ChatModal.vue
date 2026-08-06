<template>
  <section class="card shadow-sm">
    <div class="card-body">
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
          <div class="small whitespace-pre-wrap">{{ message.text }}</div>
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
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue"
import type { ChatSessionResponse } from "../../../server/contracts/review-contracts.js"

const draft = ref("")

defineProps<{
  busy: boolean
  error: string
  session: ChatSessionResponse | null
}>()

const emit = defineEmits<{
  apply: []
  revise: []
  send: [text: string]
}>()

function submitMessage() {
  emit("send", draft.value)
  draft.value = ""
}
</script>

<style scoped>
.chat-stream {
  max-height: 20rem;
  overflow: auto;
}

.whitespace-pre-wrap {
  white-space: pre-wrap;
}
</style>
