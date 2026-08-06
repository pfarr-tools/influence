<template>
  <div class="workflow-icons" :class="{ 'workflow-icons--compact': compact }">
    <span
      v-for="step in steps"
      :key="step.key"
      :class="['workflow-icon', 'badge', `workflow-icon--${step.state}`]"
      :title="step.label"
      :aria-label="step.label"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path :d="step.path" />
      </svg>
      <span class="visually-hidden">{{ step.label }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(defineProps<{
  compact?: boolean
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
}>(), {
  compact: false
})

const iconPaths = {
  approve: "M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z",
  content: "M14,17H7V15H14M17,13H7V11H17M17,9H7V7H17M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19Z",
  export: "M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",
  images: "M21,19V5A2,2 0 0,0 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19M8.5,11.5L11,14.51L14.5,10L19,16H5L8.5,11.5Z",
  qa: "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M13,17H11V15H13V17M13,13H11V7H13V13Z",
  reel: "M17,10.5V6C17,4.9 16.1,4 15,4H5C3.9,4 3,4.9 3,6V18C3,19.1 3.9,20 5,20H15C16.1,20 17,19.1 17,18V13.5L22,18V6L17,10.5Z",
  render: "M19,3A2,2 0 0,1 21,5V15A2,2 0 0,1 19,17H15V21L8,17H5A2,2 0 0,1 3,15V5A2,2 0 0,1 5,3H19Z",
  scaffold: "M5,3A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H11V19H5V5H19V11H21V5A2,2 0 0,0 19,3H5M14,13V16H11V18H14V21H16V18H19V16H16V13H14Z"
}

const steps = computed(() => [
  {
    key: "scaffolded",
    label: "Gerüst angelegt",
    path: iconPaths.scaffold,
    state: props.workflow.scaffolded ? "done" : "idle"
  },
  {
    key: "contentGenerated",
    label: "Inhalt generiert",
    path: iconPaths.content,
    state: props.workflow.contentGenerated ? "done" : "idle"
  },
  {
    key: "qa",
    label: props.workflow.qaReadyForApproval || props.workflow.qaRun
      ? "QA bereit"
      : "QA ausstehend",
    path: iconPaths.qa,
    state: props.workflow.qaReadyForApproval ? "done" : props.workflow.qaRun ? "warning" : "idle"
  },
  {
    key: "imagesGenerated",
    label: "Bilder erzeugt",
    path: iconPaths.images,
    state: props.workflow.imagesGenerated ? "done" : "idle"
  },
  {
    key: "reelImagesGenerated",
    label: "Reelbilder erzeugt",
    path: iconPaths.reel,
    state: props.workflow.reelImagesGenerated ? "done" : "idle"
  },
  {
    key: "rendered",
    label: "Social-Bilder gerendert",
    path: iconPaths.render,
    state: props.workflow.rendered ? "done" : "idle"
  },
  {
    key: "reelRendered",
    label: "Reel gerendert",
    path: iconPaths.reel,
    state: props.workflow.reelRendered ? "done" : "idle"
  },
  {
    key: "exportGenerated",
    label: "Export erstellt",
    path: iconPaths.export,
    state: props.workflow.exportGenerated ? "done" : "idle"
  },
  {
    key: "approved",
    label: "Freigegeben",
    path: iconPaths.approve,
    state: props.workflow.qaReadyForApproval ? "done" : "idle"
  }
])
</script>

<style scoped>
.workflow-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.workflow-icons--compact {
  gap: 0.25rem;
}

.workflow-icon {
  align-items: center;
  background: rgba(31, 50, 58, 0.07);
  border-radius: 999px;
  color: #7d8790;
  display: inline-flex;
  height: 2rem;
  justify-content: center;
  width: 2rem;
}

.workflow-icons--compact .workflow-icon {
  height: 1.75rem;
  width: 1.75rem;
}

.workflow-icon svg {
  fill: currentColor;
  height: 1rem;
  width: 1rem;
}

.workflow-icon--done {
  background: rgba(25, 135, 84, 0.14);
  color: #198754;
}

.workflow-icon--warning {
  background: rgba(255, 193, 7, 0.2);
  color: #9a6700;
}
</style>
