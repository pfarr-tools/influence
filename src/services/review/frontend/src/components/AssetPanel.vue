<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h5">Assets</h2>
      <form class="row g-2 align-items-end" @submit.prevent="submitUpload">
        <div class="col-md-4">
          <label class="form-label" for="asset-kind">Ziel</label>
          <select id="asset-kind" v-model="assetKind" class="form-select">
            <option value="background-1.91x1">Hintergrund 1.91:1</option>
            <option value="background-4x5">Hintergrund 4:5</option>
            <option value="background-9x16">Hintergrund 9:16</option>
            <option value="reel-shot">Reel-Shot</option>
            <option value="reel-audio">Reel-Audio</option>
          </select>
        </div>
        <div class="col-md-5">
          <label class="form-label" for="asset-file">Datei</label>
          <input id="asset-file" ref="fileInput" class="form-control" type="file" />
        </div>
        <div class="col-md-3">
          <button class="btn btn-outline-primary w-100" :disabled="busy" type="submit">
            Hochladen
          </button>
        </div>
      </form>
      <div v-if="error" class="alert alert-danger mt-3 mb-0">{{ error }}</div>
      <ul class="list-group list-group-flush mt-3">
        <li v-for="asset in assets" :key="asset.href" class="list-group-item px-0">
          <a :href="asset.href" target="_blank" rel="noreferrer">{{ asset.label }}</a>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useAssetUpload } from "../composables/useAssetUpload.js"

const props = defineProps<{
  assets: Array<{ href: string; kind: string; label: string }>
  onRefresh: () => Promise<void>
  postId: string
}>()

const assetKind = ref("background-4x5")
const fileInput = ref<HTMLInputElement | null>(null)
const { busy, error, submitAsset } = useAssetUpload(props.postId, props.onRefresh)

async function submitUpload() {
  const file = fileInput.value?.files?.[0]

  if (!file) {
    return
  }

  const formData = new FormData()
  formData.set("asset_kind", assetKind.value)
  formData.set("asset_upload", file)
  await submitAsset(formData)

  if (fileInput.value) {
    fileInput.value.value = ""
  }
}
</script>
