<template>
  <div class="d-flex flex-wrap gap-2">
    <span
      v-for="step in steps"
      :key="step.label"
      :class="step.done ? 'badge rounded-pill text-bg-success' : 'badge rounded-pill text-bg-secondary'"
    >
      {{ step.label }}
    </span>
  </div>
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
  { done: props.workflow.qaReadyForApproval, label: "QA bereit" },
  { done: props.workflow.imagesGenerated, label: "Bilder" },
  { done: props.workflow.reelImagesGenerated, label: "Reelbilder" },
  { done: props.workflow.rendered, label: "Render" },
  { done: props.workflow.reelRendered, label: "Reel" },
  { done: props.workflow.exportGenerated, label: "Export" }
])
</script>
