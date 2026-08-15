<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h2 class="h5 mb-1">Assets</h2>
          <p class="text-secondary small mb-0">
            Manuelle Uploads werden auf bekannte Asset-Slots verteilt.
          </p>
        </div>
        <button
          class="btn btn-outline-secondary btn-sm"
          type="button"
          @click="openModal = true"
        >
          Asset hochladen
        </button>
      </div>
      <ul class="list-group list-group-flush mt-3">
        <li
          v-for="asset in assets"
          :key="asset.href"
          class="list-group-item px-0 d-flex justify-content-between align-items-center gap-2"
        >
          <a
            class="text-truncate"
            :href="asset.href"
            target="_blank"
            rel="noreferrer"
            >{{ asset.label }}</a
          >
          <span class="d-flex gap-2 flex-shrink-0">
            <a
              class="btn btn-sm btn-outline-secondary"
              :download="asset.label.split('/').pop()"
              :href="asset.href"
              >Download</a
            >
            <button
              class="btn btn-sm btn-outline-danger"
              type="button"
              @click="removeAsset(asset)"
            >
              Löschen
            </button>
          </span>
        </li>
      </ul>
    </div>
  </section>

  <BaseModal
    :open="openModal"
    dialog-class="asset-modal-dialog"
    title="Asset hochladen"
    @close="closeModal"
  >
    <div class="row g-4">
      <div class="col-lg-4">
        <div class="mb-3">
          <label class="form-label" for="asset-file">Datei</label>
          <input
            id="asset-file"
            ref="fileInput"
            class="form-control"
            type="file"
            @change="handleFileChange"
          />
        </div>
        <div class="alert alert-secondary mb-3">
          Bilddateien können nach dem Upload in mehrere feste Zielgrößen
          zugeschnitten werden.
        </div>
        <div class="mb-3">
          <label class="form-label" for="asset-image-credits"
            >Image credits</label
          >
          <input
            id="asset-image-credits"
            v-model="imageCredits"
            class="form-control"
            type="text"
          />
        </div>
        <label class="form-check mb-3">
          <input v-model="isAi" class="form-check-input" type="checkbox" />
          <span class="form-check-label">KI</span>
        </label>
        <div v-if="localError" class="alert alert-danger mb-3">
          {{ localError }}
        </div>
        <div v-if="successMessage" class="alert alert-success mb-3">
          {{ successMessage }}
        </div>
        <div class="mb-3">
          <div class="fw-semibold mb-2">Bild-Assets</div>
          <div class="d-grid gap-2">
            <label
              v-for="target in imageTargets"
              :key="target.kind"
              class="asset-target-option"
            >
              <input
                v-model="selectedKinds"
                class="form-check-input mt-0"
                type="checkbox"
                :value="target.kind"
                :disabled="selectedFile ? !isImageFile(selectedFile) : false"
              />
              <span>{{ target.label }}</span>
            </label>
          </div>
        </div>
        <div class="mb-3">
          <div class="fw-semibold mb-2">Audio-Asset</div>
          <label class="asset-target-option">
            <input
              v-model="selectedKinds"
              class="form-check-input mt-0"
              type="checkbox"
              value="reel-audio"
              :disabled="selectedFile ? !isAudioFile(selectedFile) : false"
            />
            <span>Reel-Audio / Voiceover</span>
          </label>
        </div>
        <div v-if="selectedKinds.includes('reel-shot')" class="mb-3">
          <label class="form-label" for="asset-reel-shot-index"
            >Reel-Shot</label
          >
          <select
            id="asset-reel-shot-index"
            v-model="reelShotIndex"
            class="form-select"
          >
            <option
              v-for="index in reelShotOptions"
              :key="index"
              :value="index"
            >
              Shot {{ index }}
            </option>
          </select>
        </div>
      </div>

      <div class="col-lg-8">
        <div class="asset-crop-shell">
          <div
            class="d-flex justify-content-between align-items-start gap-3 mb-3"
          >
            <div>
              <div class="fw-semibold">{{ currentCropLabel }}</div>
              <div class="small text-secondary">{{ currentCropMeta }}</div>
            </div>
            <div
              v-if="selectedImageKinds.length > 0"
              class="small text-secondary"
            >
              {{ currentTargetIndex + 1 }} / {{ selectedImageKinds.length }}
            </div>
          </div>
          <div class="asset-crop-stage-wrap">
            <div
              ref="cropStage"
              class="asset-crop-stage"
              :style="currentAspectStyle"
              @pointerdown="startDrag"
              @pointermove="moveDrag"
              @pointerup="stopDrag"
              @pointercancel="stopDrag"
            >
              <img
                v-if="selectedImageUrl"
                ref="cropImage"
                :src="selectedImageUrl"
                alt=""
                :style="cropImageStyle"
              />
            </div>
          </div>
          <div class="small text-secondary mt-2">
            Im Bild ziehen zum Positionieren, Zoom-Regler für den Ausschnitt.
          </div>
          <div class="mt-3">
            <label class="form-label" for="asset-crop-zoom">Zoom</label>
            <input
              id="asset-crop-zoom"
              v-model="currentZoom"
              class="form-range"
              max="3"
              min="1"
              step="0.01"
              type="range"
            />
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button
              v-for="(kind, index) in selectedImageKinds"
              :key="kind"
              :class="
                index === currentTargetIndex
                  ? 'btn btn-sm btn-primary'
                  : 'btn btn-sm btn-outline-secondary'
              "
              type="button"
              @click="currentTargetIndex = index"
            >
              {{ descriptorForKind(kind)?.label ?? kind }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="btn btn-outline-secondary"
        type="button"
        @click="closeModal"
      >
        Abbrechen
      </button>
      <button
        class="btn btn-primary"
        :disabled="busy || !canSubmit"
        type="button"
        @click="submitUpload"
      >
        Asset speichern
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import BaseModal from "./BaseModal.vue"
import { useAssetUpload } from "../composables/useAssetUpload.js"
import { deleteAsset } from "../api/asset-api.js"

type ImageTargetKind =
  "background-1.91x1" | "background-4x5" | "background-9x16" | "reel-shot"

const imageTargets = [
  {
    height: 630,
    kind: "background-1.91x1",
    label: "Hintergrund 1.91:1",
    width: 1200
  },
  {
    height: 1350,
    kind: "background-4x5",
    label: "Hintergrund 4:5",
    width: 1080
  },
  {
    height: 1920,
    kind: "background-9x16",
    label: "Hintergrund 9:16",
    width: 1080
  },
  { height: 1920, kind: "reel-shot", label: "Reel-Shot", width: 1080 }
] as const

const props = defineProps<{
  assets: Array<{ href: string; kind: string; label: string }>
  imageCredits: string
  onRefresh: () => Promise<void>
  postId: string
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const cropStage = ref<HTMLDivElement | null>(null)
const cropImage = ref<HTMLImageElement | null>(null)
const openModal = ref(false)
const selectedFile = ref<File | null>(null)
const selectedImageUrl = ref("")
const selectedKinds = ref<string[]>([])
const imageCredits = ref(props.imageCredits)
const isAi = ref(false)
const reelShotIndex = ref(1)
const currentTargetIndex = ref(0)
const currentZoom = ref("1")
const successMessage = ref("")
const localError = ref("")
const dragState = ref<{
  pointerId: number
  startX: number
  startY: number
} | null>(null)
const cropStates = ref<
  Record<string, { offsetX: number; offsetY: number; zoom: number }>
>({})
const { busy, error, submitAsset } = useAssetUpload(
  props.postId,
  props.onRefresh
)

async function removeAsset(asset: { href: string; label: string }) {
  if (!window.confirm(`Asset „${asset.label}“ wirklich löschen?`)) return
  try {
    await deleteAsset(props.postId, asset.label)
    await props.onRefresh()
  } catch (value) {
    localError.value =
      value instanceof Error
        ? value.message
        : "Asset konnte nicht gelöscht werden."
  }
}

watch(error, (value) => {
  localError.value = value
})

const reelShotOptions = computed(() =>
  Math.max(
    1,
    props.assets.filter((asset) => asset.kind === "reel-shot").length + 1
  )
)
const selectedImageKinds = computed(() =>
  selectedKinds.value.filter((kind) => kind !== "reel-audio")
)
const currentTargetKind = computed(
  () =>
    selectedImageKinds.value[currentTargetIndex.value] as
      ImageTargetKind | undefined
)
const currentDescriptor = computed(() =>
  descriptorForKind(currentTargetKind.value)
)
const currentCropLabel = computed(
  () =>
    currentDescriptor.value?.label ??
    (selectedImageUrl.value ? "Bildzuschnitt" : "Kein Bild geladen")
)
const currentCropMeta = computed(() => {
  if (!selectedImageUrl.value) {
    return "Wähle ein Bild und mindestens ein Ziel."
  }
  if (!currentDescriptor.value) {
    return "Wähle ein Ziel und positioniere den Ausschnitt."
  }
  return `Zielgröße ${currentDescriptor.value.width} × ${currentDescriptor.value.height} Pixel`
})
const currentAspectStyle = computed(() => {
  const descriptor = currentDescriptor.value
  const width = descriptor?.width ?? 16
  const height = descriptor?.height ?? 9
  const aspectRatio = width / height

  return {
    aspectRatio: `${width} / ${height}`,
    maxWidth: `min(100%, 38rem, calc(60vh * ${aspectRatio}))`
  }
})
const canSubmit = computed(() =>
  Boolean(selectedFile.value && selectedKinds.value.length > 0)
)

watch(currentTargetKind, () => {
  const state = getCurrentCropState()
  currentZoom.value = String(state.zoom)
})

watch(currentZoom, (value) => {
  const state = getCurrentCropState()
  state.zoom = Number.parseFloat(value) || 1
})

function descriptorForKind(kind?: string) {
  return imageTargets.find((target) => target.kind === kind)
}

function isImageFile(file: File) {
  return file.type.startsWith("image/")
}

function isAudioFile(file: File) {
  return file.type.startsWith("audio/")
}

function currentCropKey() {
  return `${currentTargetKind.value ?? "none"}:${reelShotIndex.value}`
}

function getCurrentCropState() {
  const key = currentCropKey()
  if (!cropStates.value[key]) {
    cropStates.value[key] = { offsetX: 0, offsetY: 0, zoom: 1 }
  }
  return cropStates.value[key]
}

function resetModalState() {
  localError.value = ""
  successMessage.value = ""
  selectedFile.value = null
  selectedKinds.value = []
  imageCredits.value = props.imageCredits
  isAi.value = false
  reelShotIndex.value = 1
  currentTargetIndex.value = 0
  currentZoom.value = "1"
  cropStates.value = {}
  if (selectedImageUrl.value) {
    URL.revokeObjectURL(selectedImageUrl.value)
    selectedImageUrl.value = ""
  }
  if (fileInput.value) {
    fileInput.value.value = ""
  }
}

function closeModal() {
  openModal.value = false
  resetModalState()
}

function handleFileChange() {
  successMessage.value = ""
  localError.value = ""
  const file = fileInput.value?.files?.[0] ?? null
  selectedFile.value = file
  selectedKinds.value = []
  currentTargetIndex.value = 0
  cropStates.value = {}

  if (selectedImageUrl.value) {
    URL.revokeObjectURL(selectedImageUrl.value)
    selectedImageUrl.value = ""
  }

  if (file && isImageFile(file)) {
    selectedImageUrl.value = URL.createObjectURL(file)
  }
}

function clampCurrentCropState() {
  const descriptor = currentDescriptor.value
  const image = cropImage.value
  const stage = cropStage.value
  if (!descriptor || !image || !stage) {
    return
  }
  const state = getCurrentCropState()
  const frameWidth = stage.clientWidth || 640
  const frameHeight =
    stage.clientHeight ||
    Math.round((frameWidth * descriptor.height) / descriptor.width)
  const baseScale = Math.max(
    frameWidth / image.naturalWidth,
    frameHeight / image.naturalHeight
  )
  const scaledWidth = image.naturalWidth * baseScale * state.zoom
  const scaledHeight = image.naturalHeight * baseScale * state.zoom
  const maxOffsetX = Math.max(0, (scaledWidth - frameWidth) / 2)
  const maxOffsetY = Math.max(0, (scaledHeight - frameHeight) / 2)
  state.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, state.offsetX))
  state.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, state.offsetY))
}

const cropImageStyle = computed(() => {
  const descriptor = currentDescriptor.value
  const image = cropImage.value
  const stage = cropStage.value
  if (!descriptor || !image || !stage) {
    return {}
  }
  const state = getCurrentCropState()
  clampCurrentCropState()
  const frameWidth = stage.clientWidth || 640
  const frameHeight =
    stage.clientHeight ||
    Math.round((frameWidth * descriptor.height) / descriptor.width)
  const baseScale = Math.max(
    frameWidth / image.naturalWidth,
    frameHeight / image.naturalHeight
  )
  const displayWidth = image.naturalWidth * baseScale * state.zoom
  const displayHeight = image.naturalHeight * baseScale * state.zoom
  return {
    height: `${displayHeight}px`,
    left: "50%",
    position: "absolute",
    top: "50%",
    transform: `translate(calc(-50% + ${state.offsetX}px), calc(-50% + ${state.offsetY}px))`,
    width: `${displayWidth}px`
  }
})

function startDrag(event: PointerEvent) {
  if (!selectedImageUrl.value || !currentDescriptor.value) {
    return
  }
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY
  }
  cropStage.value?.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!dragState.value || dragState.value.pointerId !== event.pointerId) {
    return
  }
  const state = getCurrentCropState()
  state.offsetX += event.clientX - dragState.value.startX
  state.offsetY += event.clientY - dragState.value.startY
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY
  }
  clampCurrentCropState()
}

function stopDrag(event: PointerEvent) {
  if (dragState.value?.pointerId !== event.pointerId) {
    return
  }
  cropStage.value?.releasePointerCapture(event.pointerId)
  dragState.value = null
}

async function renderCroppedBlob(kind: ImageTargetKind): Promise<Blob> {
  const descriptor = descriptorForKind(kind)
  const image = cropImage.value
  const stage = cropStage.value
  if (!descriptor || !image || !stage) {
    throw new Error("Bildzuschnitt ist nicht verfügbar.")
  }

  const cropKey = `${kind}:${reelShotIndex.value}`
  const state = cropStates.value[cropKey] ?? { offsetX: 0, offsetY: 0, zoom: 1 }
  const frameWidth = stage.clientWidth || 640
  const frameHeight =
    stage.clientHeight ||
    Math.round((frameWidth * descriptor.height) / descriptor.width)
  const baseScale = Math.max(
    frameWidth / image.naturalWidth,
    frameHeight / image.naturalHeight
  )
  const displayWidth = image.naturalWidth * baseScale * state.zoom
  const displayHeight = image.naturalHeight * baseScale * state.zoom
  const scaleBackX = image.naturalWidth / displayWidth
  const scaleBackY = image.naturalHeight / displayHeight
  const sourceWidth = frameWidth * scaleBackX
  const sourceHeight = frameHeight * scaleBackY
  const centerX = image.naturalWidth / 2 - state.offsetX * scaleBackX
  const centerY = image.naturalHeight / 2 - state.offsetY * scaleBackY
  const sourceX = Math.max(
    0,
    Math.min(image.naturalWidth - sourceWidth, centerX - sourceWidth / 2)
  )
  const sourceY = Math.max(
    0,
    Math.min(image.naturalHeight - sourceHeight, centerY - sourceHeight / 2)
  )
  const canvas = document.createElement("canvas")
  canvas.width = descriptor.width
  canvas.height = descriptor.height
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas-Kontext konnte nicht erstellt werden.")
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    descriptor.width,
    descriptor.height
  )
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Bildzuschnitt konnte nicht exportiert werden."))
          return
        }
        resolve(blob)
      },
      "image/webp",
      0.95
    )
  })
}

async function submitUpload() {
  const file = selectedFile.value

  if (!file) {
    return
  }

  localError.value = ""
  successMessage.value = ""

  try {
    for (const kind of selectedKinds.value) {
      const formData = new FormData()
      formData.set("asset_kind", kind)
      formData.set("image_credits", imageCredits.value)
      formData.set("is_ai", String(isAi.value))
      if (kind === "reel-shot") {
        formData.set("reel_shot_index", String(reelShotIndex.value))
      }
      if (kind === "reel-audio") {
        formData.set("asset_upload", file)
      } else {
        const blob = await renderCroppedBlob(kind as ImageTargetKind)
        formData.set("asset_upload", blob, `${kind}.webp`)
      }
      await submitAsset(formData)
    }
    successMessage.value = "Asset gespeichert."
    await props.onRefresh()
  } catch (uploadError) {
    localError.value =
      uploadError instanceof Error
        ? uploadError.message
        : "Asset konnte nicht gespeichert werden."
  }
}
</script>

<style scoped>
.asset-target-option {
  align-items: center;
  background: #fffdfa;
  border: 1px solid #d6d0c4;
  border-radius: 0.85rem;
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
}

.asset-crop-shell {
  background: #fffdfa;
  border: 1px solid #d6d0c4;
  border-radius: 0.85rem;
  padding: 1rem;
}

.asset-crop-stage-wrap {
  background: linear-gradient(135deg, #f8f1df, #eef4ee);
  border: 1px dashed #cdbf9c;
  border-radius: 0.85rem;
  padding: 1rem;
}

.asset-crop-stage {
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid #6e7f63;
  border-radius: 0.75rem;
  cursor: grab;
  margin: 0 auto;
  overflow: hidden;
  position: relative;
  width: min(100%, 38rem);
}

.asset-crop-stage:active {
  cursor: grabbing;
}

.asset-crop-stage img {
  max-width: none;
  pointer-events: none;
  user-select: none;
}

:deep(.asset-modal-dialog) {
  max-width: min(96vw, 78rem);
}
</style>
