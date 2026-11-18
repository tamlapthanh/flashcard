<script setup lang="ts">
import { menuOpen } from '../store';

defineProps<{ title?: string }>();
</script>

<!-- The indigo top bar shared by every screen: ☰ opens the menu; `center` replaces the title (study screen shows the ensō); the default slot holds actions. -->
<template>
  <v-app-bar flat density="compact">
    <v-app-bar-nav-icon aria-label="Menu" @click="menuOpen = !menuOpen" />
    <v-app-bar-title class="text-body-1 font-weight-medium">
      <slot name="center">{{ title }}</slot>
    </v-app-bar-title>
    <slot />
  </v-app-bar>
</template>
