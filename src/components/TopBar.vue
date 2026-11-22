<script setup lang="ts">
import { t } from '../i18n';
import { menuOpen } from '../store';

defineProps<{ title?: string; hidden?: boolean }>();
</script>

<!-- The indigo top bar shared by every screen: ☰ opens the menu; `center` replaces the title (study screen shows the ensō); the default slot holds actions. -->
<template>
  <v-app-bar v-if="!hidden" flat density="compact">
    <v-app-bar-nav-icon :aria-label="t('tip.menu')" @click="menuOpen = !menuOpen" />
    <v-app-bar-title class="text-body-1 font-weight-medium">
      <slot name="center">{{ title }}</slot>
    </v-app-bar-title>
    <slot />
  </v-app-bar>
</template>
