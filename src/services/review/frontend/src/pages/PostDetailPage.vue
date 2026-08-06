<template>
  <section v-if="post">
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
      <div>
        <RouterLink class="small text-decoration-none" :to="post.viewBackHref">Zur Wochenübersicht</RouterLink>
        <h2 class="h3 mt-2 mb-1">{{ post.content.title }}</h2>
        <div class="text-secondary">{{ post.post.weekday }}, {{ post.post.date }} · {{ post.post.rubric }}</div>
      </div>
      <span class="badge text-bg-light fs-6">{{ post.post.status }}</span>
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
      <div class="col-xl-8">
        <PostActionsCard
          :actions="post.workflowActions"
          :busy="reviewStore.loading"
          :download-href="post.exportDownloadHref"
          :workflow="post.workflow"
          @trigger="handleAction"
        />

        <section class="card shadow-sm mt-4">
          <div class="card-body">
            <h2 class="h5">{{ germanCopy.edit }}</h2>
            <form class="row g-3" @submit.prevent="savePost">
              <div class="col-md-6">
                <label class="form-label">Titel</label>
                <input v-model="form.title" class="form-control" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Zielgruppe</label>
                <input v-model="form.audience" class="form-control" />
              </div>
              <div class="col-12">
                <label class="form-label">Kernbotschaft</label>
                <textarea v-model="form.mainMessage" class="form-control" rows="3" />
              </div>
              <div class="col-12">
                <label class="form-label">Konzept</label>
                <textarea v-model="form.concept" class="form-control" rows="3" />
              </div>
              <div class="col-12">
                <label class="form-label">Flux-Prompt</label>
                <textarea v-model="form.fluxPrompt" class="form-control" rows="3" />
              </div>
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
              <div class="col-12">
                <label class="form-label">Instagram-Caption</label>
                <textarea v-model="form.instagramCaption" class="form-control" rows="3" />
              </div>
              <div class="col-12">
                <label class="form-label">Mastodon-Text</label>
                <textarea v-model="form.mastodonText" class="form-control" rows="3" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Reel-Hook</label>
                <input v-model="form.reelHook" class="form-control" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Story-Slides</label>
                <textarea v-model="storySlidesText" class="form-control" rows="4" />
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

        <section class="card shadow-sm mt-4">
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

        <PreviewGallery
          v-for="group in post.previewGroups"
          :key="group.title"
          class="mt-4"
          :items="group.items"
          :title="group.title"
        />
      </div>

      <div class="col-xl-4">
        <AssetPanel :assets="post.assets" :on-refresh="refreshPost" :post-id="post.post.postId" />
        <VoiceoverModal
          class="mt-4"
          :audio-asset-href="post.reel.audioAssetHref"
          :audio-label="post.reel.audioLabel"
          :on-refresh="refreshPost"
          :post-id="post.post.postId"
          :subtitle-font-name="post.reel.subtitleFontName"
        />
        <ReelModal class="mt-4" :preview-href="post.reel.previewHref" />
        <ChatModal
          class="mt-4"
          :busy="chatStore.loading"
          :error="chatStore.error"
          :session="chatStore.session"
          @apply="applyCurrentRevision"
          @revise="reviseCurrentSession"
          @send="sendMessage"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"
import type { ReviewActionApi } from "../../../server/contracts/review-contracts.js"
import AssetPanel from "../components/AssetPanel.vue"
import ChatModal from "../components/ChatModal.vue"
import PostActionsCard from "../components/PostActionsCard.vue"
import PreviewGallery from "../components/PreviewGallery.vue"
import ReelModal from "../components/ReelModal.vue"
import VoiceoverModal from "../components/VoiceoverModal.vue"
import { useChatSession } from "../composables/useChatSession.js"
import { loadPost, reviewStore, triggerPostAction } from "../stores/review-store.js"
import { germanCopy } from "../utils/german-copy.js"

const route = useRoute()
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
const storySlidesText = ref("")

const postId = computed(() => String(route.params.postId ?? ""))
const { applyCurrentRevision, chatStore, reviseCurrentSession, sendMessage } = useChatSession(
  () => postId.value
)

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
  storySlidesText.value = value.content.storySlides.join("\n")
})

async function refreshPost() {
  if (!postId.value) {
    return
  }

  await loadPost(postId.value)
}

async function handleAction(action: string) {
  if (action === "edit" || action === "export") {
    return
  }

  await triggerPostAction(postId.value, action as Exclude<ReviewActionApi, "export">)
}

async function savePost() {
  await triggerPostAction(postId.value, "edit", {
    ...form,
    storySlides: storySlidesText.value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  })
}
</script>
