<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h5">{{ title }}</h2>
      <div v-if="items.length === 0" class="text-secondary">Noch keine Vorschauen vorhanden.</div>
      <div v-else class="preview-grid-compact">
        <button
          v-for="(item, index) in items"
          :key="item.href"
          class="preview-gallery__tile btn p-0 border-0 text-start"
          type="button"
          @click="$emit('preview', index)"
        >
          <div>
            <img
              v-if="isImage(item.href)"
              :alt="item.label"
              :src="item.href"
              class="img-fluid rounded border preview-thumb"
            />
            <video v-else controls class="w-100 rounded border">
              <source :src="item.href" />
            </video>
            <div class="small mt-2 text-secondary">{{ item.label }}</div>
          </div>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  items: Array<{ href: string; label: string }>
  title: string
}>()

defineEmits<{
  preview: [index: number]
}>()

function isImage(href: string) {
  return /\.(png|jpe?g|webp)$/i.test(href)
}
</script>

<style scoped>
.preview-gallery__tile {
  color: inherit;
  display: block;
  text-decoration: none;
}

.preview-grid-compact {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
}

.preview-thumb {
  aspect-ratio: 4 / 5;
  height: 5.5rem;
  object-fit: cover;
  width: 100%;
}
</style>
