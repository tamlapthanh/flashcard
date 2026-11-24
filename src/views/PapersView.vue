<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, me } from '../api';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import PaperMaker from '../components/PaperMaker.vue';
import TestTabs from '../components/TestTabs.vue';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { ANY_DECK } from '../lib/paper';
import { pendingTest } from '../store';
import type { PaperInfo, PaperResult } from '../types';

/*
 * The tests an admin made, for every user: take one (any number of times; each time is a test of your own, in "My tests"). An admin can also
 * make a new one, see everybody's results and delete one.
 */
const router = useRouter();

const papers = ref<PaperInfo[]>([]);
const loading = ref(true);
const failed = ref(false);
const startError = ref(false);
const starting = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    papers.value = await api.papers();
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/* A new attempt is made on the server (the paper is copied into a test of this user), then the test screen continues it from its first question. */
async function start(p: PaperInfo): Promise<void> {
  if (starting.value) return;
  starting.value = p.paperId;
  startError.value = false;
  try {
    const { sessionId } = await api.startPaper(p.paperId, newId());
    pendingTest.value = { deckId: p.deckId, deckName: p.title, tags: [], statuses: [], count: p.total, kinds: p.mode, resumeId: sessionId };
    await router.push('/test');
  } catch {
    startError.value = true;
  } finally {
    starting.value = null;
  }
}

const sourceText = (p: PaperInfo): string => {
  if (p.deckId === ANY_DECK && p.sources.length > 3) return t('papers.allDecks');
  const names = p.sources.map((s) => s.deckName).filter(Boolean);
  const tags = [...new Set(p.sources.flatMap((s) => s.tags))];
  return names.join(', ') + (tags.length ? ` · ${tags.join(', ')}` : '');
};
const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const percent = (p: PaperInfo): number => Math.round((100 * (p.bestCorrect ?? 0)) / Math.max(p.total, 1));

/* ---- admin ---- */
const makerOpen = ref(false);

const resultsOf = ref<PaperInfo | null>(null);
const resultsOpen = ref(false);
const results = ref<PaperResult[]>([]);
const resultsLoading = ref(false);
const resultsFailed = ref(false);
async function showResults(p: PaperInfo): Promise<void> {
  resultsOf.value = p;
  results.value = [];
  resultsFailed.value = false;
  resultsLoading.value = true;
  resultsOpen.value = true;
  try {
    results.value = await api.paperResults(p.paperId);
  } catch {
    resultsFailed.value = true;
  } finally {
    resultsLoading.value = false;
  }
}
/* One line per user: how many times, and the best finished score. */
const perUser = computed(() => {
  const by = new Map<string, { userId: string; attempts: number; best: number | null; last: PaperResult }>();
  for (const r of results.value) {
    const seen = by.get(r.userId);
    const best = r.status === 'done' ? r.correct : null;
    if (!seen) by.set(r.userId, { userId: r.userId, attempts: 1, best, last: r });
    else {
      seen.attempts++;
      if (best !== null && (seen.best === null || best > seen.best)) seen.best = best;
    }
  }
  return [...by.values()].sort((a, b) => a.userId.localeCompare(b.userId));
});

const deleteTarget = ref<PaperInfo | null>(null);
async function remove(): Promise<void> {
  const p = deleteTarget.value;
  deleteTarget.value = null;
  if (!p) return;
  try {
    await api.deletePaper(p.paperId);
    papers.value = papers.value.filter((x) => x.paperId !== p.paperId);
  } catch {
    failed.value = true;
  }
}

onMounted(() => void load());
</script>

<template>
  <TopBar :title="t('nav.tests')" back>
    <v-btn v-if="me.admin" variant="flat" color="primary" prepend-icon="mdi-plus" class="act3d act3d-green mr-2" :data-tip="t('papers.new')" @click="makerOpen = true">{{ t('papers.new') }}</v-btn>
  </TopBar>

  <TestTabs />

  <v-container fluid class="histpage paperspage">
    <v-progress-linear v-if="loading" indeterminate color="primary" />
    <v-alert v-if="failed" type="error" variant="tonal" icon="mdi-alert-circle-outline">
      {{ t('papers.error') }}
      <template #append><v-btn variant="tonal" size="small" :data-tip="t('tip.retry')" @click="load()">{{ t('deck.retry') }}</v-btn></template>
    </v-alert>
    <v-alert v-if="startError" type="error" variant="tonal" density="compact" closable @click:close="startError = false">{{ t('papers.startError') }}</v-alert>
    <div v-if="!loading && !failed && papers.length === 0" class="empty text-body-2">{{ t('papers.empty') }}</div>

    <div class="grid">
      <div v-for="p in papers" :key="p.paperId" class="paper-card row" :class="{ open: p.attempts === 0 }">
        <div class="info">
          <div class="decktop">
            <div class="deck jp">{{ p.title }}</div>
            <span v-if="p.bestCorrect !== null" class="scoreline doneline" :class="{ perfect: p.bestCorrect === p.total }">{{ p.bestCorrect }}/{{ p.total }}</span>
            <span v-else class="scoreline openline">{{ p.total }}</span>
          </div>
          <div class="text-caption text-medium-emphasis srcline">{{ sourceText(p) }}</div>
          <div class="text-caption text-medium-emphasis">{{ when(p.at) }} · {{ t('papers.by', { user: p.createdBy }) }}</div>
          <div class="kindline text-caption">
            <span v-if="p.nListen"><v-icon icon="mdi-volume-high" size="12" /> {{ t('test.shortListen') }} {{ p.nListen }}</span>
            <span v-if="p.nMeaning"><v-icon icon="mdi-translate" size="12" /> {{ t('test.shortMeaning') }} {{ p.nMeaning }}</span>
            <span v-if="p.nReading"><v-icon icon="mdi-syllabary-hiragana" size="12" /> {{ t('test.shortReading') }} {{ p.nReading }}</span>
          </div>
          <div class="text-caption mine">
            <template v-if="p.attempts === 0">{{ t('papers.never') }}</template>
            <template v-else>
              {{ t('papers.attempts', { n: p.attempts }) }}
              <template v-if="p.latest"> · {{ t('papers.last', { correct: p.latest.correct, answered: p.latest.answered }) }}<span v-if="p.latest.status === 'open'"> ({{ t('papers.notDone') }})</span></template>
            </template>
          </div>
          <v-progress-linear :model-value="percent(p)" height="4" rounded color="primary" bg-color="surface-variant" class="mt-1" />
          <div class="btns">
            <v-btn size="small" color="primary" prepend-icon="mdi-play" :loading="starting === p.paperId" :disabled="!!starting" @click="start(p)">{{ t('papers.start') }}</v-btn>
            <v-btn v-if="p.attempts > 0" size="small" variant="tonal" prepend-icon="mdi-history" @click="router.push('/tests')">{{ t('papers.history') }}</v-btn>
            <template v-if="me.admin">
              <v-btn size="small" variant="tonal" color="info" prepend-icon="mdi-account-multiple-outline" @click="showResults(p)">{{ t('papers.results') }}</v-btn>
              <v-btn size="small" variant="tonal" color="error" icon="mdi-delete-outline" :aria-label="t('papers.delete')" :data-tip="t('papers.delete')" @click="deleteTarget = p" />
            </template>
          </div>
        </div>
      </div>
    </div>
  </v-container>

  <PaperMaker v-model="makerOpen" @created="load" />

  <ConfirmDialog
    :model-value="!!deleteTarget"
    danger
    icon="mdi-delete-outline"
    confirm-icon="mdi-delete-outline"
    cancel-icon="mdi-close"
    :title="t('papers.delete')"
    :message="t('papers.deleteAsk')"
    :confirm-label="t('test.deleteBtn')"
    :cancel-label="t('test.cancel')"
    @confirm="remove"
    @cancel="deleteTarget = null"
  />

  <!-- admin: everybody's attempts at one paper -->
  <v-bottom-sheet v-model="resultsOpen" scrollable>
    <v-card class="sheet paperssheet" rounded="t-xl">
      <div class="grip" />
      <div class="pa-4 pt-1 sbody">
        <div v-if="resultsOf" class="head font-weight-bold">{{ t('papers.resultsTitle', { title: resultsOf.title }) }}</div>
        <v-progress-linear v-if="resultsLoading" indeterminate color="primary" class="my-2" />
        <v-alert v-if="resultsFailed" type="error" variant="tonal" density="compact" class="my-2">{{ t('papers.error') }}</v-alert>
        <div v-else-if="!resultsLoading && results.length === 0" class="text-body-2 text-medium-emphasis my-3">{{ t('papers.noResults') }}</div>
        <div v-for="u in perUser" :key="u.userId" class="urow">
          <span class="uname">{{ u.userId }}</span>
          <span class="text-caption text-medium-emphasis">{{ t('papers.attempts', { n: u.attempts }) }}</span>
          <span class="uscore" :class="{ perfect: u.best === (resultsOf?.total ?? -1) }">{{ u.best === null ? '–' : `${u.best}/${resultsOf?.total ?? ''}` }}</span>
        </div>
        <div v-if="results.length" class="text-caption text-medium-emphasis mt-3 mb-1">{{ t('test.history') }}</div>
        <div v-for="r in results" :key="r.sessionId" class="arow">
          <span class="uname">{{ r.userId }}</span>
          <span class="text-caption text-medium-emphasis">{{ when(r.at) }}</span>
          <span class="uscore">{{ r.correct }}/{{ r.answered }}<span v-if="r.status === 'open'" class="text-caption text-medium-emphasis"> ({{ t('papers.notDone') }})</span></span>
        </div>
        <div class="actions">
          <v-btn variant="tonal" color="info" prepend-icon="mdi-close" @click="resultsOpen = false">{{ t('test.close') }}</v-btn>
        </div>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style>
/* --forest is a dark green: fine on the light page, nearly invisible on the dark one, so the dark theme uses the leaf green.
   Not scoped on purpose (the dark class sits on an ancestor); the .paperspage prefix keeps it to this page. */
.v-theme--dark .paperspage .kindline,
.v-theme--dark .paperspage .mine,
.v-theme--dark .paperspage .doneline,
.v-theme--dark .paperssheet .uscore {
  color: var(--leaf);
}
.v-theme--dark .paperspage .doneline.perfect {
  color: rgb(var(--v-theme-primary));
}
</style>

<style scoped>
/* the cards look like those of the list of tests (TestHistoryView) */
.histpage {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-inline: 12px;
  padding-top: 4px;
  padding-bottom: 16px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: 8px;
  align-items: stretch;
}
.empty {
  padding: 32px 8px;
  text-align: center;
  color: var(--jp); /* the main text colour: the grey of text-medium-emphasis is hard to read on the dark page */
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 2px solid transparent;
  text-align: start;
  color: inherit;
  transition: border-color 0.15s;
}
@media (hover: hover) and (pointer: fine) {
  .row:hover {
    border-color: color-mix(in srgb, rgb(var(--v-theme-primary)) 55%, transparent); /* same hover as a deck card */
  }
}
.info {
  flex: 1;
  min-width: 0;
}
.row:not(.open) {
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 9%, var(--paper)); /* taken at least once: a little greener, like a finished test */
}
.row.open {
  border-left: 4px solid #ef8a17; /* not taken yet: the orange of an unfinished test */
}
.kindline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: var(--forest);
}
.openline {
  color: #b8600f;
}
.doneline {
  color: var(--forest);
}
.doneline.perfect {
  color: rgb(var(--v-theme-primary));
}
.decktop {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.decktop .deck {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.decktop .scoreline {
  font-size: inherit;
  font-weight: 700;
  line-height: inherit;
  flex: 0 0 auto;
  margin-left: auto;
  text-align: right;
}
.srcline {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mine {
  color: var(--forest);
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.sheet {
  background: var(--paper);
  max-height: 90dvh;
}
.sbody {
  overflow-y: auto;
}
.grip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 4px;
}
.head {
  margin-bottom: 6px;
}
.urow,
.arow {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--paper-edge);
}
.uname {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
}
.uscore {
  font-weight: 700;
  color: var(--forest);
}
.uscore.perfect {
  color: rgb(var(--v-theme-primary));
}
.actions {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}
</style>
