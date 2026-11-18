<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import TopBar from '../components/TopBar.vue';
import { clearDetails, ensureDetails } from '../lib/cardDetail';
import { StudySession } from '../session';
import { settings } from '../settings';
import { activeSession } from '../store';
import type { Deck, StudyStatus } from '../types';

const router = useRouter();

const decks = ref<Deck[]>([]);
const loading = ref(true);
const waking = ref(false);
const error = ref('');
const starting = ref(false);
const filterOpen = ref(false);

const deckId = ref<string | null>(null);
const tags = ref<string[]>([]);
const statuses = ref<StudyStatus[]>(['new', 'learning']);

const statusLabel = (s: StudyStatus): string => t(`status.${s}`);
const STATUS_ORDER: StudyStatus[] = ['new', 'learning', 'learned', 'skipped'];
const STATUS_ICON: Record<StudyStatus, string> = {
  new: 'mdi-star-four-points-outline',
  learning: 'mdi-progress-clock',
  learned: 'mdi-check-circle-outline',
  skipped: 'mdi-pause-circle-outline'
};

const deck = computed(() => decks.value.find((d) => d.id === deckId.value) ?? null);

/* Cards matching the status filter (tags are applied by the server; the count here is an upper bound by status). */
const eligible = computed(() => (deck.value ? statuses.value.reduce((n, s) => n + deck.value!.counts[s], 0) : 0));

/* What Start will load: every card of the status filter; with tags, at most the cards that carry them (an upper bound, tags may overlap). */
const startCount = computed(() => {
  if (!deck.value || tags.value.length === 0) return eligible.value;
  const tagged = deck.value.tags.filter((tg) => tags.value.includes(tg.tag)).reduce((n, tg) => n + tg.count, 0);
  return Math.min(eligible.value, tagged);
});

const learnedPercent = (d: Deck): number => (d.total ? Math.round((100 * d.counts.learned) / d.total) : 0);

/* One-line summary of the filter, shown on the main screen. */
const filterSummary = computed(() => {
  return [statuses.value.map((s) => statusLabel(s)).join(' + ') || t('filter.allStatus')];
});

watch(deckId, () => (tags.value = []));

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  // A free server sleeps: if it does not answer quickly, tell the user it is waking up instead of looking frozen.
  const wakeTimer = setTimeout(() => (waking.value = true), 2500);
  try {
    decks.value = await api.decks();
    deckId.value ??= decks.value[0]?.id ?? null;
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 401 ? t('err.key') : t('err.conn');
  } finally {
    clearTimeout(wakeTimer);
    waking.value = false;
    loading.value = false;
  }
}

async function start(): Promise<void> {
  if (!deck.value) return;
  starting.value = true;
  error.value = '';
  try {
    const { cards } = await api.cards({ deck: deck.value.id, tags: tags.value, status: statuses.value });
    if (cards.length === 0) {
      error.value = t('err.none');
      return;
    }
    clearDetails();
    await ensureDetails(cards.slice(0, 7).map((c) => c.id)); // the first cards are complete when the study screen opens
    activeSession.value = new StudySession(cards, { reverse: settings.direction === 'reverse', showReading: settings.showReading });
    await router.push('/study');
  } catch {
    error.value = t('err.load');
  } finally {
    starting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <TopBar title="単語帳" />

  <v-container fluid class="deckpage">
    <v-alert v-if="waking" type="info" variant="tonal" icon="mdi-power-sleep" class="mb-3">{{ t('deck.waking') }}</v-alert>
    <v-alert v-if="error" type="error" variant="tonal" icon="mdi-alert-circle-outline" class="mb-3">
      {{ error }}
      <template #append><v-btn variant="tonal" size="small" @click="load">{{ t('deck.retry') }}</v-btn></template>
    </v-alert>
    <v-progress-linear v-if="loading" indeterminate class="mb-3" color="primary" />

    <template v-if="decks.length">
      <div class="decks">
        <button v-for="d in decks" :key="d.id" type="button" class="paper-card deck" :class="{ on: d.id === deckId }" @click="deckId = d.id">
          <div class="d-flex align-center ga-3">
            <div class="deck-tile jp" aria-hidden="true">札</div>
            <div class="flex-grow-1 text-start">
              <div class="text-subtitle-1 font-weight-medium">{{ d.name }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('deck.count', { total: d.total, fresh: d.counts.new }) }}</div>
            </div>
            <v-icon :icon="d.id === deckId ? 'mdi-check-circle' : 'mdi-circle-outline'" :color="d.id === deckId ? 'primary' : undefined" />
          </div>
          <v-progress-linear :model-value="learnedPercent(d)" height="4" rounded color="primary" bg-color="surface-variant" class="mt-3" />
        </button>
      </div>

      <button type="button" class="paper-card filter" @click="filterOpen = true">
        <v-icon icon="mdi-filter-variant" class="mr-3" color="primary" />
        <div class="d-flex flex-wrap ga-1 flex-grow-1">
          <v-chip v-for="(p, i) in filterSummary" :key="i" size="small" variant="tonal">{{ p }}</v-chip>
        </div>
        <v-icon icon="mdi-chevron-right" />
      </button>

      <!-- tags take ALL the space that is left on the screen and scroll inside it if there are still more -->
      <div v-if="deck?.tags.length" class="paper-card tagsbox">
        <div class="tagshead">
          <div class="label"><v-icon icon="mdi-tag-multiple-outline" size="14" />{{ t('filter.tags') }}</div>
          <v-btn v-if="tags.length" size="x-small" variant="tonal" color="primary" @click="tags = []">{{ t('filter.clear', { n: tags.length }) }}</v-btn>
        </div>
        <div class="tagscroll">
          <v-chip-group v-model="tags" multiple filter column color="primary">
            <v-chip v-for="tg in deck.tags" :key="tg.tag" :value="tg.tag" size="small" variant="tonal">{{ tg.tag }} ({{ tg.count }})</v-chip>
          </v-chip-group>
        </div>
      </div>
    </template>
  </v-container>

  <v-footer v-if="deck" app class="pa-3 start-bar">
    <v-btn block color="primary" size="large" prepend-icon="mdi-play" :loading="starting" :disabled="eligible === 0" @click="start">
      <span class="jp-start">始める</span>&nbsp;· {{ t('deck.start', { n: startCount }) }}
    </v-btn>
  </v-footer>

  <!-- filter sheet: status (tags live on the main screen; there is no limit on the number of cards) -->
  <v-bottom-sheet v-model="filterOpen">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" />
      <div class="pa-4 pt-1">
        <div class="label"><v-icon icon="mdi-progress-check" size="14" />{{ t('filter.status') }}</div>
        <v-chip-group v-model="statuses" multiple filter color="primary" class="mb-2">
          <v-chip v-for="s in STATUS_ORDER" :key="s" :value="s" size="small" :prepend-icon="STATUS_ICON[s]">{{ statusLabel(s) }} ({{ deck?.counts[s] ?? 0 }})</v-chip>
        </v-chip-group>

        <v-btn block color="primary" class="mt-3" prepend-icon="mdi-check" @click="filterOpen = false">{{ t('filter.done') }}</v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
/* The page fills the screen between the top bar and the Start bar: decks, a filter line, then tags use whatever is left. */
.deckpage {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-inline: 12px; /* same side margin as the Start bar (pa-3), so panels and button line up */
  padding-top: 4px; /* Vuetify container adds 16px; keep the first panel close to the top bar */
  padding-bottom: 8px; /* was 16px: less empty space above the Start bar */
  min-height: calc(100dvh - var(--v-layout-top, 48px) - var(--v-layout-bottom, 72px)); /* at least the screen; grows (and the page scrolls) only if the decks alone need more */
}
.decks {
  flex: 0 0 auto; /* the dictionaries are shown in full, exactly as before */
  display: flex;
  flex-direction: column;
  gap: 6px; /* same as .deckpage gap, so every panel is spaced evenly */
}
.tagsbox {
  flex: 1 1 0;
  min-height: max(125px, 25dvh); /* room for ~2-3 tags; the page scrolls when there are many decks */
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
}
.tagshead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}
.tagscroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 0;
}
.tagscroll :deep(.v-chip-group) {
  padding-top: 0; /* Vuetify adds 4px above the chips */
}
.deck {
  display: block;
  width: 100%;
  padding: 12px 14px;
  border: 2px solid transparent;
  text-align: start;
  color: inherit;
}
.deck.on {
  border-color: rgb(var(--v-theme-primary));
}
.deck-tile {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--forest);
  color: #fff !important;
  font-size: 1.35rem;
  flex-shrink: 0;
}
.filter {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  text-align: start;
  color: inherit;
}
.start-bar {
  flex-direction: column;
  align-items: stretch;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid var(--paper-edge);
}
.jp-start {
  font-family: var(--font-jp);
  font-weight: 700;
}
.sheet {
  background: var(--paper);
}
.grip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 4px;
}
</style>
