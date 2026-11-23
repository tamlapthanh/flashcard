<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { t } from '../i18n';
import { activeSession, menuOpen } from '../store';

const props = defineProps<{ title?: string; hidden?: boolean; back?: boolean; flush?: boolean }>(); // flush: the menu button lines up with the left edge of the cards below (the deck screen)
const router = useRouter();
/* Deck and Settings: while a word is being studied, an arrow takes you straight back to it (no trip through the menu). */
const canResume = computed(() => !!props.back && !!activeSession.value && !activeSession.value.finished);
</script>

<!-- The indigo top bar shared by every screen: ☰ opens the menu; `center` replaces the title (study screen shows the ensō); the default slot holds actions. -->
<template>
  <v-app-bar v-if="!hidden" flat density="compact" :class="{ flush }">
    <v-app-bar-nav-icon :aria-label="t('tip.menu')" @click="menuOpen = !menuOpen" />
    <v-app-bar-title class="text-body-1 font-weight-medium">
      <slot name="center">{{ title }}</slot>
    </v-app-bar-title>
    <slot />
  </v-app-bar>
  <!-- outside the bar (a fixed button inside it would be placed relative to the bar): bottom left, within thumb reach -->
  <v-btn v-if="canResume" class="resume" icon="mdi-arrow-left" size="small" variant="flat" :aria-label="t('tip.resume')" :data-tip="t('tip.resume')" @click="router.push('/study')" />
</template>

<style scoped>
/* flush: the menu button starts exactly where the cards below start (the side margin of the deck page) */
.flush :deep(.v-app-bar-nav-icon) {
  margin-inline-start: 6px !important; /* Vuetify's own margin on the first button of the bar (4px) is more specific */
}
/* the menu button sits 1px higher, level with the row of buttons beside it */
:deep(.v-app-bar-nav-icon) {
  transform: translateY(-1px);
}
.resume {
  position: fixed;
  left: 9px;
  bottom: calc(9px + env(safe-area-inset-bottom, 0px));
  z-index: 1000;
  width: 34px !important;
  height: 34px !important;
  min-width: 0 !important;
}
/* orange like the Again button (not the green of the study buttons), 34px like the play button of a deck, 3D like the other buttons */
.resume.v-btn:not(.v-btn--disabled) {
  background-color: #ef8a17 !important;
  color: #fff !important;
  box-shadow: 0 2px 0 #b8600f;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
@media (hover: hover) and (pointer: fine) {
  .resume.v-btn:not(.v-btn--disabled):hover {
    background-color: #f7a94d !important;
    box-shadow: 0 1px 0 #b8600f;
    transform: translateY(2px);
  }
}
.resume.v-btn:not(.v-btn--disabled):active {
  box-shadow: 0 0 0 #b8600f;
  transform: translateY(3px);
}
</style>
