<template>
  <section class="card shadow-sm">
    <div class="card-body d-flex flex-wrap justify-content-between align-items-start gap-3">
      <div>
        <h2 class="h5 mb-1">Voiceover</h2>
        <div class="small text-secondary">
          Schrift: {{ subtitleFontName || "nicht gesetzt" }}
        </div>
        <div class="small mt-2">
          <a v-if="currentAudioAssetHref" :href="currentAudioAssetHref" target="_blank" rel="noreferrer">
            {{ currentAudioLabel }}
          </a>
          <span v-else class="text-secondary">{{ currentAudioLabel || "Kein Voiceover hinterlegt." }}</span>
        </div>
      </div>
      <button class="btn btn-outline-secondary" type="button" @click="open = true">
        Voiceover aufnehmen
      </button>
    </div>
  </section>

  <BaseModal :open="open" dialog-class="voiceover-record-modal" title="Voiceover aufnehmen" @close="closeModal">
    <div class="vstack gap-3">
      <div class="small text-secondary">
        Nach dem Start beginnt ein 3-Sekunden-Countdown. Die Hervorhebung zeigt, welcher Abschnitt gerade gesprochen werden soll.
      </div>

      <div v-if="currentAudioAssetHref" class="alert alert-warning mb-0">
        <div class="fw-semibold">Vorhandenes Voiceover wird ersetzt</div>
        <div class="small mb-2">{{ currentAudioLabel }}</div>
        <audio class="w-100" controls :src="currentAudioAssetHref" />
      </div>
      <div v-else class="alert alert-light border mb-0">
        Noch kein Voiceover gespeichert. Die Aufnahme wird nach dem Stoppen direkt als Post-Asset abgelegt.
      </div>

      <div class="voiceover-recorder__status card border-0">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <div class="small text-uppercase text-secondary">Countdown</div>
              <div class="voiceover-recorder__countdown">{{ countdownText }}</div>
            </div>
            <div class="text-end">
              <div class="small text-uppercase text-secondary">Timer</div>
              <div class="voiceover-recorder__timer">{{ timerText }}</div>
            </div>
          </div>
          <div class="small text-secondary">{{ statusText }}</div>
        </div>
      </div>

      <div v-if="voiceoverSegments.length > 0" class="voiceover-recorder__segments">
        <div
          v-for="segment in voiceoverSegments"
          :key="segment.index"
          :class="segmentStateClass(segment.index)"
          class="voiceover-recorder__segment"
        >
          <div class="voiceover-recorder__segment-index">{{ segment.index + 1 }}</div>
          <div class="voiceover-recorder__segment-text">{{ segment.text }}</div>
        </div>
      </div>

      <div v-if="error" class="alert alert-danger mb-0">{{ error }}</div>
      <div v-if="savedNotice" class="alert alert-success mb-0">{{ savedNotice }}</div>

      <div v-if="previewSrc" class="vstack gap-2">
        <div class="small fw-semibold">{{ previewLabel }}</div>
        <audio ref="previewAudio" class="w-100" controls :src="previewSrc" />
      </div>

      <div class="d-flex justify-content-end gap-2">
        <button class="btn btn-outline-secondary" type="button" :disabled="busy" @click="closeModal">
          Schließen
        </button>
        <button class="btn btn-outline-secondary" type="button" :disabled="busy || !canStop" @click="stopRecording">
          Stoppen
        </button>
        <button class="btn btn-primary" type="button" :disabled="busy || recordingActive" @click="startRecording">
          {{ startButtonLabel }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import BaseModal from "./BaseModal.vue"
import { useAssetUpload } from "../composables/useAssetUpload.js"

const props = defineProps<{
  audioAssetHref: string | null
  audioLabel: string
  durationSeconds: number
  onRefresh: () => Promise<void>
  postId: string
  subtitleFontName: string
  voiceoverSegments: Array<{
    endSeconds: number
    index: number
    startSeconds: number
    text: string
  }>
}>()

const open = ref(false)
const previewAudio = ref<HTMLAudioElement | null>(null)
const savedNotice = ref("")
const countdownText = ref("3")
const timerText = ref("00:00")
const statusText = ref(defaultStatusText())
const previewSrc = ref("")
const previewLabel = ref("")
const activeSegmentIndex = ref(0)
const completedSegmentCount = ref(0)
const recordingActive = ref(false)
const canStop = ref(false)
const currentAudioAssetHref = ref(props.audioAssetHref)
const currentAudioLabel = ref(props.audioLabel)
const { busy, error, submitVoiceover } = useAssetUpload(props.postId, props.onRefresh)

let mediaStream: MediaStream | undefined
let mediaRecorder: MediaRecorder | undefined
let recordedChunks: Blob[] = []
let countdownTimer: number | undefined
let recordingTimer: number | undefined
let autoStopTimer: number | undefined
let recordingStartedAt = 0
let discardPendingTake = false
let previewObjectUrl = ""

const startButtonLabel = computed(() =>
  currentAudioAssetHref.value ? "Erneut aufnehmen" : "Aufnahme starten"
)

watch(
  () => props.audioAssetHref,
  (value) => {
    currentAudioAssetHref.value = value

    if (open.value && value && !previewObjectUrl) {
      setPreviewSource(value, props.audioLabel)
    }
  }
)

watch(
  () => props.audioLabel,
  (value) => {
    currentAudioLabel.value = value

    if (open.value && currentAudioAssetHref.value && !previewObjectUrl) {
      setPreviewSource(currentAudioAssetHref.value, value)
    }
  }
)

function defaultStatusText() {
  return "Nach dem Start beginnt ein 3-Sekunden-Countdown. Die Hervorhebung zeigt, welcher Abschnitt gerade gesprochen werden soll."
}

function formatTimerValue(totalSeconds: number) {
  const rounded = Math.max(0, Math.floor(totalSeconds))
  const minutes = String(Math.floor(rounded / 60)).padStart(2, "0")
  const seconds = String(rounded % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

function clearTimers() {
  if (countdownTimer !== undefined) {
    window.clearInterval(countdownTimer)
    countdownTimer = undefined
  }
  if (recordingTimer !== undefined) {
    window.clearInterval(recordingTimer)
    recordingTimer = undefined
  }
  if (autoStopTimer !== undefined) {
    window.clearTimeout(autoStopTimer)
    autoStopTimer = undefined
  }
}

function stopTracks() {
  if (!mediaStream) {
    return
  }

  for (const track of mediaStream.getTracks()) {
    track.stop()
  }

  mediaStream = undefined
}

function revokePreviewObjectUrl() {
  if (!previewObjectUrl) {
    return
  }

  URL.revokeObjectURL(previewObjectUrl)
  previewObjectUrl = ""
}

function resetUi() {
  countdownText.value = "3"
  timerText.value = "00:00"
  activeSegmentIndex.value = 0
  completedSegmentCount.value = 0
}

function resetSessionState() {
  clearTimers()
  stopTracks()
  recordingActive.value = false
  canStop.value = false
  discardPendingTake = false
  savedNotice.value = ""
  statusText.value = defaultStatusText()
  resetUi()
}

function closeModal() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    discardPendingTake = true
    void mediaRecorder.stop()
  } else {
    teardownRecorder()
  }

  resetSessionState()
  open.value = false
}

function updateTimer() {
  const elapsedSeconds = (Date.now() - recordingStartedAt) / 1000
  timerText.value = formatTimerValue(elapsedSeconds)

  let activeIndex = props.voiceoverSegments.length > 0 ? props.voiceoverSegments.length - 1 : 0
  let completedCount = 0

  for (const segment of props.voiceoverSegments) {
    if (elapsedSeconds >= segment.endSeconds) {
      completedCount += 1
      continue
    }

    if (elapsedSeconds >= segment.startSeconds && elapsedSeconds < segment.endSeconds) {
      activeIndex = segment.index
      break
    }
  }

  activeSegmentIndex.value = activeIndex
  completedSegmentCount.value = completedCount
}

function segmentStateClass(index: number) {
  if (!recordingActive.value) {
    return ""
  }

  if (index < completedSegmentCount.value) {
    return "is-done"
  }

  if (index === activeSegmentIndex.value) {
    return "is-active"
  }

  return ""
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return ""
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/ogg"
  ]

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }

  return ""
}

function buildFileName(mimeType: string) {
  return mimeType.includes("ogg") ? "voiceover-recording.ogg" : "voiceover-recording.webm"
}

function setPreviewSource(sourcePath: string, label: string, useBlobUrl = false) {
  if (useBlobUrl) {
    revokePreviewObjectUrl()
    previewObjectUrl = sourcePath
  } else {
    revokePreviewObjectUrl()
  }

  previewSrc.value = sourcePath
  previewLabel.value = label

  if (previewAudio.value) {
    previewAudio.value.pause()
    previewAudio.value.load()
  }
}

async function saveRecording(blob: Blob, mimeType: string) {
  const formData = new FormData()
  formData.append("audio_upload", blob, buildFileName(mimeType))
  await submitVoiceover(formData)

  savedNotice.value = "Voiceover gespeichert."
  statusText.value = "Aufnahme gespeichert. Wenn sie nicht passt, kannst du direkt erneut aufnehmen."
}

function teardownRecorder() {
  mediaRecorder = undefined
  recordedChunks = []
  recordingActive.value = false
  canStop.value = false
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    return
  }

  await new Promise<void>((resolve) => {
    mediaRecorder?.addEventListener("stop", () => resolve(), { once: true })
    mediaRecorder?.stop()
  })
}

async function startRecording() {
  savedNotice.value = ""
  resetUi()
  statusText.value = "Mikrofon wird vorbereitet ..."

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    statusText.value = "Dieser Browser unterstützt keine Audioaufnahme."
    return
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recordedChunks = []
    discardPendingTake = false
    const mimeType = pickMimeType()
    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream)

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data)
      }
    })

    mediaRecorder.addEventListener(
      "stop",
      async () => {
        clearTimers()
        stopTracks()
        recordingActive.value = false
        canStop.value = false
        const resolvedMimeType = mediaRecorder?.mimeType || mimeType || "audio/webm"
        const recordingBlob = new Blob(recordedChunks, { type: resolvedMimeType })
        teardownRecorder()

        if (discardPendingTake) {
          discardPendingTake = false
          statusText.value = "Aufnahme verworfen."
          return
        }

        if (recordingBlob.size === 0) {
          statusText.value = "Die Aufnahme war leer."
          return
        }

        try {
          setPreviewSource(URL.createObjectURL(recordingBlob), "Ungespeicherte Vorschau", true)
          await saveRecording(recordingBlob, resolvedMimeType)
        } catch {
          statusText.value = "Aufnahme fehlgeschlagen."
        }
      },
      { once: true }
    )

    let countdownValue = 3
    countdownText.value = String(countdownValue)
    statusText.value = "Sprich nach dem Countdown."

    countdownTimer = window.setInterval(() => {
      countdownValue -= 1
      countdownText.value = countdownValue > 0 ? String(countdownValue) : "REC"

      if (countdownValue > 0) {
        return
      }

      if (countdownTimer !== undefined) {
        window.clearInterval(countdownTimer)
        countdownTimer = undefined
      }

      mediaRecorder?.start()
      recordingStartedAt = Date.now()
      recordingActive.value = true
      canStop.value = true
      updateTimer()
      recordingTimer = window.setInterval(updateTimer, 100)
      autoStopTimer = window.setTimeout(() => {
        void stopRecording()
      }, Math.max(props.durationSeconds, 1) * 1000)
      statusText.value = "Aufnahme läuft."
    }, 1000)
  } catch {
    stopTracks()
    teardownRecorder()
    statusText.value = "Mikrofonzugriff fehlgeschlagen."
  }
}

onBeforeUnmount(() => {
  clearTimers()
  stopTracks()
  revokePreviewObjectUrl()
})
</script>

<style scoped>
.voiceover-record-modal {
  max-width: min(96vw, 56rem);
}

.voiceover-recorder__status {
  background: linear-gradient(135deg, #f6f1e5, #eef5ef);
}

.voiceover-recorder__countdown,
.voiceover-recorder__timer {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.voiceover-recorder__segments {
  display: grid;
  gap: 0.75rem;
}

.voiceover-recorder__segment {
  align-items: start;
  background: #fffdfa;
  border: 1px solid rgba(31, 50, 58, 0.14);
  border-radius: 1rem;
  display: grid;
  gap: 0.75rem;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 0.9rem 1rem;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.voiceover-recorder__segment.is-active {
  background: #f1f7f3;
  border-color: rgba(31, 122, 104, 0.5);
  transform: translateY(-1px);
}

.voiceover-recorder__segment.is-done {
  background: #f7f7f4;
  border-color: rgba(31, 122, 104, 0.22);
}

.voiceover-recorder__segment-index {
  align-items: center;
  background: rgba(31, 122, 104, 0.1);
  border-radius: 999px;
  color: var(--pm-ink);
  display: inline-flex;
  font-size: 0.875rem;
  font-weight: 700;
  height: 2rem;
  justify-content: center;
  width: 2rem;
}

.voiceover-recorder__segment-text {
  white-space: pre-line;
}
</style>
