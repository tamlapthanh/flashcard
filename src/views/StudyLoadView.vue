<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { loadDeckRun } from '../lib/startDeck';
import { pendingStart } from '../store';
import StudyView from './StudyView.vue';

/*
 * The /study route. Tapping a deck only says WHICH deck to study (store: pendingStart) and comes here at once; this screen shows a loading screen
 * while the cards come from the server, then hands over to the study screen. Without a pending deck (the menu, a reload, the arrow back from the
 * deck list) the study screen opens straight away, as before.
 */
const router = useRouter();
const job = pendingStart.value; // taken once: a retry reuses it
pendingStart.value = null;

const ready = ref(!job);
const failed = ref(false);
const waking = ref(false);
let gone = false;
onUnmounted(() => (gone = true));

async function run(): Promise<void> {
  if (!job) return;
  failed.value = false;
  waking.value = false;
  // A free server sleeps: if it does not answer quickly, say it is waking up instead of looking frozen.
  const wakeTimer = setTimeout(() => (waking.value = true), 2500);
  try {
    const outcome = await loadDeckRun(job);
    if (gone) return;
    if (outcome === 'finished') await router.replace({ path: '/study', query: { finished: job.deckId } });
    if (!gone) ready.value = true;
  } catch {
    if (!gone) failed.value = true;
  } finally {
    clearTimeout(wakeTimer);
    waking.value = false;
  }
}
void run();
</script>

<template>
  <StudyView v-if="ready" />
  <template v-else>
    <TopBar :title="t('nav.study')" />
    <div class="loadscreen" role="status" aria-live="polite">
      <template v-if="!failed">
        <v-progress-circular indeterminate size="56" width="5" color="primary" />
        <div class="jp name">{{ job?.deckName }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ waking ? t('deck.waking') : t('study.loading') }}</div>
      </template>
      <template v-else>
        <v-icon icon="mdi-alert-circle-outline" size="48" color="error" />
        <div class="text-body-1">{{ t('err.load') }}</div>
        <div class="d-flex ga-2">
          <v-btn color="primary" prepend-icon="mdi-refresh" :data-tip="t('tip.retry')" @click="run">{{ t('deck.retry') }}</v-btn>
          <v-btn variant="tonal" prepend-icon="mdi-cards-outline" @click="router.replace('/')">{{ t('study.backToDecks') }}</v-btn>
        </div>
      </template>
    </div>
  </template>
</template>

<style scoped>
/* a screen of its own: everything centred under the top bar */
.loadscreen {
  min-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
}
.name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--headword);
}
</style>
