<template>
  <teleport to="body">
    <div v-if="open" class="review-modal-backdrop" @click.self="$emit('close')">
      <div :class="dialogClass" class="review-modal-dialog card shadow-lg">
        <div class="card-body p-0">
          <div class="modal-header border-bottom px-4 py-3">
            <h2 class="modal-title fs-5 mb-0">{{ title }}</h2>
            <button type="button" class="btn-close" aria-label="Schließen" @click="$emit('close')" />
          </div>
          <div class="modal-body px-4 py-3">
            <slot />
          </div>
          <div v-if="$slots.footer" class="modal-footer border-top px-4 py-3">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
defineProps<{
  dialogClass?: string
  open: boolean
  title: string
}>()

defineEmits<{
  close: []
}>()
</script>

<style scoped>
.review-modal-backdrop {
  align-items: center;
  background: rgba(15, 26, 34, 0.58);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 1rem;
  position: fixed;
  z-index: 1055;
}

.review-modal-dialog {
  background: #fffdfa;
  max-height: calc(100vh - 2rem);
  max-width: min(96vw, 72rem);
  overflow: auto;
  width: 100%;
}
</style>
