<template>
  <section>
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
      <div>
        <h2 class="h3 mb-1">{{ germanCopy.weekOverview }}</h2>
        <div class="text-secondary" v-if="week">
          {{ week.selectedWeek.startDate }} bis {{ week.selectedWeek.endDate }}
        </div>
      </div>
      <select v-model="selectedWeekDate" class="form-select week-selector" @change="navigateToWeek">
        <option v-for="option in week?.weekOptions ?? []" :key="option.startDate" :value="option.startDate">
          {{ option.label }}
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
          <ActionButtonGroup :actions="week.weekActions" :busy="reviewStore.loading" @trigger="triggerWeek" />
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div v-for="post in week?.selectedWeek.posts ?? []" :key="post.postId" class="col-lg-6">
        <article class="card h-100 shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between gap-3">
              <div>
                <h3 class="h5 mb-1">{{ post.theme }}</h3>
                <div class="text-secondary">{{ post.weekday }}, {{ post.date }}</div>
              </div>
              <span class="badge text-bg-light">{{ post.status }}</span>
            </div>
            <div class="small mt-2 mb-3">{{ post.rubric }}</div>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <span v-for="badge in post.badges" :key="badge" class="badge text-bg-secondary">{{ badge }}</span>
            </div>
            <RouterLink class="btn btn-outline-primary" :to="post.actionHref">Beitrag öffnen</RouterLink>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"
import type { WeekActionApi } from "../../../server/contracts/review-contracts.js"
import ActionButtonGroup from "../components/ActionButtonGroup.vue"
import { loadWeek, reviewStore, triggerWeekAction } from "../stores/review-store.js"
import { germanCopy } from "../utils/german-copy.js"

const route = useRoute()
const router = useRouter()
const week = computed(() => reviewStore.week)
const selectedWeekDate = ref("")

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
  const weekDate = typeof route.params.weekDate === "string" ? route.params.weekDate : undefined
  await loadWeek(weekDate)
  selectedWeekDate.value = reviewStore.week?.selectedWeek.startDate ?? ""
}

async function triggerWeek(action: string) {
  if (!selectedWeekDate.value) {
    return
  }

  await triggerWeekAction(selectedWeekDate.value, action as WeekActionApi)
}

async function navigateToWeek() {
  await router.push(`/weeks/${selectedWeekDate.value}`)
}
</script>

<style scoped>
.week-selector {
  max-width: 20rem;
}
</style>
