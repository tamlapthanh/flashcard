<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../api';
import { auth } from '../auth';
import { t } from '../i18n';
import TagChips from '../components/TagChips.vue';
import TestSheet from '../components/TestSheet.vue';
import TopBar from '../components/TopBar.vue';
import RelatedDialog from '../components/RelatedDialog.vue';
import WordListSheet from '../components/WordListSheet.vue';
import { tileColor, tileMark } from '../lib/deckMark';
import { STATUS_ICON, STATUS_ORDER, statusStyle } from '../lib/status';
import { tagStyle } from '../lib/tagColor';
import { StudySession } from '../session';
import { settings } from '../settings';
import { pendingStart } from '../store';
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

const statuses = ref<StudyStatus[]>(['new', 'learning']);
const tagsByDeck = ref<Record<string, string[]>>({}); // deck id -> the tags chosen for it (each deck keeps its own)
const lastDeckId = ref<string | null>(null); // the deck studied last (the study screen without a run shows it)
/* Order on screen: the default deck (LCT) first, then the rest by name. The deck studied last does not move, so the list stays put. */
const nameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const shownDecks = computed(() => [...decks.value].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || nameOrder.compare(a.name, b.name)));

const statusLabel = (s: StudyStatus): string => t(`status.${s}`);

const tagsOf = (d: Deck): string[] => tagsByDeck.value[d.id] ?? [];
/** The statuses a deck has words in, with how many (none for an empty status). */
const statusParts = (d: Deck): { s: StudyStatus; n: number }[] => STATUS_ORDER.filter((s) => d.counts[s] > 0).map((s) => ({ s, n: d.counts[s] }));

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
/* A word picked in that list opens its dictionary popup on top of the list (the list stays open behind it). */
/* With a mouse the popup hangs under the clicked square; on a touch screen it is a sheet from the bottom. */
const wordPopup = shallowRef<{ id: string; headword: string; reading: string | null; meaning: string; anchor: HTMLElement | null } | null>(null);
function showWord(id: string, el?: HTMLElement): void {
  const c = listSession.value?.cards.find((x) => x.id === id);
  const mouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (c) wordPopup.value = { id: c.id, headword: c.headword, reading: c.reading ?? null, meaning: c.meaning, anchor: mouse && el ? el : null };
}
const listLoadingId = ref<string | null>(null);
const listCache = new Map<string, StudySession>(); // a list already built on this screen opens at once the next time (the screen is rebuilt after studying, so it is never stale)
async function openList(d: Deck): Promise<void> {
  if (listLoadingId.value) return;
  const cached = listCache.get(d.id);
  if (cached) {
    listSession.value = cached;
    listOpen.value = true;
    return;
  }
  listLoadingId.value = d.id;
  error.value = '';
  try {
    const { cards } = await api.cards({ deck: d.id, tags: [], status: STATUS_ORDER });
    const list = new StudySession(cards, { reverse: false, showReading: settings.showReading, deckName: d.name });
    for (const c of cards) {
      if (c.progress.status === 'learned') list.learnedIds.add(c.id);
      else if (c.progress.status === 'skipped') list.skippedIds.add(c.id);
    }
    listCache.set(d.id, list);
    listSession.value = list;
    listOpen.value = true;
  } catch {
    error.value = t('err.load');
  } finally {
    listLoadingId.value = null;
  }
}

const learnedPercent = (d: Deck): number => (d.total ? Math.round((100 * d.counts.learned) / d.total) : 0);

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

/* Studies a deck now: only says which one (with the status filter and the tags remembered for it) and opens the study screen at once;
   the cards are loaded there, behind a loading screen. */
function startDeck(d: Deck): void {
  lastDeckId.value = d.id;
  pendingStart.value = { deckId: d.id, deckName: d.name, tags: [...tagsOf(d)], statuses: [...statuses.value] };
  void router.push('/study');
}

/* The test sheet of one deck (TestSheet): the tags are the ones remembered for the deck. */
const testOpen = ref(false);
const testDeckId = ref<string | null>(null);
const testDeck = computed(() => decks.value.find((d) => d.id === testDeckId.value) ?? null);
function openTest(d: Deck): void {
  testDeckId.value = d.id;
  testOpen.value = true;
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
  <TopBar title="単語帳" back flush />

  <v-container fluid class="deckpage">
    <v-alert v-if="waking" type="info" variant="tonal" icon="mdi-power-sleep" class="mb-3">{{ t('deck.waking') }}</v-alert>
    <v-alert v-if="error" type="error" variant="tonal" icon="mdi-alert-circle-outline" class="mb-3">
      {{ error }}
      <template #append><v-btn variant="tonal" size="small" :data-tip="t('tip.retry')" @click="load">{{ t('deck.retry') }}</v-btn></template>
    </v-alert>
    <v-progress-linear v-if="loading" indeterminate class="mb-3" color="primary" />

    <template v-if="decks.length">
      <!-- the status filter, always in view: the four statuses are chips to tick right here (none ticked = every status); it applies to every deck -->
      <div class="paper-card filter" role="group" :aria-label="t('filter.status')">
        <v-icon icon="mdi-filter-variant" class="mr-3" color="primary" />
        <v-chip-group v-model="statuses" multiple column class="flex-grow-1 statusbar"> <!-- no tick icon: the fill and the strikethrough say on / off -->
          <v-chip v-for="s in STATUS_ORDER" :key="s" :value="s" size="small" class="stchip" :style="statusStyle(s)" :prepend-icon="STATUS_ICON[s]" :data-tip="t('tip.filter')">{{ statusLabel(s) }} ({{ decks.reduce((n, d) => n + d.counts[s], 0) }})</v-chip>
        </v-chip-group>
      </div>

      <!-- a deck card: tapping anywhere on it studies the deck (the invisible button covers the card); the tile and the tag button sit above it -->
      <div class="decks">
        <div v-for="d in shownDecks" :key="d.id" class="paper-card deck">
          <button type="button" class="deckhit" :aria-label="`${d.name}. ${t('deck.count', { total: d.total, fresh: d.counts.new })}${statusParts(d).filter((p) => p.s !== 'new').map((p) => ', ' + p.n + ' ' + statusLabel(p.s)).join('')}`" :data-tip="t('tip.deck')" @click="startDeck(d)" />
          <div class="d-flex align-center ga-3 deckrow">
            <div class="deck-tile jp" :style="{ background: tileColor(d.name) }" :class="{ two: tileMark(d.name).length > 1, busy: listLoadingId === d.id }" role="button" tabindex="0" :aria-label="t('list.open')" :data-tip="t('list.open')" @click.stop="openList(d)" @keydown.enter.self.prevent="openList(d)" @keydown.space.self.prevent="openList(d)">
              <v-progress-circular v-if="listLoadingId === d.id" indeterminate size="22" width="3" color="white" />
              <template v-else>{{ tileMark(d.name) }}</template><span class="tilelist" aria-hidden="true"><v-icon icon="mdi-format-list-bulleted" size="11" /></span>
            </div>
            <div class="flex-grow-1 text-start deckinfo">
              <div class="text-subtitle-1 font-weight-medium deckname">{{ d.name }}<v-icon v-if="d.isDefault" icon="mdi-star" size="14" color="warning" class="ml-1 defstar" :title="t('deck.default')" :aria-label="t('deck.default')" /></div>
              <!-- the total, then every status the deck has words in (its own colour and icon; the name shows from a tablet up) -->
              <div class="deckcount text-caption text-medium-emphasis" :class="{ hastags: tagsOf(d).length }">
                <span>{{ t('deck.total', { total: d.total }) }}</span>
                <span v-for="p in statusParts(d)" :key="p.s" class="stn" :style="statusStyle(p.s)" :title="statusLabel(p.s)"><v-icon :icon="STATUS_ICON[p.s]" size="13" />{{ p.n }}<span class="stl">{{ statusLabel(p.s) }}</span></span>
              </div>
              <!-- the tags chosen for this deck (the next tap studies exactly these): as many as fit on one line, the rest as "+N" -->
              <TagChips v-if="tagsOf(d).length" :tags="tagsOf(d)" class="mt-1 tagrow" />
              <!-- tags, test and play: in a row; on a phone they sit at the bottom right of the card -->
              <div class="deckbtns">
              <button v-if="d.tags.length" type="button" class="tagbtn tagc" :class="{ on: tagsOf(d).length }" :aria-label="t('deck.tagsOf', { name: d.name })" :data-tip="t('tip.tags')" @click.stop="openTags(d)">
                <v-icon icon="mdi-tag-outline" size="18" />
                <span v-if="tagsOf(d).length" class="tagn">{{ tagsOf(d).length }}</span>
              </button>
              <button v-if="d.total >= 4" type="button" class="tagbtn testc" :aria-label="t('tip.test')" :data-tip="t('tip.test')" @click.stop="openTest(d)">
                <v-icon icon="mdi-school-outline" size="18" />
              </button>
              <!-- the invisible button over the card already studies the deck (and is what a keyboard or a screen reader uses); this circle sits above it so it can react to the mouse, and does the same on a click -->
              <span class="play" aria-hidden="true" @click.stop="startDeck(d)">
                <v-icon icon="mdi-play" size="20" />
              </span>
              </div>
            </div>
          </div>
          <v-progress-linear :model-value="learnedPercent(d)" height="4" rounded color="primary" bg-color="surface-variant" class="mt-3 deckprog" />
        </div>
      </div>
    </template>
  </v-container>

  <!-- word list of a whole deck (opened from the tile of a deck); picking a word only closes it -->
  <WordListSheet v-if="listSession" :open="listOpen" :session="listSession" @close="listOpen = false" @pick="showWord" @dismiss="wordPopup = null" :popup-open="wordPopup !== null" kanji-grid />
  <RelatedDialog :headword="wordPopup?.headword ?? null" :reading="wordPopup?.reading ?? null" :fallback-meaning="wordPopup?.meaning ?? ''" :anchor="wordPopup?.anchor ?? null" :word-id="wordPopup?.id ?? null" @close="wordPopup = null" />

  <!-- the tags of one deck: several can be chosen (each deck keeps its own); the button studies the deck with them -->
  <v-bottom-sheet v-model="tagOpen" content-class="tagsheet-content">
    <v-card class="sheet tagsheet" rounded="t-xl">
      <div class="grip" />
      <div class="pa-4 pt-1 tagbody">
        <div class="tagshead">
          <div class="label"><v-icon icon="mdi-tag-multiple-outline" size="14" />{{ t('filter.tags') }} · {{ tagDeck?.name }}</div>
          <v-btn v-if="sheetTags.length" size="x-small" variant="tonal" color="primary" :data-tip="t('tip.clearTags')" @click="sheetTags = []">{{ t('filter.clear', { n: sheetTags.length }) }}</v-btn>
        </div>
        <div class="tagscroll">
          <v-chip-group v-model="sheetTags" multiple filter column color="primary">
            <v-chip v-for="tg in tagDeck?.tags ?? []" :key="tg.tag" :value="tg.tag" size="small" variant="tonal" class="tagtint" :style="tagStyle(tg.tag)">{{ tg.tag }} ({{ tg.count }})</v-chip>
          </v-chip-group>
        </div>
        <v-btn block color="primary" size="large" class="mt-3" prepend-icon="mdi-play" :data-tip="t('tip.start')" @click="startFromSheet">
          {{ t('deck.startBtn') }}&nbsp;· {{ t('deck.start', { n: tagDeck ? countFor(tagDeck, sheetTags) : 0 }) }}
        </v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>

  <!-- the test of one deck: number of questions and, if wanted, only the words of some statuses -->
  <TestSheet v-model="testOpen" :deck="testDeck" :tags="testDeck ? tagsOf(testDeck) : []" />
</template>

<style scoped>
/* The filter line, then the decks. */
.deckpage {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-inline: 6px; /* the same side margin on every screen (the same as the gap between two cards); the menu button lines up with it */
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
/* On a phone the tag sheet grows with its tags, up to 95% of the screen (Vuetify stops a bottom sheet at 70%); beyond that the tags scroll inside it. */
@media (max-width: 600px) {
  :global(.tagsheet-content) {
    max-height: 95dvh !important;
  }
  .tagsheet {
    display: flex;
    flex-direction: column;
    max-height: 95dvh;
  }
  .tagbody {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 auto;
  }
  .tagbody .tagscroll {
    max-height: none;
    flex: 1 1 auto;
    min-height: 0;
  }
}
.deck {
  background: #fff; /* white (dark mode keeps the paper colour, below) */
  position: relative;
  display: block;
  width: 100%;
  padding: 12px 14px;
  border: 2px solid transparent;
  border-radius: 18px; /* a little less round than the other paper cards (24px) */
  text-align: start;
  color: inherit;
  transition: border-color 0.15s, transform 0.1s, opacity 0.15s;
}
.v-theme--dark .deck,
.v-theme--dark .filter {
  background: var(--paper);
}
.filter {
  background: #fff; /* the status bar on top is white too */
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
/* name, counts and tags in the left column, the three buttons in the right one (centred on the card) */
.deckinfo {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 12px;
}
.deckinfo > :not(.deckbtns) {
  grid-column: 1;
}
.deckinfo > .deckbtns {
  grid-column: 2;
  grid-row: 1 / span 3;
  align-self: center;
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
  background: rgb(var(--v-theme-primary)); /* the green of the buttons (the same as the play button) */
  color: #fff !important;
  font-size: 1.35rem;
  flex-shrink: 0;
  cursor: pointer;
}
.deck-tile.busy {
  opacity: 0.85;
  pointer-events: none; /* a second tap while the list is loading does nothing */
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
  background: #7fd14a; /* the green of the tile, paler (a little deeper than the hover green so the white lines still read) */
  color: #fff; /* the lines of the list icon are white */
  border: 1.5px solid var(--paper); /* a ring in the card colour sets it off from the tile */
  display: flex;
  align-items: center;
  justify-content: center;
}
.deckbtns {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px; /* the same space as between the tile and the info */
}
/* On a phone the info becomes one wrapping line of items: name, counts, every tag chip and the three buttons (at the right).
   No tags: the buttons sit on the counts line. Tags: the counts take a line of their own and the buttons follow the last tag if it fits,
   or drop to a line of their own when the tags are too long. */
@media (max-width: 600px) {
  .deckpage {
    padding-inline: 6px; /* the cards (and the status filter) run almost to the edge of the screen: the same 6px as the gap between two cards */
  }
  /* the card ends right under the buttons: less padding below, and the learned bar becomes a thin line on the bottom edge (it adds no height) */
  .deck {
    padding-top: 7px;
    padding-bottom: 9px;
  }
  .deckprog {
    position: absolute !important;
    top: auto !important; /* Vuetify sets top: 0 by itself: without this the line jumps to the top edge */
    left: 16px;
    right: 16px;
    bottom: 2px;
    margin: 0 !important;
    width: auto !important;
    height: 3px !important;
  }
  .deckrow .deckinfo {
    flex: 1 1 0; /* the info takes what the tile leaves: it never pushes itself onto a line of its own */
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .deckname {
    flex: 0 0 100%;
  }
  .deckcount.hastags {
    flex: 0 0 100%;
  }
  .deckinfo :deep(.tc) {
    display: contents; /* the chips join the same wrapping line as the buttons */
  }
  .deckbtns {
    flex: 0 0 auto;
    margin-left: auto;
    position: relative;
    z-index: 2; /* above the invisible button that covers the card */
    gap: 10px;
  }
  .deckbtns .tagbtn,
  .deckbtns .play {
    width: 27px;
    height: 27px;
  }
  .deckbtns :deep(.v-icon) {
    font-size: 15px !important;
    width: 15px;
    height: 15px;
  }
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
/* each round button has its own colour: tags orange, test blue (the play button stays green) */
.tagbtn.tagc {
  --bc: #ef8a17;
}
.tagbtn.testc {
  --bc: #1e88e5;
}
.tagbtn.tagc,
.tagbtn.testc {
  color: var(--bc);
  border-color: color-mix(in srgb, var(--bc) 55%, var(--paper-edge));
  background: color-mix(in srgb, var(--bc) 10%, var(--paper));
  box-shadow: 0 2px 0 color-mix(in srgb, var(--bc) 45%, transparent);
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
  .tagbtn.tagc:hover,
  .tagbtn.testc:hover {
    background: color-mix(in srgb, var(--bc) 22%, var(--paper));
  }
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
  position: relative;
  z-index: 2; /* above the invisible button that covers the card */
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s, background 0.12s;
}
.play:active {
  box-shadow: 0 0 0 transparent; /* pressed in: the edge under it is gone and it moves down */
  transform: translateY(2px);
}
@media (hover: hover) and (pointer: fine) {
  .play:hover {
    background: #9be35f; /* lighter, like the Learned button of the study screen under the mouse */
    box-shadow: 0 1px 0 #3f8a1f;
    transform: translateY(1px);
  }
}
.filter {
  border-radius: 18px; /* the same as the deck cards */
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 14px;
  text-align: start;
  color: inherit;
}
.deckcount {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
}
.stn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--stc);
  font-weight: 600;
}
.stl {
  display: none; /* the status name: from a tablet up */
  margin-left: 3px;
  font-weight: 500;
}
@media (min-width: 601px) {
  .stl {
    display: inline;
  }
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
