<template>
  <teleport to="body">
    <div v-if="open" class="loading-overlay">
      <div class="card shadow-lg loading-overlay__panel">
        <div class="card-body d-flex align-items-center gap-3 px-4 py-3">
          <div class="spinner-border text-primary" aria-hidden="true" />
          <div>
            <div class="fw-semibold">{{ title }}</div>
            <div v-if="message" class="text-secondary">{{ message }}</div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
defineProps<{
  message?: string
  open: boolean
  title?: string
}>()
</script>

<style scoped>
.loading-overlay {
  align-items: flex-start;
  background: rgba(15, 26, 34, 0.32);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 4rem 1rem 1rem;
  position: fixed;
  z-index: 1060;
}

.loading-overlay__panel {
  background: #fffdfa;
  max-width: min(92vw, 34rem);
  width: 100%;
}
</style>
