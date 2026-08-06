<template>
  <div class="review-app">
    <AppHeader />
    <main class="container py-4">
      <router-view />
    </main>
    <LoadingOverlay
      :message="reviewStore.loadingMessage"
      :open="Boolean(reviewStore.loadingMessage)"
      title="Aktion läuft"
    />
  </div>
</template>

<script setup lang="ts">
import AppHeader from "../components/AppHeader.vue"
import LoadingOverlay from "../components/LoadingOverlay.vue"
import { reviewStore } from "../stores/review-store.js"
</script>
