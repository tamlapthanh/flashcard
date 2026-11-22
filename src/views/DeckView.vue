<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../api';
import { auth } from '../auth';
import { t } from '../i18n';
import TagChips from '../components/TagChips.vue';
import TopBar from '../components/TopBar.vue';
import WordListSheet from '../components/WordListSheet.vue';
import { clearDetails, ensureDetails } from '../lib/cardDetail';
import { tileMark } from '../lib/deckMark';
import { StudySession } from '../session';
import { settings } from '../settings';
import { setActiveSession } from '../store';
import type { Deck, StudyStatus } from '../types';

/*
 * The deck screen: tapping a deck studies it at once (with the status filter above and the tags remembered for THAT deck).
 * Tags are chosen from the tag button of a deck (a sheet with its own Start button), so each deck keeps its own tags.
 */
const router = useRouter();

const decks = ref<Deck[]>([]);
const loading = ref(true);
const waking = ref(false);
const error = ref('');
const startingId = ref<string | null>(null); // the deck being loaded (its card shows a spinner; nothing else can be started meanwhile)
const filterOpen = ref(false);

const statuses = ref<StudyStatus[]>(['new', 'learning']);
const tagsByDeck = ref<Record<string, string[]>>({}); // deck id -> the tags chosen for it (each deck keeps its own)
const lastDeckId = ref<string | null>(null); // the deck studied last (the study screen without a run shows it)

const statusLabel = (s: StudyStatus): string => t(`status.${s}`);
const STATUS_ORDER: StudyStatus[] = ['new', 'learning', 'learned', 'skipped'];
const STATUS_ICON: Record<StudyStatus, string> = {
  new: 'mdi-star-four-points-outline',
  learning: 'mdi-progress-clock',
  learned: 'mdi-check-circle-outline',
  skipped: 'mdi-pause-circle-outline'
};

const tagsOf = (d: Deck): string[] => tagsByDeck.value[d.id] ?? [];

/* What studying a deck will load: the cards of the status filter; with tags, at most the cards that carry them (an upper bound, tags may overlap). */
function countFor(d: Deck, tags: string[]): number {
  const eligible = statuses.value.reduce((n, s) => n + d.counts[s], 0);
  if (tags.length === 0) return eligible;
  const tagged = d.tags.filter((tg) => tags.includes(tg.tag)).reduce((n, tg) => n + tg.count, 0);
  return Math.min(eligible, tagged);
}

/* Tapping a deck's tile opens the word list of that whole deck (every card, whatever its status), like the list button of the study screen. */
const listSession = shallowRef<StudySession | null>(null);
const listOpen = ref(false);
const listLoadingId = ref<string | null>(null);
async function openList(d: Deck): Promise<void> {
  if (listLoadingId.value) return;
  listLoadingId.value = d.id;
  error.value = '';
  try {
    const { cards } = await api.cards({ deck: d.id, tags: [], status: STATUS_ORDER });
    const list = new StudySession(cards, { reverse: false, showReading: settings.showReading, deckName: d.name });
    for (const c of cards) {
      if (c.progress.status === 'learned') list.learnedIds.add(c.id);
      else if (c.progress.status === 'skipped') list.skippedIds.add(c.id);
    }
    listSession.value = list;
    listOpen.value = true;
  } catch {
    error.value = t('err.load');
  } finally {
    listLoadingId.value = null;
  }
}

const learnedPercent = (d: Deck): number => (d.total ? Math.round((100 * d.counts.learned) / d.total) : 0);

/* One-line summary of the filter, shown on the main screen. */
const filterSummary = computed(() => {
  return [statuses.value.map((s) => statusLabel(s)).join(' + ') || t('filter.allStatus')];
});

/* The tag sheet of one deck. */
const tagOpen = ref(false);
const tagDeckId = ref<string | null>(null);
const tagDeck = computed(() => decks.value.find((d) => d.id === tagDeckId.value) ?? null);
const sheetTags = computed<string[]>({
  get: () => (tagDeck.value ? tagsOf(tagDeck.value) : []),
  set: (value) => {
    if (tagDeck.value) tagsByDeck.value = { ...tagsByDeck.value, [tagDeck.value.id]: value };
  }
});
function openTags(d: Deck): void {
  tagDeckId.value = d.id;
  tagOpen.value = true;
}

/* The choices (status filter, the tags of every deck, the deck studied last) are remembered on this device, per user. The key and its \`deckId\` are
   also read by the study screen. An older value (one deck, one list of tags) is read too. */
const PICK_KEY = (): string => `flashmobile.deckPick.${auth.user ?? ''}`;
let restored = false; // nothing is saved before the remembered choices have been put back
function savePick(): void {
  if (!restored) return;
  try {
    localStorage.setItem(PICK_KEY(), JSON.stringify({ deckId: lastDeckId.value, statuses: statuses.value, tagsByDeck: tagsByDeck.value }));
  } catch {
    /* storage unavailable: the choices are simply not remembered */
  }
}
function restorePick(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(PICK_KEY()) ?? 'null') as { deckId?: unknown; tags?: unknown; tagsByDeck?: unknown; statuses?: unknown } | null;
    if (!saved) return;
    const onlyKnown = (d: Deck, list: unknown): string[] => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && d.tags.some((tg) => tg.tag === x)) : []);
    const restoredTags: Record<string, string[]> = {};
    const stored = saved.tagsByDeck && typeof saved.tagsByDeck === 'object' ? (saved.tagsByDeck as Record<string, unknown>) : null;
    for (const d of decks.value) {
      const list = onlyKnown(d, stored ? stored[d.id] : d.id === saved.deckId ? saved.tags : []); // an older value: the tags belong to its one deck
      if (list.length) restoredTags[d.id] = list;
    }
    tagsByDeck.value = restoredTags;
    if (decks.value.some((d) => d.id === saved.deckId)) lastDeckId.value = saved.deckId as string;
    if (Array.isArray(saved.statuses)) {
      const ok = saved.statuses.filter((x): x is StudyStatus => STATUS_ORDER.includes(x as StudyStatus));
      if (ok.length) statuses.value = ok;
    }
  } catch {
    /* a damaged value is ignored */
  }
}

watch([statuses, tagsByDeck, lastDeckId], savePick, { deep: true });

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  // A free server sleeps: if it does not answer quickly, tell the user it is waking up instead of looking frozen.
  const wakeTimer = setTimeout(() => (waking.value = true), 2500);
  try {
    decks.value = await api.decks();
    restorePick();
    restored = true;
    savePick();
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 401 ? t('err.key') : t('err.conn');
  } finally {
    clearTimeout(wakeTimer);
    waking.value = false;
    loading.value = false;
  }
}

/* Studies a deck now: its cards of the status filter and of the tags remembered for it. */
async function startDeck(d: Deck): Promise<void> {
  if (startingId.value) return;
  startingId.value = d.id;
  error.value = '';
  const tags = [...tagsOf(d)];
  try {
    const { cards } = await api.cards({ deck: d.id, tags, status: statuses.value });
    lastDeckId.value = d.id;
    if (cards.length === 0) {
      // nothing left to study (an empty deck, or every word already learned): the "Deck finished" screen, from the deck's saved progress
      setActiveSession(null);
      await router.push({ path: '/study', query: { finished: d.id } });
      return;
    }
    clearDetails();
    await ensureDetails(cards.slice(0, 7).map((c) => c.id)); // the first cards are complete when the study screen opens
    setActiveSession(new StudySession(cards, { reverse: settings.direction === 'reverse', showReading: settings.showReading, deckName: d.name, tags }));
    await router.push('/study');
  } catch {
    error.value = t('err.load');
  } finally {
    startingId.value = null;
  }
}

/* The Start button of the tag sheet. */
function startFromSheet(): void {
  const d = tagDeck.value;
  if (!d) return;
  tagOpen.value = false;
  void startDeck(d);
}

onMounted(load);
</script>

<template>
  <TopBar title="単語帳" />

  <v-container fluid class="deckpage">
    <v-alert v-if="waking" type="info" variant="tonal" icon="mdi-power-sleep" class="mb-3">{{ t('deck.waking') }}</v-alert>
    <v-alert v-if="error" type="error" variant="tonal" icon="mdi-alert-circle-outline" class="mb-3">
      {{ error }}
      <template #append><v-btn variant="tonal" size="small" :data-tip="t('tip.retry')" @click="load">{{ t('deck.retry') }}</v-btn></template>
    </v-alert>
    <v-progress-linear v-if="loading" indeterminate class="mb-3" color="primary" />

    <template v-if="decks.length">
      <button type="button" class="paper-card filter" :data-tip="t('tip.filter')" @click="filterOpen = true">
        <v-icon icon="mdi-filter-variant" class="mr-3" color="primary" />
        <div class="d-flex flex-wrap ga-1 flex-grow-1">
          <v-chip v-for="(p, i) in filterSummary" :key="i" size="small" variant="tonal">{{ p }}</v-chip>
        </div>
        <v-icon icon="mdi-chevron-right" />
      </button>

      <!-- a deck card: tapping anywhere on it studies the deck (the invisible button covers the card); the tile and the tag button sit above it -->
      <div class="decks">
        <div v-for="d in decks" :key="d.id" class="paper-card deck" :class="{ busy: startingId === d.id }">
          <button type="button" class="deckhit" :disabled="!!startingId" :aria-label="`${d.name}. ${t('deck.count', { total: d.total, fresh: d.counts.new })}`" :data-tip="t('tip.deck')" @click="startDeck(d)" />
          <div class="d-flex align-center ga-3">
            <div class="deck-tile jp" :class="{ two: tileMark(d.name).length > 1, busy: listLoadingId === d.id }" role="button" tabindex="0" :aria-label="t('list.open')" :data-tip="t('list.open')" @click.stop="openList(d)" @keydown.enter.self.prevent="openList(d)" @keydown.space.self.prevent="openList(d)">
              {{ tileMark(d.name) }}<span class="tilelist" aria-hidden="true"><v-icon icon="mdi-format-list-bulleted" size="11" /></span>
            </div>
            <div class="flex-grow-1 text-start deckinfo">
              <div class="text-subtitle-1 font-weight-medium">{{ d.name }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('deck.count', { total: d.total, fresh: d.counts.new }) }}</div>
              <!-- the tags chosen for this deck (the next tap studies exactly these): as many as fit on one line, the rest as "+N" -->
              <TagChips v-if="tagsOf(d).length" :tags="tagsOf(d)" class="mt-1" />
            </div>
            <button v-if="d.tags.length" type="button" class="tagbtn" :class="{ on: tagsOf(d).length }" :aria-label="t('deck.tagsOf', { name: d.name })" :data-tip="t('tip.tags')" @click.stop="openTags(d)">
              <v-icon icon="mdi-tag-outline" size="18" />
              <span v-if="tagsOf(d).length" class="tagn">{{ tagsOf(d).length }}</span>
            </button>
            <span class="play" aria-hidden="true">
              <v-progress-circular v-if="startingId === d.id" indeterminate size="18" width="2" color="white" />
              <v-icon v-else icon="mdi-play" size="20" />
            </span>
          </div>
          <v-progress-linear :model-value="learnedPercent(d)" height="4" rounded color="primary" bg-color="surface-variant" class="mt-3" />
        </div>
      </div>
    </template>
  </v-container>

  <!-- word list of a whole deck (opened from the tile of a deck); picking a word only closes it -->
  <WordListSheet v-if="listSession" :open="listOpen" :session="listSession" @close="listOpen = false" @pick="listOpen = false" />

  <!-- the tags of one deck: several can be chosen (each deck keeps its own); the button studies the deck with them -->
  <v-bottom-sheet v-model="tagOpen">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" />
      <div class="pa-4 pt-1">
        <div class="tagshead">
          <div class="label"><v-icon icon="mdi-tag-multiple-outline" size="14" />{{ t('filter.tags') }} · {{ tagDeck?.name }}</div>
          <v-btn v-if="sheetTags.length" size="x-small" variant="tonal" color="primary" :data-tip="t('tip.clearTags')" @click="sheetTags = []">{{ t('filter.clear', { n: sheetTags.length }) }}</v-btn>
        </div>
        <div class="tagscroll">
          <v-chip-group v-model="sheetTags" multiple filter column color="primary">
            <v-chip v-for="tg in tagDeck?.tags ?? []" :key="tg.tag" :value="tg.tag" size="small" variant="tonal">{{ tg.tag }} ({{ tg.count }})</v-chip>
          </v-chip-group>
        </div>
        <v-btn block color="primary" size="large" class="mt-3" prepend-icon="mdi-play" :loading="!!startingId" :data-tip="t('tip.start')" @click="startFromSheet">
          <span class="jp-start">始める</span>&nbsp;· {{ t('deck.start', { n: tagDeck ? countFor(tagDeck, sheetTags) : 0 }) }}
        </v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>

  <!-- filter sheet: status, for every deck (tags are chosen per deck, from its tag button; there is no limit on the number of cards) -->
  <v-bottom-sheet v-model="filterOpen">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" />
      <div class="pa-4 pt-1">
        <div class="label"><v-icon icon="mdi-progress-check" size="14" />{{ t('filter.status') }}</div>
        <v-chip-group v-model="statuses" multiple filter color="primary" class="mb-2">
          <v-chip v-for="s in STATUS_ORDER" :key="s" :value="s" size="small" :prepend-icon="STATUS_ICON[s]">{{ statusLabel(s) }} ({{ decks.reduce((n, d) => n + d.counts[s], 0) }})</v-chip>
        </v-chip-group>

        <v-btn block color="primary" class="mt-3" prepend-icon="mdi-check" :data-tip="t('tip.done')" @click="filterOpen = false">{{ t('filter.done') }}</v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
/* The filter line, then the decks. */
.deckpage {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-inline: 12px; /* the same side margin on every screen */
  padding-top: 4px; /* Vuetify container adds 16px; keep the first panel close to the top bar */
  padding-bottom: 16px;
}
.decks {
  display: flex;
  flex-direction: column;
  gap: 6px; /* same as .deckpage gap, so every panel is spaced evenly */
}
.tagshead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}
.tagscroll {
  max-height: 45dvh; /* many tags scroll inside the sheet */
  overflow-y: auto;
  padding-top: 0;
}
.tagscroll :deep(.v-chip-group) {
  padding-top: 0; /* Vuetify adds 4px above the chips */
}
.deck {
  position: relative;
  display: block;
  width: 100%;
  padding: 12px 14px;
  border: 2px solid transparent;
  text-align: start;
  color: inherit;
  transition: border-color 0.15s, transform 0.1s, opacity 0.15s;
}
/* the button that covers the whole card: a tap on the card studies the deck; the tile and the tag button are above it */
.deckhit {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}
.deckhit:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.deck:active:not(.busy) {
  transform: translateY(1px); /* pressed */
}
.deck.busy {
  opacity: 0.75; /* being loaded */
}
@media (hover: hover) and (pointer: fine) {
  .deck:hover {
    border-color: color-mix(in srgb, rgb(var(--v-theme-primary)) 55%, transparent); /* the mouse is over a card you can study */
  }
}
.deckinfo {
  min-width: 0;
}
.deck-tile,
.tagbtn {
  position: relative;
  z-index: 2; /* above the invisible button that covers the card */
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
  cursor: pointer;
}
.deck-tile.busy {
  opacity: 0.6;
}
.deck-tile.two {
  font-size: 1.1rem;
  letter-spacing: -0.02em;
}
/* a small list mark in the corner of the tile: it opens the word list of the deck */
.tilelist {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--paper);
  color: var(--forest);
  border: 1px solid var(--paper-edge);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tagbtn {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--paper-edge);
  background: var(--paper);
  color: var(--forest);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.3);
  transition: transform 0.1s, box-shadow 0.1s, background 0.12s;
}
.tagbtn.on {
  border-color: #ef8a17; /* tags are chosen for this deck */
}
.tagn {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #ef8a17;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}
.tagbtn:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 transparent;
}
@media (hover: hover) and (pointer: fine) {
  .tagbtn:hover {
    background: #d4f5c2; /* pale mint under the mouse, like the round buttons of the card */
    transform: translateY(1px);
    box-shadow: 0 1px 0 rgba(31, 77, 36, 0.3);
  }
}
.play {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 0 #3f8a1f;
}
.filter {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  text-align: start;
  color: inherit;
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
