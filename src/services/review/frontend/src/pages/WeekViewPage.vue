<template>
  <section>
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
      <div>
        <h2 class="h3 mb-1">{{ germanCopy.weekOverview }}</h2>
        <div class="text-secondary" v-if="week">
          {{ formatWeekRangeLabel(week.selectedWeek.startDate, week.selectedWeek.endDate) }}
        </div>
      </div>
      <select v-model="selectedWeekDate" class="form-select week-selector" @change="navigateToWeek">
        <option v-for="option in week?.weekOptions ?? []" :key="option.startDate" :value="option.startDate">
          {{ formatWeekRangeLabel(option.startDate, option.endDate) }}
        </option>
      </select>
    </div>

    <div v-if="reviewStore.error" class="alert alert-danger">{{ reviewStore.error }}</div>
    <div
      v-for="notice in week?.notices ?? []"
      :key="notice.text"
      :class="notice.kind === 'error' ? 'alert alert-danger' : 'alert alert-success'"
    >
      {{ notice.text }}
    </div>

    <div class="card shadow-sm mb-4" v-if="week">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h3 class="h5">{{ week.selectedWeek.focus }}</h3>
            <div class="text-secondary">{{ week.selectedWeek.postCount }} Beiträge</div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-outline-primary" type="button" @click="ideaOpen = true">Neue Idee</button>
            <ActionButtonGroup
              :actions="week.weekActions"
              :busy="reviewStore.loading"
              :busy-action="reviewStore.activeAction"
              @trigger="triggerWeek"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div v-for="post in week?.selectedWeek.posts ?? []" :key="post.postId" class="col-lg-6">
        <RouterLink v-if="post.actionHref" class="week-post-link" :to="post.actionHref">
          <article class="card h-100 shadow-sm week-post-card">
            <div class="card-body">
              <div class="d-flex justify-content-between gap-3 mb-2">
                <div>
                  <div class="text-secondary small">{{ formatGermanDate(post.date) }} · {{ post.weekday }}</div>
                  <h3 class="h5 mb-1">{{ post.theme }}</h3>
                </div>
                <span class="badge text-bg-light">{{ post.status }}</span>
              </div>
              <div class="small mt-2 mb-3"><strong>{{ post.postId }}</strong> · {{ post.rubric }}</div>
              <div class="d-flex flex-wrap gap-2">
                <span v-for="badge in post.badges" :key="badge" class="badge text-bg-secondary">{{ badge }}</span>
              </div>
            </div>
            <button class="btn btn-sm btn-outline-danger week-post-delete" type="button" @click.prevent="deletePost(post.postId)">Löschen</button>
          </article>
        </RouterLink>
        <article v-else class="card h-100 shadow-sm week-post-card">
          <div class="card-body">
            <div class="d-flex justify-content-between gap-3 mb-2">
              <div>
                <div class="text-secondary small">{{ formatGermanDate(post.date) }} · {{ post.weekday }}</div>
                <h3 class="h5 mb-1">{{ post.theme }}</h3>
              </div>
              <span class="badge text-bg-light">{{ post.status }}</span>
            </div>
            <div class="small mt-2 mb-3"><strong>{{ post.postId }}</strong> · {{ post.rubric }}</div>
            <div class="d-flex flex-wrap gap-2">
              <span v-for="badge in post.badges" :key="badge" class="badge text-bg-secondary">{{ badge }}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-outline-danger week-post-delete" type="button" @click.prevent="deletePost(post.postId)">Löschen</button>
        </article>
      </div>
    </div>

    <BaseModal :open="ideaOpen" title="Neue Beitragsidee" @close="ideaOpen = false">
      <div class="mb-3"><label class="form-label" for="idea-title">Titel</label><input id="idea-title" v-model="idea.title" class="form-control" /></div>
      <div class="mb-3"><label class="form-label" for="idea-date">Datum</label><input id="idea-date" v-model="idea.date" class="form-control" type="date" /></div>
      <div><label class="form-label" for="idea-rubric">Rubrik</label><input id="idea-rubric" v-model="idea.rubric" class="form-control" /></div>
      <template #footer>
        <button class="btn btn-outline-secondary" type="button" @click="ideaOpen = false">Abbrechen</button>
        <button class="btn btn-primary" :disabled="reviewStore.loading || !idea.title || !idea.date || !idea.rubric" type="button" @click="createIdea">Anlegen</button>
      </template>
    </BaseModal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"
import type { WeekActionApi } from "../../../server/contracts/review-contracts.js"
import ActionButtonGroup from "../components/ActionButtonGroup.vue"
import BaseModal from "../components/BaseModal.vue"
import { addPostIdea, loadWeek, removePost, reviewStore, triggerWeekAction } from "../stores/review-store.js"
import { formatGermanDate, formatWeekRangeLabel } from "../utils/date-format.js"
import { germanCopy } from "../utils/german-copy.js"

const route = useRoute()
const router = useRouter()
const week = computed(() => reviewStore.week)
const selectedWeekDate = ref("")
const ideaOpen = ref(false)
const idea = ref({ date: "", rubric: "", title: "" })
const lastWeekStorageKey = "influence.review.last-week"

onMounted(async () => {
  await loadCurrentWeek()
})

watch(
  () => route.params.weekDate,
  async () => {
    await loadCurrentWeek()
  }
)

async function loadCurrentWeek() {
  const routeWeekDate = typeof route.params.weekDate === "string" ? route.params.weekDate : undefined
  const weekDate = routeWeekDate ?? window.localStorage.getItem(lastWeekStorageKey) ?? undefined
  await loadWeek(weekDate)
  selectedWeekDate.value = reviewStore.week?.selectedWeek.startDate ?? ""
  idea.value.date = reviewStore.week?.selectedWeek.startDate ?? ""
  if (!routeWeekDate && selectedWeekDate.value) window.localStorage.setItem(lastWeekStorageKey, selectedWeekDate.value)
}

async function triggerWeek(payload: { action: string; force: boolean }) {
  if (!selectedWeekDate.value) {
    return
  }

  await triggerWeekAction(selectedWeekDate.value, payload.action as WeekActionApi, {
    force: payload.force
  })
}

async function navigateToWeek() {
  window.localStorage.setItem(lastWeekStorageKey, selectedWeekDate.value)
  await router.push(`/weeks/${selectedWeekDate.value}`)
}

async function createIdea() {
  await addPostIdea(selectedWeekDate.value, idea.value)
  if (!reviewStore.error) {
    ideaOpen.value = false
    idea.value = { date: selectedWeekDate.value, rubric: "", title: "" }
  }
}

async function deletePost(postId: string) {
  if (!window.confirm(`Beitrag „${postId}“ wirklich löschen?`)) return
  await removePost(postId)
  await loadCurrentWeek()
}
</script>

<style scoped>
.week-selector {
  max-width: 24rem;
}

.week-post-link {
  color: inherit;
  display: block;
  height: 100%;
  text-decoration: none;
}

.week-post-link:hover .week-post-card,
.week-post-link:focus-visible .week-post-card {
  box-shadow: 0 0.75rem 1.5rem rgba(75, 62, 40, 0.12) !important;
  transform: translateY(-1px);
}

.week-post-card {
  position: relative;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.week-post-delete {
  bottom: 1rem;
  position: absolute;
  right: 1rem;
}
</style>
