<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h5">{{ title }}</h2>
      <div v-if="items.length === 0" class="text-secondary">Noch keine Vorschauen vorhanden.</div>
      <div v-else class="row g-3">
        <div v-for="item in items" :key="item.href" class="col-md-6">
          <a :href="item.href" class="preview-gallery__tile" target="_blank" rel="noreferrer">
            <img
              v-if="isImage(item.href)"
              :alt="item.label"
              :src="item.href"
              class="img-fluid rounded border"
            />
            <video v-else controls class="w-100 rounded border">
              <source :src="item.href" />
            </video>
            <div class="small mt-2 text-secondary">{{ item.label }}</div>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  items: Array<{ href: string; label: string }>
  title: string
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
</style>
