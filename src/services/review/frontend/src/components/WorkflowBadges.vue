<template>
  <div class="workflow-icons" :class="{ 'workflow-icons--compact': compact }">
    <button
      v-for="step in steps"
      :key="step.key"
      :class="['workflow-icon', 'badge', `workflow-icon--${step.state}`]"
      :title="step.label"
      :aria-label="step.label"
      :disabled="!step.action || step.action.disabled || busy"
      type="button"
      @click="triggerStep(step)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path :d="step.path" />
      </svg>
      <span class="visually-hidden">{{ step.label }}</span>
    </button>
  </div>

  <BaseModal
    :open="forceModalOpen"
    title="Aktion erneut ausführen?"
    @close="pendingForceStep = null"
  >
    <p class="mb-0">
      „{{ pendingForceStep?.label }}“ wurde bereits ausgeführt. Soll die
      Aktion mit Force erneut gestartet werden?
    </p>
    <template #footer>
      <button class="btn btn-outline-secondary" type="button" @click="pendingForceStep = null">
        Abbrechen
      </button>
      <button class="btn btn-primary" type="button" @click="confirmForceStep">
        Mit Force erneut ausführen
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import BaseModal from "./BaseModal.vue"

const props = withDefaults(defineProps<{
  compact?: boolean
  approved?: boolean
  publicationApproved?: boolean
  actions?: Array<{
    action: string
    completed: boolean
    disabled: boolean
    label: string
    supportsForce: boolean
  }>
  busy?: boolean
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
  compact: false,
  approved: false,
  publicationApproved: false,
  actions: [],
  busy: false
})

const emit = defineEmits<{
  trigger: [payload: { action: string; force: boolean }]
}>()

const pendingForceStep = ref<(typeof props.actions)[number] | null>(null)
const forceModalOpen = computed(() => pendingForceStep.value !== null)

const iconPaths = {
  approve: "M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z",
  content: "M14,17H7V15H14M17,13H7V11H17M17,9H7V7H17M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19Z",
  export: "M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",
  images: "M21,19V5A2,2 0 0,0 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19M8.5,11.5L11,14.51L14.5,10L19,16H5L8.5,11.5Z",
  qa: "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M13,17H11V15H13V17M13,13H11V7H13V13Z",
  publish: "M5,20H19V18H5M12,4L5,11H9V17H15V11H19L12,4Z",
  reel: "M17,10.5V6C17,4.9 16.1,4 15,4H5C3.9,4 3,4.9 3,6V18C3,19.1 3.9,20 5,20H15C16.1,20 17,19.1 17,18V13.5L22,18V6L17,10.5Z",
  render: "M19,3A2,2 0 0,1 21,5V15A2,2 0 0,1 19,17H15V21L8,17H5A2,2 0 0,1 3,15V5A2,2 0 0,1 5,3H19Z",
  scaffold: "M5,3A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H11V19H5V5H19V11H21V5A2,2 0 0,0 19,3H5M14,13V16H11V18H14V21H16V18H19V16H16V13H14Z"
}

const steps = computed(() => [
  {
    key: "scaffolded",
    label: "Gerüst angelegt",
    path: iconPaths.scaffold,
    state: props.workflow.scaffolded ? "done" : "idle",
    action: actionFor("scaffold")
  },
  {
    key: "contentGenerated",
    label: "Inhalt generiert",
    path: iconPaths.content,
    state: props.workflow.contentGenerated ? "done" : "idle",
    action: actionFor("generate")
  },
  {
    key: "qa",
    label: props.workflow.qaReadyForApproval || props.workflow.qaRun
      ? "QA bereit"
      : "QA ausstehend",
    path: iconPaths.qa,
    state: props.workflow.qaReadyForApproval ? "done" : props.workflow.qaRun ? "warning" : "idle",
    action: actionFor("qa")
  },
  {
    key: "approved",
    label: "QA freigegeben",
    path: iconPaths.approve,
    state: props.approved ? "done" : "idle",
    action: actionFor("approve")
  },
  {
    key: "imagesGenerated",
    label: "Bilder erzeugt",
    path: iconPaths.images,
    state: props.workflow.imagesGenerated ? "done" : "idle",
    action: actionFor("images")
  },
  {
    key: "reelImagesGenerated",
    label: "Reelbilder erzeugt",
    path: iconPaths.reel,
    state: props.workflow.reelImagesGenerated ? "done" : "idle",
    action: actionFor("images-reel")
  },
  {
    key: "rendered",
    label: "Social-Bilder gerendert",
    path: iconPaths.render,
    state: props.workflow.rendered ? "done" : "idle",
    action: actionFor("render")
  },
  {
    key: "reelRendered",
    label: "Reel gerendert",
    path: iconPaths.reel,
    state: props.workflow.reelRendered ? "done" : "idle",
    action: actionFor("render-reel")
  },
  {
    key: "exportGenerated",
    label: "Export erstellt",
    path: iconPaths.export,
    state: props.workflow.exportGenerated ? "done" : "idle",
    action: undefined
  },
  {
    key: "published",
    label: "Veröffentlichung freigeben",
    path: iconPaths.publish,
    state: props.publicationApproved ? "done" : "idle",
    action: actionFor("approve-publication")
  }
])

function actionFor(actionName: string) {
  return props.actions.find((action) => action.action === actionName)
}

function triggerStep(step: (typeof steps.value)[number]) {
  if (!step.action) return
  if (step.action.supportsForce && step.action.completed) {
    pendingForceStep.value = step.action
    return
  }
  emit("trigger", { action: step.action.action, force: false })
}

function confirmForceStep() {
  if (!pendingForceStep.value) return
  emit("trigger", { action: pendingForceStep.value.action, force: true })
  pendingForceStep.value = null
}
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
  border: 0;
  padding: 0;
}

.workflow-icon:not(:disabled) {
  cursor: pointer;
}

.workflow-icon:not(:disabled):hover,
.workflow-icon:not(:disabled):focus-visible {
  filter: brightness(0.92);
  outline: 2px solid currentColor;
  outline-offset: 2px;
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
