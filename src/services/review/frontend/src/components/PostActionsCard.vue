<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h5">Workflow</h2>
      <WorkflowBadges :workflow="workflow" />
      <div class="mt-3">
        <ActionButtonGroup
          :actions="orderedActions"
          :busy="busy"
          :busy-action="busyAction"
          :download-href="downloadHref"
          @trigger="$emit('trigger', $event)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
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

defineEmits<{
  trigger: [payload: { action: string; force: boolean }]
}>()
</script>
