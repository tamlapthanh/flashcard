<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import TopBar from '../components/TopBar.vue';
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
const limit = ref(50);

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

const learnedPercent = (d: Deck): number => (d.total ? Math.round((100 * d.counts.learned) / d.total) : 0);

/* One-line summary of the filter, shown on the main screen. */
const filterSummary = computed(() => {
  return [statuses.value.map((s) => statusLabel(s)).join(' + ') || t('filter.allStatus'), t('filter.max', { n: limit.value })];
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
    const { cards } = await api.cards({ deck: deck.value.id, tags: tags.value, status: statuses.value, limit: limit.value });
    if (cards.length === 0) {
      error.value = t('err.none');
      return;
    }
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
  <TopBar title="単語帳">
    <v-btn icon="mdi-refresh" :aria-label="t('deck.reload')" :disabled="loading" @click="load" />
  </TopBar>

  <v-container class="deckpage">
    <v-alert v-if="waking" type="info" variant="tonal" icon="mdi-power-sleep" class="mb-3">{{ t('deck.waking') }}</v-alert>
    <v-alert v-if="error" type="error" variant="tonal" icon="mdi-alert-circle-outline" class="mb-3">
      {{ error }}
      <template #append><v-btn variant="tonal" size="small" @click="load">{{ t('deck.retry') }}</v-btn></template>
    </v-alert>
    <v-progress-linear v-if="loading" indeterminate class="mb-3" color="primary" />

    <template v-if="decks.length">
      <div class="decks">
        <button v-for="d in decks" :key="d.id" type="button" class="paper-card deck mb-2" :class="{ on: d.id === deckId }" @click="deckId = d.id">
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
        <div class="text-caption text-medium-emphasis">{{ t('filter.tagsHint') }}</div>
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
      <span class="jp-start">始める</span>&nbsp;· {{ t('deck.start', { n: Math.min(limit, eligible) }) }}
    </v-btn>
  </v-footer>

  <!-- filter sheet: status and size (tags live on the main screen) -->
  <v-bottom-sheet v-model="filterOpen">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" />
      <div class="pa-4 pt-1">
        <div class="label"><v-icon icon="mdi-progress-check" size="14" />{{ t('filter.status') }}</div>
        <v-chip-group v-model="statuses" multiple filter color="primary" class="mb-2">
          <v-chip v-for="s in STATUS_ORDER" :key="s" :value="s" size="small" :prepend-icon="STATUS_ICON[s]">{{ statusLabel(s) }} ({{ deck?.counts[s] ?? 0 }})</v-chip>
        </v-chip-group>

        <div class="label"><v-icon icon="mdi-counter" size="14" />{{ t('filter.limit', { n: limit }) }}</div>
        <v-slider v-model="limit" :min="10" :max="200" :step="10" hide-details color="primary" prepend-icon="mdi-minus" append-icon="mdi-plus" />

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
  gap: 10px;
  min-height: calc(100dvh - 128px); /* at least the screen; grows (and the page scrolls) only if the decks alone need more */
}
.decks {
  flex: 0 0 auto; /* the dictionaries are shown in full, exactly as before */
}
.tagsbox {
  flex: 1 1 0;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
}
.tagshead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}
.tagscroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 4px;
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
