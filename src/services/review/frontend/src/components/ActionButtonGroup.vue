<template>
  <div class="d-flex flex-wrap gap-2">
    <button
      v-for="action in actions"
      :key="action.action"
      :class="action.primary ? 'btn btn-primary' : 'btn btn-outline-secondary'"
      :disabled="action.disabled || busy"
      type="button"
      @click="$emit('trigger', action.action)"
    >
      {{ action.label }}
    </button>
    <a v-if="downloadHref" class="btn btn-outline-success" :href="downloadHref">
      Exportieren
    </a>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  actions: Array<{ action: string; disabled: boolean; label: string; primary: boolean }>
  busy?: boolean
  downloadHref?: string
}>()

defineEmits<{
  trigger: [action: string]
}>()
</script>
