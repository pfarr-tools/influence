<template>
  <ol class="list-group list-group-numbered">
    <li
      v-for="step in steps"
      :key="step.label"
      class="list-group-item d-flex justify-content-between align-items-start"
    >
      <div class="me-3">{{ step.label }}</div>
      <span :class="step.done ? 'badge text-bg-success' : 'badge text-bg-secondary'">
        {{ step.done ? "erledigt" : "offen" }}
      </span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
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

const steps = computed(() => [
  { done: props.workflow.scaffolded, label: "Gerüst" },
  { done: props.workflow.contentGenerated, label: "Inhalt" },
  { done: props.workflow.qaRun, label: "QA" },
  { done: props.workflow.qaReadyForApproval, label: "Freigabereif" },
  { done: props.workflow.imagesGenerated, label: "Bilder" },
  { done: props.workflow.reelImagesGenerated, label: "Reelbilder" },
  { done: props.workflow.rendered, label: "Vorschauen" },
  { done: props.workflow.reelRendered, label: "Reel" },
  { done: props.workflow.exportGenerated, label: "Export" }
])
</script>
