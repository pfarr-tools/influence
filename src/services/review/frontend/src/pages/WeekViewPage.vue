<template>
  <section>
    <div class="week-toolbar mb-3">
      <div class="week-toolbar__title">
        <h2 class="h4 mb-0">{{ germanCopy.weekOverview }}</h2>
        <div class="text-secondary small" v-if="week">
          {{ formatWeekRangeLabel(week.selectedWeek.startDate, week.selectedWeek.endDate) }}
        </div>
      </div>
      <details ref="actionsMenu" class="week-actions-menu">
        <summary class="btn btn-outline-secondary week-actions-trigger" aria-label="Wochenaktionen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" />
          </svg>
        </summary>
        <div class="card shadow-sm week-actions-popover">
          <div class="card-body">
            <div class="d-grid gap-2 mb-3">
              <button class="btn btn-outline-primary btn-sm" type="button" @click="openIdeaModal">Neue Idee</button>
              <button class="btn btn-outline-secondary btn-sm" type="button" @click="openChat('week')">
                Woche mit ChatGPT besprechen
              </button>
              <button class="btn btn-outline-secondary btn-sm" type="button" @click="openChat('plan')">
                Redaktionsplan mit ChatGPT besprechen
              </button>
            </div>
            <ActionButtonGroup
              :actions="week?.weekActions ?? []"
              :busy="reviewStore.loading"
              :busy-action="reviewStore.activeAction"
              @trigger="triggerWeek"
            />
          </div>
        </div>
      </details>
    </div>

    <div class="week-navigation mb-3">
      <div class="btn-group btn-group-sm" role="group" aria-label="Wochennavigation">
        <button
          class="btn btn-outline-secondary"
          :disabled="!previousWeekDate"
          type="button"
          @click="goToAdjacentWeek(previousWeekDate)"
        >
          ←
        </button>
        <button
          class="btn btn-outline-secondary"
          :disabled="!nextWeekDate"
          type="button"
          @click="goToAdjacentWeek(nextWeekDate)"
        >
          →
        </button>
      </div>
      <input
        v-model="calendarJumpDate"
        class="form-control form-control-sm week-date-jump"
        lang="de-DE"
        type="date"
        @change="jumpToCalendarDate"
      />
      <select v-model="selectedWeekDate" class="form-select form-select-sm week-selector" @change="navigateToWeek">
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

    <div class="week-focus text-secondary small mb-3" v-if="week">
      {{ week.selectedWeek.focus }} · {{ week.selectedWeek.postCount }} Beiträge
    </div>

    <div v-if="week" class="week-grid">
      <article
        v-for="day in weekDays"
        :key="day.date"
        class="card shadow-sm week-day-column"
        :class="{ 'week-day-drop-target': dragState?.date === day.date }"
        @dragenter.prevent
        @dragover.prevent
        @drop="dropPost(day.date, day.posts.length, $event)"
      >
        <div class="card-header week-day-header">
          <span class="fw-semibold text-capitalize">{{ day.weekday }}</span>
          <span class="small text-secondary">{{ formatGermanDate(day.date) }}</span>
          <span class="badge rounded-pill text-bg-light">{{ day.posts.length }}</span>
        </div>
        <div class="card-body week-day-body">
          <div v-if="day.posts.length === 0" class="week-empty-slot">
            Kein Beitrag geplant
          </div>
          <div
            v-for="(post, index) in day.posts"
            :key="post.postId"
            class="card week-post-card"
            draggable="true"
            @dragenter.prevent
            @dragstart="startDrag($event, post.postId, post.date, index)"
            @dragend="dragState = null"
            @dragover.prevent.stop
            @drop.stop="dropPost(day.date, index, $event)"
          >
            <div class="card-body week-post-card__body">
              <div class="d-flex justify-content-between gap-3 mb-1 align-items-start">
                <div>
                  <h3 class="h6 mb-1">{{ post.theme }}</h3>
                  <div class="small text-secondary"><strong>{{ post.postId }}</strong> · {{ post.rubric }}</div>
                </div>
                <span class="badge text-bg-light week-post-status">{{ post.status }}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center gap-2">
                <WorkflowBadges compact :workflow="post.workflow" />
                <div class="d-flex flex-wrap gap-1">
                  <RouterLink v-if="post.actionHref" class="btn btn-sm btn-outline-secondary" :to="post.actionHref">
                    Öffnen
                  </RouterLink>
                  <button class="btn btn-sm btn-outline-danger" type="button" @click.prevent="deletePost(post.postId)">
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <ChatModal
      :assistant-draft="chatStore.assistantDraft"
      :busy="chatStore.loading"
      :error="chatStore.error"
      :loading-message="chatStore.loadingMessage"
      :open="chatOpen"
      :session="chatStore.session"
      @apply="applyWeekRevision"
      @close="chatOpen = false"
      @revise="reviseCurrentSession"
      @send="sendMessage"
    />

    <BaseModal :open="ideaOpen" title="Neue Beitragsidee" @close="ideaOpen = false">
      <div class="mb-3">
        <label class="form-label" for="idea-title">Titel</label>
        <input id="idea-title" v-model="idea.title" class="form-control" />
      </div>
      <div class="mb-3">
        <label class="form-label" for="idea-date">Datum</label>
        <input id="idea-date" v-model="idea.date" class="form-control" lang="de-DE" type="date" />
      </div>
      <div>
        <label class="form-label" for="idea-rubric">Rubrik</label>
        <input id="idea-rubric" v-model="idea.rubric" class="form-control" />
      </div>
      <template #footer>
        <button class="btn btn-outline-secondary" type="button" @click="ideaOpen = false">Abbrechen</button>
        <button
          class="btn btn-primary"
          :disabled="reviewStore.loading || !idea.title || !idea.date || !idea.rubric"
          type="button"
          @click="createIdea"
        >
          Anlegen
        </button>
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
import ChatModal from "../components/ChatModal.vue"
import WorkflowBadges from "../components/WorkflowBadges.vue"
import {
  applyCurrentRevision,
  chatStore,
  ensurePlanChatSession,
  ensureWeekChatSession,
  reviseCurrentSession,
  sendMessage
} from "../stores/chat-store.js"
import {
  addPostIdea,
  loadWeek,
  moveWeekPost,
  removePost,
  reviewStore,
  triggerWeekAction
} from "../stores/review-store.js"
import { formatGermanDate, formatWeekRangeLabel } from "../utils/date-format.js"
import { germanCopy } from "../utils/german-copy.js"

type DragState = {
  date: string
  index: number
  postId: string
}

const route = useRoute()
const router = useRouter()
const week = computed(() => reviewStore.week)
const selectedWeekDate = ref("")
const calendarJumpDate = ref("")
const ideaOpen = ref(false)
const chatOpen = ref(false)
const idea = ref({ date: "", rubric: "", title: "" })
const dragState = ref<DragState | null>(null)
const actionsMenu = ref<HTMLDetailsElement | null>(null)
const lastWeekStorageKey = "influence.review.last-week"

const weekDays = computed(() => {
  const selectedWeek = week.value?.selectedWeek
  if (!selectedWeek) {
    return []
  }

  const postsByDate = new Map<string, typeof selectedWeek.posts>()
  for (const post of selectedWeek.posts) {
    const existing = postsByDate.get(post.date) ?? []
    existing.push(post)
    postsByDate.set(post.date, existing)
  }

  const days: Array<{ date: string; posts: typeof selectedWeek.posts; weekday: string }> = []
  const cursor = new Date(`${selectedWeek.startDate}T00:00:00Z`)

  for (let offset = 0; offset < 7; offset += 1) {
    const date = cursor.toISOString().slice(0, 10)
    days.push({
      date,
      posts: postsByDate.get(date) ?? [],
      weekday: new Intl.DateTimeFormat("de-DE", {
        timeZone: "UTC",
        weekday: "long"
      }).format(cursor)
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
})

const currentWeekIndex = computed(() =>
  week.value?.weekOptions.findIndex((option) => option.startDate === selectedWeekDate.value) ?? -1
)

const previousWeekDate = computed(() => {
  const index = currentWeekIndex.value
  if (!week.value || index <= 0) {
    return ""
  }

  return week.value.weekOptions[index - 1]?.startDate ?? ""
})

const nextWeekDate = computed(() => {
  const index = currentWeekIndex.value
  if (!week.value || index < 0 || index >= week.value.weekOptions.length - 1) {
    return ""
  }

  return week.value.weekOptions[index + 1]?.startDate ?? ""
})

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
  calendarJumpDate.value = selectedWeekDate.value
  idea.value.date = reviewStore.week?.selectedWeek.startDate ?? ""
  if (!routeWeekDate && selectedWeekDate.value) {
    window.localStorage.setItem(lastWeekStorageKey, selectedWeekDate.value)
  }
}

async function triggerWeek(payload: { action: string; force: boolean }) {
  closeActionsMenu()
  if (!selectedWeekDate.value) {
    return
  }

  await triggerWeekAction(selectedWeekDate.value, payload.action as WeekActionApi, {
    force: payload.force
  })
}

async function navigateToWeek() {
  window.localStorage.setItem(lastWeekStorageKey, selectedWeekDate.value)
  calendarJumpDate.value = selectedWeekDate.value
  await router.push(`/weeks/${selectedWeekDate.value}`)
}

async function goToAdjacentWeek(weekDate: string) {
  if (!weekDate) {
    return
  }

  selectedWeekDate.value = weekDate
  await navigateToWeek()
}

async function jumpToCalendarDate() {
  if (!calendarJumpDate.value) {
    return
  }

  window.localStorage.setItem(lastWeekStorageKey, calendarJumpDate.value)
  await router.push(`/weeks/${calendarJumpDate.value}`)
}

function openIdeaModal() {
  closeActionsMenu()
  ideaOpen.value = true
}

async function createIdea() {
  await addPostIdea(selectedWeekDate.value, idea.value)
  if (!reviewStore.error) {
    ideaOpen.value = false
    idea.value = { date: selectedWeekDate.value, rubric: "", title: "" }
  }
}

function startDrag(event: DragEvent, postId: string, date: string, index: number) {
  event.dataTransfer?.setData("application/x-influence-post", JSON.stringify({ date, index, postId }))
  event.dataTransfer?.setData("text/plain", postId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move"
  }
  dragState.value = { date, index, postId }
}

async function dropPost(date: string, position: number, event: DragEvent) {
  const currentDrag = dragState.value ?? readDragState(event)
  dragState.value = null

  const posts = week.value?.selectedWeek.posts
  if (!currentDrag || !selectedWeekDate.value || !posts) {
    return
  }

  const dayPosition =
    currentDrag.date === date && currentDrag.index < position ? position - 1 : position
  if (currentDrag.date === date && currentDrag.index === dayPosition) {
    return
  }

  const targetIndexes = posts.reduce<number[]>((indexes, post, index) => {
    if (post.date === date && post.postId !== currentDrag.postId) {
      indexes.push(index)
    }
    return indexes
  }, [])

  // The API stores one flat week list, while the UI sends a position within a day.
  // Translate the day-local position before the dragged post is removed.
  let absolutePosition: number
  if (targetIndexes.length > 0) {
    absolutePosition = targetIndexes[Math.min(dayPosition, targetIndexes.length - 1)] ?? posts.length
    if (dayPosition >= targetIndexes.length) {
      absolutePosition = targetIndexes[targetIndexes.length - 1]! + 1
    }
  } else {
    absolutePosition = posts.findIndex((post) => post.date > date)
    if (absolutePosition < 0) {
      absolutePosition = posts.length
    }
  }

  const sourceIndex = posts.findIndex((post) => post.postId === currentDrag.postId)
  if (sourceIndex >= 0 && sourceIndex < absolutePosition) {
    absolutePosition -= 1
  }

  await moveWeekPost(selectedWeekDate.value, currentDrag.postId, {
    date,
    position: absolutePosition
  })
}

function readDragState(event: DragEvent): DragState | null {
  const payload = event.dataTransfer?.getData("application/x-influence-post")
  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload) as Partial<DragState>
    if (
      typeof parsed.postId === "string" &&
      typeof parsed.date === "string" &&
      typeof parsed.index === "number"
    ) {
      return { date: parsed.date, index: parsed.index, postId: parsed.postId }
    }
  } catch {
    // Ignore malformed browser drag payloads.
  }

  return null
}

async function deletePost(postId: string) {
  if (!window.confirm(`Beitrag „${postId}“ wirklich löschen?`)) return
  await removePost(postId)
  await loadCurrentWeek()
}

async function openChat(context: "plan" | "week") {
  closeActionsMenu()
  chatStore.session = null

  if (context === "week") {
    await ensureWeekChatSession(selectedWeekDate.value)
  } else {
    await ensurePlanChatSession()
  }

  chatOpen.value = true
}

async function applyWeekRevision() {
  await applyCurrentRevision()
  await loadCurrentWeek()
}

function closeActionsMenu() {
  if (actionsMenu.value) {
    actionsMenu.value.open = false
  }
}
</script>

<style scoped>
.week-toolbar {
  align-items: start;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
}

.week-toolbar__title {
  min-width: 0;
}

.week-actions-menu {
  position: relative;
}

.week-actions-menu summary {
  list-style: none;
}

.week-actions-menu summary::-webkit-details-marker {
  display: none;
}

.week-actions-trigger {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  padding: 0.35rem 0.5rem;
}

.week-actions-trigger svg {
  fill: currentColor;
  height: 1.1rem;
  width: 1.1rem;
}

.week-actions-popover {
  margin-top: 0.4rem;
  position: absolute;
  right: 0;
  width: min(24rem, 90vw);
  z-index: 3;
}

.week-navigation {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.week-focus {
  margin-top: -0.25rem;
}

.week-date-jump {
  max-width: 11rem;
}

.week-selector {
  max-width: 21rem;
}

.week-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.week-day-column {
  min-height: 0;
}

.week-day-header {
  align-items: center;
  background: rgba(230, 219, 196, 0.32);
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  padding: 0.55rem 0.8rem;
}

.week-day-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem;
}

.week-day-drop-target {
  outline: 2px dashed rgba(103, 78, 44, 0.4);
  outline-offset: 0.2rem;
}

.week-empty-slot {
  border: 1px dashed rgba(103, 78, 44, 0.24);
  border-radius: 0.75rem;
  color: #6b7280;
  min-height: 5.5rem;
  padding: 0.75rem;
}

.week-post-card {
  cursor: grab;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.week-post-card__body {
  padding: 0.75rem;
}

.week-post-card:hover {
  box-shadow: 0 0.75rem 1.5rem rgba(75, 62, 40, 0.12) !important;
  transform: translateY(-1px);
}

.week-post-status {
  white-space: nowrap;
}

@media (min-width: 992px) {
  .week-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
