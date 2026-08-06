<template>
  <section v-if="post">
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
      <div>
        <RouterLink class="small text-decoration-none" :to="post.viewBackHref">Zur Wochenübersicht</RouterLink>
        <h2 class="h3 mt-2 mb-1">{{ post.content.title }}</h2>
        <div class="text-secondary">
          {{ formatGermanLongDate(post.post.date) }} · {{ post.post.rubric }}
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <a
          :class="['btn btn-sm btn-outline-secondary', { disabled: !post.previousPostHref }]"
          :href="post.previousPostHref ?? undefined"
          aria-label="Vorheriger Beitrag"
        >← Vorheriger</a>
        <a
          :class="['btn btn-sm btn-outline-secondary', { disabled: !post.nextPostHref }]"
          :href="post.nextPostHref ?? undefined"
          aria-label="Nächster Beitrag"
        >Nächster →</a>
        <button class="btn btn-sm btn-outline-danger" type="button" @click="deleteCurrentPost">Löschen</button>
        <span class="badge text-bg-light fs-6">{{ post.post.status }}</span>
      </div>
    </div>

    <div v-if="reviewStore.error" class="alert alert-danger">{{ reviewStore.error }}</div>
    <div
      v-for="notice in post.notices"
      :key="notice.text"
      :class="notice.kind === 'error' ? 'alert alert-danger' : 'alert alert-success'"
    >
      {{ notice.text }}
    </div>

    <div class="row g-4">
      <div class="col-xl-7">
        <PostActionsCard
          :actions="post.workflowActions"
          :busy="reviewStore.loading"
          :busy-action="reviewStore.activeAction"
          :download-href="post.exportDownloadHref"
          :workflow="post.workflow"
          @trigger="handleAction"
        />

        <section class="card shadow-sm mt-4">
          <div class="card-body">
            <h2 class="h5">{{ germanCopy.edit }}</h2>
            <form class="row g-3" @submit.prevent="savePost">
              <div class="col-12 form-section-heading">Allgemein</div>
              <div class="col-md-6">
                <label class="form-label">Titel</label>
                <input v-model="form.title" class="form-control" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Zielgruppe</label>
                <input v-model="form.audience" class="form-control" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Termin</label>
                <input v-model="scheduledDate" class="form-control" lang="de-DE" type="date" />
              </div>
              <div class="col-md-6 align-self-end">
                <button
                  class="btn btn-outline-secondary"
                  :disabled="reviewStore.loading || scheduledDate.length === 0 || scheduledDate === post.post.date"
                  type="button"
                  @click="updateSchedule"
                >
                  Termin ändern
                </button>
              </div>
              <div class="col-12">
                <label class="form-label">Kernbotschaft</label>
                <textarea v-model="form.mainMessage" class="form-control" rows="3" />
              </div>
              <div class="col-12 form-section-heading">Bild und Flux</div>
              <div class="col-12">
                <label class="form-label">Konzept</label>
                <textarea v-model="form.concept" class="form-control" rows="3" />
              </div>
              <div class="col-12">
                <label class="form-label">Flux-Prompt</label>
                <textarea v-model="form.fluxPrompt" class="form-control" rows="3" />
              </div>
              <div class="col-12 form-section-heading">Facebook</div>
              <div class="col-md-6">
                <label class="form-label">Facebook-Headline</label>
                <input v-model="form.facebookHeadline" class="form-control" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Alt-Text</label>
                <input v-model="form.altText" class="form-control" />
              </div>
              <div class="col-12">
                <label class="form-label">Facebook-Text</label>
                <textarea v-model="form.facebookText" class="form-control" rows="3" />
              </div>
              <div class="col-12 form-section-heading">Instagram</div>
              <div class="col-12">
                <label class="form-label">Instagram-Caption</label>
                <textarea v-model="form.instagramCaption" class="form-control" rows="3" />
              </div>
              <div class="col-12 form-section-heading">Mastodon</div>
              <div class="col-12">
                <label class="form-label">Mastodon-Text</label>
                <textarea v-model="form.mastodonText" class="form-control" rows="3" />
              </div>
              <div class="col-12 form-section-heading">Reel</div>
              <div class="col-12">
                <label class="form-label">Reel-Hook</label>
                <textarea v-model="form.reelHook" class="form-control" rows="3" />
              </div>
              <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <label class="form-label mb-0">Story-Slides</label>
                  <button class="btn btn-sm btn-outline-primary" type="button" @click="addStorySlide">Slide hinzufügen</button>
                </div>
                <div class="d-grid gap-2">
                  <div v-for="(slide, index) in storySlides" :key="slide.id" class="story-slide-row" draggable="true" @dragover.prevent @drop="dropStorySlide(index)" @dragstart="draggedSlideIndex = index">
                    <span class="story-slide-handle" title="Zum Sortieren ziehen">☷</span>
                    <span class="small text-secondary">{{ index + 1 }}</span>
                    <textarea v-model="slide.text" class="form-control" rows="2" :aria-label="`Story-Slide ${index + 1}`" />
                    <button class="btn btn-sm btn-outline-danger" type="button" :disabled="storySlides.length <= 1" @click="deleteStorySlide(index)">Löschen</button>
                  </div>
                </div>
              </div>
              <div class="col-12">
                <label class="form-label">Reel-Skript</label>
                <textarea v-model="form.reelScript" class="form-control" rows="4" />
              </div>
              <div class="col-12">
                <button class="btn btn-primary" :disabled="reviewStore.loading" type="submit">Speichern</button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <div class="col-xl-5">
        <div class="card shadow-sm mb-4">
          <div class="card-body d-flex flex-wrap gap-2">
            <button class="btn btn-outline-secondary btn-sm" type="button" @click="chatOpen = true">
              Mit ChatGPT besprechen
            </button>
          </div>
        </div>

        <section class="card shadow-sm mb-4">
          <div class="card-body">
            <h2 class="h5">{{ germanCopy.qa }}</h2>
            <div class="mb-2">
              <span :class="post.qaSummary.readyForApproval ? 'badge text-bg-success' : 'badge text-bg-secondary'">
                {{ post.qaSummary.readyForApproval ? "freigabereif" : "noch nicht freigabereif" }}
              </span>
            </div>
            <div v-if="post.qaSummary.warnings.length > 0">
              <div class="fw-semibold">Warnungen</div>
              <ul>
                <li v-for="warning in post.qaSummary.warnings" :key="warning">{{ warning }}</li>
              </ul>
            </div>
            <div v-if="post.qaSummary.errors.length > 0">
              <div class="fw-semibold">Fehler</div>
              <ul>
                <li v-for="error in post.qaSummary.errors" :key="error">{{ error }}</li>
              </ul>
            </div>
          </div>
        </section>

        <AssetPanel class="mb-4" :assets="post.assets" :on-refresh="refreshPost" :post-id="post.post.postId" />

        <PreviewGallery
          v-for="(group, groupIndex) in post.previewGroups"
          :key="group.title"
          class="mb-4"
          :items="group.items"
          :title="group.title"
          @preview="openPreview(groupIndex, $event)"
        />

        <VoiceoverModal
          class="mb-4"
          :audio-asset-href="post.reel.audioAssetHref"
          :audio-label="post.reel.audioLabel"
          :duration-seconds="post.reel.durationSeconds"
          :on-refresh="refreshPost"
          :post-id="post.post.postId"
          :subtitle-font-name="post.reel.subtitleFontName"
          :voiceover-segments="post.reel.voiceoverSegments"
        />

        <ReelModal class="mb-4" :preview-href="post.reel.previewHref" />
      </div>
    </div>

    <ChatModal
      :assistant-draft="chatStore.assistantDraft"
      :busy="chatStore.loading"
      :error="chatStore.error"
      :loading-message="chatStore.loadingMessage"
      :open="chatOpen"
      :session="chatStore.session"
      @apply="applyPostRevision"
      @close="chatOpen = false"
      @revise="reviseCurrentSession"
      @send="sendMessage"
    />

    <PreviewModal
      :current-index="previewIndex"
      :items="activePreviewItems"
      :open="previewOpen"
      @close="previewOpen = false"
      @next="showNextPreview"
      @previous="showPreviousPreview"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"
import type { ReviewActionApi } from "../../../server/contracts/review-contracts.js"
import AssetPanel from "../components/AssetPanel.vue"
import ChatModal from "../components/ChatModal.vue"
import PostActionsCard from "../components/PostActionsCard.vue"
import PreviewGallery from "../components/PreviewGallery.vue"
import PreviewModal from "../components/PreviewModal.vue"
import ReelModal from "../components/ReelModal.vue"
import VoiceoverModal from "../components/VoiceoverModal.vue"
import { useChatSession } from "../composables/useChatSession.js"
import {
  loadPost,
  removePost,
  reschedulePost,
  reviewStore,
  triggerPostAction
} from "../stores/review-store.js"
import { formatGermanLongDate } from "../utils/date-format.js"
import { germanCopy } from "../utils/german-copy.js"

const route = useRoute()
const router = useRouter()
const post = computed(() => reviewStore.post)
const form = reactive({
  altText: "",
  audience: "",
  concept: "",
  facebookHeadline: "",
  facebookText: "",
  fluxPrompt: "",
  instagramCaption: "",
  mainMessage: "",
  mastodonText: "",
  reelHook: "",
  reelScript: "",
  title: ""
})
const storySlides = ref<Array<{ id: number; text: string }>>([])
const draggedSlideIndex = ref<number | null>(null)
const chatOpen = ref(false)
const previewOpen = ref(false)
const previewGroupIndex = ref(0)
const previewIndex = ref(0)
const scheduledDate = ref("")

const postId = computed(() => String(route.params.postId ?? ""))
const activePreviewItems = computed(() => post.value?.previewGroups[previewGroupIndex.value]?.items ?? [])
const { applyCurrentRevision, chatStore, reviseCurrentSession, sendMessage } = useChatSession(
  () => postId.value
)

async function applyPostRevision() {
  await applyCurrentRevision()
  if (!chatStore.error) {
    await refreshPost()
  }
}

watch(
  () => route.params.postId,
  async () => {
    await refreshPost()
  },
  { immediate: true }
)

watch(post, (value) => {
  if (!value) {
    return
  }

  form.altText = value.content.altText
  form.audience = value.content.audience
  form.concept = value.content.concept
  form.facebookHeadline = value.content.facebookHeadline
  form.facebookText = value.content.facebookText
  form.fluxPrompt = value.content.fluxPrompt
  form.instagramCaption = value.content.instagramCaption
  form.mainMessage = value.content.mainMessage
  form.mastodonText = value.content.mastodonText
  form.reelHook = value.content.reelHook
  form.reelScript = value.content.reelScript
  form.title = value.content.title
  scheduledDate.value = value.post.date
  storySlides.value = value.content.storySlides.length > 0
    ? value.content.storySlides.map((text, index) => ({ id: index + 1, text }))
    : [{ id: 1, text: "" }]
})

async function refreshPost() {
  if (!postId.value) {
    return
  }

  await loadPost(postId.value)
}

async function handleAction(payload: { action: string; force: boolean }) {
  const { action, force } = payload
  if (action === "edit") {
    await savePost()
    return
  }

  if (action === "export") {
    return
  }

  await triggerPostAction(
    postId.value,
    action as Exclude<ReviewActionApi, "export">,
    undefined,
    { force }
  )
}

async function savePost() {
  await triggerPostAction(postId.value, "edit", {
    altText: form.altText,
    audience: form.audience,
    concept: form.concept,
    facebookHeadline: form.facebookHeadline,
    facebookText: form.facebookText,
    fluxPrompt: form.fluxPrompt,
    instagramCaption: form.instagramCaption,
    mainMessage: form.mainMessage,
    mastodonText: form.mastodonText,
    reelHook: form.reelHook,
    reelScript: form.reelScript,
    storySlides: storySlides.value.map((slide) => slide.text),
    title: form.title
  })

  if (!reviewStore.error) {
    await refreshPost()
  }
}

async function updateSchedule() {
  await reschedulePost(postId.value, { date: scheduledDate.value })
}

function addStorySlide() {
  storySlides.value.push({ id: Date.now(), text: "" })
}

function deleteStorySlide(index: number) {
  if (storySlides.value.length <= 1 || !window.confirm(`Story-Slide ${index + 1} wirklich löschen?`)) return
  storySlides.value.splice(index, 1)
}

function dropStorySlide(targetIndex: number) {
  const sourceIndex = draggedSlideIndex.value
  draggedSlideIndex.value = null
  if (sourceIndex === null || sourceIndex === targetIndex) return
  const [slide] = storySlides.value.splice(sourceIndex, 1)
  storySlides.value.splice(targetIndex, 0, slide)
}

async function deleteCurrentPost() {
  if (!window.confirm(`Beitrag „${post.value?.post.postId}" wirklich löschen?`)) return
  await removePost(postId.value)
  if (!reviewStore.error) await router.push(post.value?.viewBackHref ?? "/")
}

function openPreview(groupIndex: number, index: number) {
  previewGroupIndex.value = groupIndex
  previewIndex.value = index
  previewOpen.value = true
}

function showPreviousPreview() {
  const total = activePreviewItems.value.length
  if (total === 0) {
    return
  }
  previewIndex.value = (previewIndex.value - 1 + total) % total
}

function showNextPreview() {
  const total = activePreviewItems.value.length
  if (total === 0) {
    return
  }
  previewIndex.value = (previewIndex.value + 1) % total
}
</script>

<style scoped>
.story-slide-row {
  align-items: center;
  display: grid;
  gap: 0.5rem;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
}

.story-slide-handle {
  cursor: grab;
  font-size: 1.25rem;
  user-select: none;
}

.form-section-heading {
  border-top: 1px solid rgba(31, 50, 58, 0.16);
  color: var(--pm-teal-deep);
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-top: 1rem;
  padding-top: 1rem;
  text-transform: uppercase;
}
</style>
