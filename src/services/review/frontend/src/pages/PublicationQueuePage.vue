<template>
  <section>
    <div class="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-4">
      <div>
        <h2 class="h4 mb-1">Veröffentlichungswarteschlange</h2>
        <p class="text-secondary mb-0">Alle geplanten Veröffentlichungen auf einen Blick.</p>
      </div>
      <button class="btn btn-outline-secondary" type="button" @click="loadPublicationQueue">Aktualisieren</button>
    </div>

    <div v-if="reviewStore.error" class="alert alert-danger">{{ reviewStore.error }}</div>
    <div v-if="queue?.notice" class="alert alert-success">{{ queue.notice }}</div>

    <div class="card shadow-sm mb-3">
      <div class="card-body queue-filters">
        <input v-model="filter" class="form-control" placeholder="Nach Beitrag, Plattform oder ID filtern" aria-label="Warteschlange filtern" />
        <select v-model="statusFilter" class="form-select" aria-label="Status filtern">
          <option value="">Alle Status</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ statusLabel(status) }}</option>
        </select>
        <select v-model="sortKey" class="form-select" aria-label="Sortierung">
          <option value="scheduledAt">Termin</option>
          <option value="postTheme">Beitrag</option>
          <option value="platform">Plattform</option>
          <option value="status">Status</option>
        </select>
        <button class="btn btn-outline-secondary" type="button" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
          {{ sortDirection === "asc" ? "↑" : "↓" }}
        </button>
      </div>
    </div>

    <div class="card shadow-sm overflow-hidden">
      <div v-if="!queue" class="card-body text-secondary">Warteschlange wird geladen …</div>
      <div v-else-if="filteredJobs.length === 0" class="card-body text-secondary">Keine Veröffentlichungen gefunden.</div>
      <div v-else class="table-responsive">
        <table class="table table-hover align-middle mb-0 queue-table">
          <thead><tr><th scope="col">Termin</th><th scope="col">Beitrag</th><th scope="col">Plattform</th><th scope="col">Status</th><th scope="col" class="text-end">Aktionen</th></tr></thead>
          <tbody>
            <tr v-for="job in filteredJobs" :key="job.id">
              <td>
                <template v-if="job.scheduledAt">{{ formatDateTime(job.scheduledAt) }}</template>
                <span v-else class="text-secondary">Sobald freigegeben</span>
                <div class="small text-secondary">{{ job.format }}</div>
              </td>
              <td>
                <RouterLink v-if="job.postHref" :to="job.postHref" class="fw-semibold">{{ job.postTheme }}</RouterLink>
                <span v-else>{{ job.postTheme }}</span>
                <div class="small text-secondary">{{ job.postId }} · {{ job.id.slice(0, 8) }}</div>
              </td>
              <td class="text-capitalize">{{ job.platform }}</td>
              <td><span class="badge text-bg-light">{{ statusLabel(job.status) }}</span></td>
              <td>
                <div class="d-flex justify-content-end gap-1 flex-wrap">
                  <button class="btn btn-sm btn-outline-secondary" type="button" @click="previewJob = job">Vorschau</button>
                  <button class="btn btn-sm btn-outline-primary" type="button" @click="openReschedule(job.id, job.scheduledAt)">Umplanen</button>
                  <button class="btn btn-sm btn-outline-secondary" type="button" :disabled="!canDuplicate(job.status)" @click="duplicatePublicationJob(job.id)">Duplizieren</button>
                  <button class="btn btn-sm btn-outline-danger" type="button" :disabled="!canRemove(job.status)" @click="removeJob(job.id)">Entfernen</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <BaseModal :open="Boolean(previewJob)" title="Veröffentlichungsvorschau" @close="previewJob = null">
      <template v-if="previewJob">
        <div class="d-flex flex-wrap gap-2 mb-3">
          <span class="badge text-bg-light text-capitalize">{{ previewJob.platform }} · {{ previewJob.format }}</span>
          <span class="badge text-bg-light">{{ statusLabel(previewJob.status) }}</span>
        </div>
        <h3 class="h5">{{ previewJob.postTheme }}</h3>
        <p class="small text-secondary mb-3">
          {{ previewJob.scheduledAt ? formatDateTime(previewJob.scheduledAt) : "Sobald freigegeben" }} · {{ previewJob.postId }}
        </p>
        <div v-if="previewJob.assets.length" class="queue-preview-assets mb-3">
          <a v-for="asset in previewJob.assets" :key="asset.href" :href="asset.href" target="_blank" rel="noreferrer">
            <img :src="asset.href" :alt="asset.label" loading="lazy" />
          </a>
        </div>
        <div class="queue-preview-text">{{ previewJob.text || "Kein Veröffentlichungstext vorhanden." }}</div>
        <a v-if="previewJob.postHref" class="btn btn-outline-primary mt-3" :href="previewJob.postHref">Beitrag öffnen</a>
      </template>
      <template #footer>
        <button class="btn btn-secondary" type="button" @click="previewJob = null">Schließen</button>
      </template>
    </BaseModal>

    <BaseModal :open="Boolean(rescheduleJobId)" title="Veröffentlichung umplanen" @close="rescheduleJobId = null">
      <label class="form-label" for="queue-schedule">Neuer Termin</label>
      <input id="queue-schedule" v-model="rescheduleValue" class="form-control" type="datetime-local" />
      <p class="form-text">Die Zeitzone des Jobs bleibt erhalten.</p>
      <template #footer>
        <button class="btn btn-outline-secondary" type="button" @click="rescheduleJobId = null">Abbrechen</button>
        <button class="btn btn-primary" type="button" :disabled="!rescheduleValue" @click="saveReschedule">Speichern</button>
      </template>
    </BaseModal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import BaseModal from "../components/BaseModal.vue"
import type { PublicationQueueResponse } from "../../../server/contracts/review-contracts.js"
import { duplicatePublicationJob, loadPublicationQueue, removePublicationJob, reschedulePublicationJob, reviewStore } from "../stores/review-store.js"

const filter = ref("")
const statusFilter = ref("")
const sortKey = ref<"scheduledAt" | "postTheme" | "platform" | "status">("scheduledAt")
const sortDirection = ref<"asc" | "desc">("asc")
const rescheduleJobId = ref<string | null>(null)
const rescheduleValue = ref("")
const previewJob = ref<PublicationQueueResponse["jobs"][number] | null>(null)
const queue = computed(() => reviewStore.publicationQueue)
const statuses = computed(() => [...new Set((queue.value?.jobs ?? []).map((job) => job.status))].sort())
const filteredJobs = computed(() => {
  const needle = filter.value.trim().toLocaleLowerCase("de-DE")
  return [...(queue.value?.jobs ?? [])]
    .filter((job) => !statusFilter.value || job.status === statusFilter.value)
    .filter((job) => !needle || [job.postTheme, job.postId, job.id, job.platform].some((value) => value.toLocaleLowerCase("de-DE").includes(needle)))
    .sort((left, right) => {
      const a = left[sortKey.value] ?? ""
      const b = right[sortKey.value] ?? ""
      return String(a).localeCompare(String(b), "de-DE") * (sortDirection.value === "asc" ? 1 : -1)
    })
})

onMounted(() => { void loadPublicationQueue() })

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}
function statusLabel(status: string) { return ({ approved: "Freigegeben", scheduled: "Geplant", failed: "Fehlgeschlagen", draft: "Entwurf", processing: "In Arbeit" }[status] ?? status) }
function canRemove(status: string) { return !["processing", "published"].includes(status) }
function canDuplicate(status: string) { return !["processing", "published"].includes(status) }
function openReschedule(jobId: string, scheduledAt: string | null) {
  rescheduleJobId.value = jobId
  rescheduleValue.value = scheduledAt ? toLocalInputValue(scheduledAt) : ""
}
function toLocalInputValue(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
async function saveReschedule() {
  if (!rescheduleJobId.value) return
  await reschedulePublicationJob(rescheduleJobId.value, new Date(rescheduleValue.value).toISOString())
  if (!reviewStore.error) rescheduleJobId.value = null
}
async function removeJob(jobId: string) {
  if (window.confirm("Diese Veröffentlichung aus der Warteschlange entfernen?")) await removePublicationJob(jobId)
}
</script>

<style scoped>
.queue-filters { display: grid; grid-template-columns: minmax(16rem, 1fr) 12rem 12rem auto; gap: .75rem; }
.queue-table th { white-space: nowrap; }
.queue-preview-text { background: #f8f5ec; border: 1px solid rgba(31, 50, 58, .12); border-radius: .75rem; max-height: 24rem; overflow: auto; padding: 1rem; white-space: pre-wrap; }
.queue-preview-assets { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }
.queue-preview-assets a { background: #f8f5ec; border-radius: .75rem; display: block; overflow: hidden; }
.queue-preview-assets img { aspect-ratio: 1 / 1; display: block; height: 100%; object-fit: cover; width: 100%; }
@media (max-width: 768px) { .queue-filters { grid-template-columns: 1fr; } }
</style>
