<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h5">Reel</h2>
      <div v-if="previewHref">
        <video controls class="w-100 rounded border">
          <source :src="previewHref" />
        </video>
      </div>
      <div v-else class="text-secondary">Noch kein Reel gerendert.</div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  previewHref: string | null
}>()
</script>
