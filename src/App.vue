<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { flushResults } from './api';
import Hanko from './components/Hanko.vue';
import { t } from './i18n';
import { settings } from './settings';
import { menuOpen } from './store';

const theme = useTheme();
watch(
  () => settings.dark,
  (dark) => (theme.global.name.value = dark ? 'dark' : 'light'),
  { immediate: true }
);

const route = useRoute();
const router = useRouter();

const items = computed(() => [
  { path: '/', title: t('nav.decks'), glyph: '札', color: 'success' },
  { path: '/study', title: t('nav.study'), glyph: '学', color: 'info' },
  { path: '/settings', title: t('nav.settings'), glyph: '設', color: 'warning' }
]);
const current = computed(() => items.value.find((i) => (i.path === '/' ? route.path === '/' : route.path.startsWith(i.path)))?.path ?? '/');

function go(path: string): void {
  menuOpen.value = false;
  if (route.path !== path) void router.push(path);
}

// Results that could not be sent (server asleep, no signal) are retried whenever the app comes back.
const retry = (): void => void flushResults();
onMounted(() => {
  retry();
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', retry);
});
onUnmounted(() => {
  window.removeEventListener('online', retry);
  document.removeEventListener('visibilitychange', retry);
});
</script>

<template>
  <v-app>
    <v-navigation-drawer v-model="menuOpen" temporary width="280">
      <div class="drawer-head pa-5">
        <Hanko char="字" :size="52" />
        <div class="text-h6 mt-3 brand">単語帳</div>
        <div class="text-caption">{{ t('app.tagline') }}</div>
      </div>
      <v-list nav class="pa-2">
        <v-list-item
          v-for="i in items"
          :key="i.path"
          :title="i.title"
          :active="current === i.path"
          color="primary"
          rounded="lg"
          @click="go(i.path)"
        >
          <template #prepend><div class="nav-tile" :style="{ background: `rgb(var(--v-theme-${i.color}))` }" aria-hidden="true">{{ i.glyph }}</div></template>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<style scoped>
.drawer-head {
  background: var(--forest);
  color: #fff;
}
.brand {
  font-family: var(--font-jp);
  letter-spacing: 0.1em;
}
.nav-tile {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: var(--font-jp);
  font-size: 1.2rem;
  margin-right: 14px;
}
</style>
