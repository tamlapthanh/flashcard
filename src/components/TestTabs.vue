<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { t } from '../i18n';

/*
 * The two halves of the "Tests" menu entry: the tests an admin assigned (take one, any number of times) and the tests of your own (those you
 * made and every attempt at an assigned one). They are two screens; this switch sits on top of both.
 * The buttons are those of the study screen's top bar (.act3d in style.css: a coloured button with a 3D edge); the one you are on is the lit one, the other is quiet.
 */
const route = useRoute();
const router = useRouter();

function go(path: string): void {
  if (route.path !== path) void router.replace(path);
}
</script>

<template>
  <div class="testtabs">
    <v-btn class="act3d act3d-blue" :class="{ quiet: route.path !== '/papers' }" prepend-icon="mdi-clipboard-text-outline" variant="flat" color="primary" :aria-pressed="route.path === '/papers'" @click="go('/papers')">{{ t('tests.tabAssigned') }}</v-btn>
    <v-btn class="act3d act3d-purple" :class="{ quiet: route.path !== '/tests' }" prepend-icon="mdi-history" variant="flat" color="primary" :aria-pressed="route.path === '/tests'" @click="go('/tests')">{{ t('tests.tabMine') }}</v-btn>
  </div>
</template>

<style scoped>
.testtabs {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 2px 12px 8px;
}
</style>
