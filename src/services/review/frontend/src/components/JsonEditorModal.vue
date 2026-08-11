<template>
  <BaseModal :open="open" :title="`JSON bearbeiten: ${filename || 'Dokument'}`" dialog-class="json-editor-dialog" @close="$emit('close')">
    <div v-if="error" class="alert alert-danger">
      <div v-for="detail in errorDetails" :key="detail">{{ detail }}</div>
    </div>
    <div class="json-editor-shell">
      <pre ref="highlightElement" aria-hidden="true" class="json-editor-highlight" v-html="highlightedJson" />
      <textarea
        ref="editorElement"
        v-model="jsonText"
        class="json-editor-input"
        spellcheck="false"
        aria-label="JSON-Dokument"
        @input="clearError"
        @scroll="syncScroll"
      />
    </div>
    <div class="d-flex justify-content-between align-items-center mt-3">
      <span class="small text-secondary">Änderungen werden vor dem Speichern gegen das Schema geprüft.</span>
      <button class="btn btn-primary" type="button" :disabled="busy || !jsonText.trim()" @click="save">
        {{ busy ? "Prüfe und speichere ..." : "Speichern" }}
      </button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import BaseModal from "./BaseModal.vue"
import { fetchJsonDocument, saveJsonDocument } from "../api/review-api.js"

const props = defineProps<{ open: boolean; scope: "plan" | { postId: string } }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const jsonText = ref("")
const filename = ref("")
const error = ref("")
const busy = ref(false)
const editorElement = ref<HTMLTextAreaElement | null>(null)
const highlightElement = ref<HTMLElement | null>(null)
const errorDetails = computed(() => error.value.split("\n").filter(Boolean))
const highlightedJson = computed(() => highlightJson(jsonText.value))

watch(() => props.open, async (open) => {
  if (!open) return
  error.value = ""
  try {
    const result = await fetchJsonDocument(props.scope)
    jsonText.value = JSON.stringify(result.document, null, 2)
    filename.value = result.filename
    await nextTick()
    syncScroll()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "JSON konnte nicht geladen werden."
  }
})

function clearError() { error.value = "" }

async function save() {
  let document: unknown
  try {
    document = JSON.parse(jsonText.value)
  } catch (caught) {
    error.value = `Ungültiges JSON: ${caught instanceof Error ? caught.message : "Syntaxfehler."}`
    return
  }

  busy.value = true
  error.value = ""
  try {
    const result = await saveJsonDocument(props.scope, document)
    jsonText.value = JSON.stringify(result.document, null, 2)
    emit("saved")
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "JSON konnte nicht gespeichert werden."
  } finally {
    busy.value = false
  }
}

function syncScroll() {
  if (editorElement.value && highlightElement.value) {
    highlightElement.value.scrollTop = editorElement.value.scrollTop
    highlightElement.value.scrollLeft = editorElement.value.scrollLeft
  }
}

function highlightJson(value: string): string {
  const escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  return escaped.replace(/("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g, (match, key, string, boolean, number) => {
    if (key) return `<span class="json-token-key">${key}</span>`
    if (string) return `<span class="json-token-string">${string}</span>`
    if (boolean) return `<span class="json-token-boolean">${boolean}</span>`
    return `<span class="json-token-number">${number}</span>`
  })
}
</script>

<style scoped>
.json-editor-shell { position: relative; height: min(68vh, 46rem); overflow: hidden; border: 1px solid var(--bs-border-color); border-radius: .375rem; background: #20252b; }
.json-editor-highlight, .json-editor-input { box-sizing: border-box; font: 0.86rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; height: 100%; margin: 0; padding: 1rem; white-space: pre; width: 100%; }
.json-editor-highlight { color: #d8dee9; overflow: hidden; pointer-events: none; position: absolute; inset: 0; }
.json-editor-input { background: transparent; border: 0; color: transparent; caret-color: white; outline: 0; overflow: auto; position: relative; resize: none; tab-size: 2; }
.json-token-key { color: #81a1c1; }
.json-token-string { color: #a3be8c; }
.json-token-boolean { color: #b48ead; }
.json-token-number { color: #ebcb8b; }
:deep(.json-editor-dialog) { max-width: min(96vw, 90rem); }
</style>
