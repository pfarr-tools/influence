<template>
  <div class="review-app">
    <AppHeader />
    <main class="container py-4">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from "../components/AppHeader.vue"
</script>
