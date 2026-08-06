<template>
  <BaseModal :open="open" dialog-class="preview-modal-dialog" title="Großansicht" @close="$emit('close')">
    <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
      <button class="btn btn-outline-secondary" type="button" @click="$emit('previous')">Zurück</button>
      <div class="small text-secondary text-center flex-grow-1">
        {{ currentIndex + 1 }} / {{ items.length }} · {{ currentItem?.label ?? "" }}
      </div>
      <button class="btn btn-outline-secondary" type="button" @click="$emit('next')">Weiter</button>
    </div>
    <div class="preview-modal-stage">
      <img v-if="currentItem && isImage(currentItem.href)" :alt="currentItem.label" :src="currentItem.href" />
      <video v-else-if="currentItem" controls>
        <source :src="currentItem.href" />
      </video>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue"
import BaseModal from "./BaseModal.vue"

const props = defineProps<{
  currentIndex: number
  items: Array<{ href: string; label: string }>
  open: boolean
}>()

const currentItem = computed(() => props.items[props.currentIndex] ?? null)

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key === "ArrowLeft") {
    event.preventDefault()
    emit("previous")
  } else if (event.key === "ArrowRight") {
    event.preventDefault()
    emit("next")
  }
}

const emit = defineEmits<{
  close: []
  next: []
  previous: []
}>()

onMounted(() => window.addEventListener("keydown", handleKeydown))
onUnmounted(() => window.removeEventListener("keydown", handleKeydown))

function isImage(href: string) {
  return /\.(png|jpe?g|webp)$/i.test(href)
}
</script>

<style scoped>
:deep(.preview-modal-dialog) {
  max-width: min(95vw, 88rem);
}

.preview-modal-stage {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 60vh;
}

.preview-modal-stage img,
.preview-modal-stage video {
  height: auto;
  max-height: 68vh;
  max-width: 100%;
  object-fit: contain;
  width: auto;
}
</style>
