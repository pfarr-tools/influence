<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h5">Workflow</h2>
      <WorkflowBadges :workflow="workflow" />
      <div class="mt-3 d-flex align-items-center gap-2">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="busy || saveAction?.disabled"
          @click="triggerSave"
        >
          {{ saveAction?.label ?? "Speichern" }}
        </button>
        <details ref="actionsMenu" class="post-actions-menu">
          <summary
            class="btn btn-outline-secondary"
            aria-label="Weitere Aktionen"
          >
            <span aria-hidden="true">☰</span>
            <span class="ms-1">Aktionen</span>
          </summary>
          <div class="dropdown-menu dropdown-menu-end show post-actions-menu__panel">
            <ActionButtonGroup
              :actions="menuActions"
              :busy="busy"
              :busy-action="busyAction"
              :download-href="downloadHref"
              variant="menu"
              @trigger="triggerMenuAction"
            />
          </div>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { ReviewActionButton } from "../../../server/contracts/review-contracts.js"
import ActionButtonGroup from "./ActionButtonGroup.vue"
import WorkflowBadges from "./WorkflowBadges.vue"
import { useWorkflowActions } from "../composables/useWorkflowActions.js"

const props = defineProps<{
  actions: ReviewActionButton[]
  busy?: boolean
  busyAction?: string
  downloadHref: string
  workflow: {
    scaffolded: boolean
    contentGenerated: boolean
    qaRun: boolean
    qaReadyForApproval: boolean
    imagesGenerated: boolean
    reelImagesGenerated: boolean
    rendered: boolean
    reelRendered: boolean
    exportGenerated: boolean
  }
}>()

const orderedActions = computed(() => useWorkflowActions(props.actions).value)
const saveAction = computed(() =>
  orderedActions.value.find((action) => action.action === "edit")
)
const menuActions = computed(() =>
  orderedActions.value.filter(
    (action) => action.action !== "edit" && action.action !== "export"
  )
)
const actionsMenu = ref<HTMLDetailsElement | null>(null)

const emit = defineEmits<{
  trigger: [payload: { action: string; force: boolean }]
}>()

function triggerSave() {
  emit("trigger", { action: "edit", force: false })
}

function triggerMenuAction(payload: { action: string; force: boolean }) {
  if (actionsMenu.value) actionsMenu.value.open = false
  emit("trigger", payload)
}
</script>

<style scoped>
.post-actions-menu {
  position: relative;
}

.post-actions-menu summary {
  list-style: none;
}

.post-actions-menu summary::-webkit-details-marker {
  display: none;
}

.post-actions-menu__panel {
  min-width: 15rem;
  padding: 0.5rem;
}
</style>
