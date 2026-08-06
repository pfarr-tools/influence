<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h5">Voiceover</h2>
      <div class="small text-secondary mb-3">
        Schrift: {{ subtitleFontName || "nicht gesetzt" }}
      </div>
      <form class="row g-2 align-items-end" @submit.prevent="submitUpload">
        <div class="col-md-9">
          <label class="form-label" for="voiceover-file">Audio-Datei</label>
          <input
            id="voiceover-file"
            ref="fileInput"
            class="form-control"
            type="file"
            accept="audio/*"
          />
        </div>
        <div class="col-md-3">
          <button class="btn btn-outline-primary w-100" :disabled="busy" type="submit">
            Speichern
          </button>
        </div>
      </form>
      <div v-if="error" class="alert alert-danger mt-3 mb-0">{{ error }}</div>
      <div class="mt-3">
        <a v-if="audioAssetHref" :href="audioAssetHref" target="_blank" rel="noreferrer">{{ audioLabel }}</a>
        <span v-else class="text-secondary">{{ audioLabel || "Kein Voiceover hinterlegt." }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useAssetUpload } from "../composables/useAssetUpload.js"

const props = defineProps<{
  audioAssetHref: string | null
  audioLabel: string
  onRefresh: () => Promise<void>
  postId: string
  subtitleFontName: string
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const { busy, error, submitVoiceover } = useAssetUpload(props.postId, props.onRefresh)

async function submitUpload() {
  const file = fileInput.value?.files?.[0]

  if (!file) {
    return
  }

  const formData = new FormData()
  formData.set("audio_upload", file)
  await submitVoiceover(formData)

  if (fileInput.value) {
    fileInput.value.value = ""
  }
}
</script>
