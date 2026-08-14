<template>
  <div
    :class="
      variant === 'menu' ? 'dropdown-menu-items' : 'd-flex flex-wrap gap-2'
    "
  >
    <button
      v-for="action in actions"
      :key="action.action"
      :class="
        variant === 'menu'
          ? ['dropdown-item', 'workflow-action', `workflow-action--${actionState(action)}`]
          : action.primary
            ? 'btn btn-primary'
            : 'btn btn-outline-secondary'
      "
      :disabled="action.disabled || busy"
      type="button"
      @click="triggerAction(action)"
    >
      <span class="workflow-action__icon" aria-hidden="true">{{ actionIcon(action.action) }}</span>
      <span
        v-if="busy && busyAction === action.action"
        class="spinner-border spinner-border-sm me-2"
        aria-hidden="true"
      />
      {{ action.label }}
    </button>
    <div v-if="downloadHref" class="dropdown-divider" role="separator" />
    <a
      v-if="downloadHref"
      :class="variant === 'menu' ? 'dropdown-item' : 'btn btn-outline-success'"
      :href="downloadHref"
    >
      <span class="workflow-action__icon" aria-hidden="true">⇩</span>
      Exportieren
    </a>
  </div>

  <BaseModal
    :open="forceModalOpen"
    title="Aktion erneut ausführen?"
    @close="closeForceModal"
  >
    <p class="mb-0">
      {{ forceModalText }}
    </p>
    <template #footer>
      <button
        class="btn btn-outline-secondary"
        type="button"
        @click="closeForceModal"
      >
        Abbrechen
      </button>
      <button class="btn btn-primary" type="button" @click="confirmForceAction">
        Mit Force erneut ausführen
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import BaseModal from "./BaseModal.vue"

type ActionButton = {
  action: string
  completed: boolean
  disabled: boolean
  label: string
  primary: boolean
  supportsForce: boolean
  state?: "done" | "idle" | "warning"
}

const props = defineProps<{
  actions: ActionButton[]
  busy?: boolean
  busyAction?: string
  downloadHref?: string
  variant?: "buttons" | "menu"
}>()

const variant = computed(() => props.variant ?? "buttons")

const emit = defineEmits<{
  trigger: [payload: { action: string; force: boolean }]
}>()

const pendingForceAction = ref<ActionButton | null>(null)

const forceModalOpen = computed(() => pendingForceAction.value !== null)
const forceModalText = computed(() => {
  if (!pendingForceAction.value) {
    return ""
  }

  return `„${pendingForceAction.value.label}“ wurde bereits ausgeführt. Soll die Aktion mit Force erneut gestartet werden?`
})

function triggerAction(action: ActionButton) {
  if (action.supportsForce && action.completed) {
    pendingForceAction.value = action
    return
  }

  emit("trigger", { action: action.action, force: false })
}

function closeForceModal() {
  pendingForceAction.value = null
}

function confirmForceAction() {
  if (!pendingForceAction.value) {
    return
  }

  emit("trigger", { action: pendingForceAction.value.action, force: true })
  closeForceModal()
}

function actionState(action: ActionButton): "done" | "idle" | "warning" {
  if (action.completed) return "done"
  if (action.disabled) return "warning"
  return "idle"
}

function actionIcon(action: string): string {
  return {
    scaffold: "＋",
    generate: "▤",
    "mark-generated": "✎",
    qa: "!",
    approve: "✓",
    images: "▧",
    "images-reel": "▶",
    render: "▰",
    "render-reel": "▶",
    "approve-publication": "↗"
  }[action] ?? "•"
}
</script>

<style scoped>
.workflow-action__icon {
  display: inline-block;
  font-weight: 700;
  margin-right: 0.5rem;
  text-align: center;
  width: 1.1rem;
}

.workflow-action--done {
  color: #198754;
}

.workflow-action--warning {
  color: #9a6700;
}

.workflow-action--idle {
  color: #495057;
}
</style>
