<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, me } from '../api';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { ANY_DECK, drawFrom, drawOther, loadPool, pickKey, wordsWithPicks } from '../lib/paper';
import { newId } from '../lib/paperStart';
import { ALL_KINDS, MAX_QUESTIONS, modeOf, type QuizKind, type QuizQuestion } from '../lib/quiz';
import type { Deck, LightCard } from '../types';

/*
 * Admin: make a test (a paper) for everybody, on one page in three steps: 1 what it is drawn from (name, decks, lessons = tags), 2 how many
 * questions of which kinds, 3 a look at the questions that were drawn (draw again as often as wanted) and publish. The paper keeps these exact
 * questions and options, so every user takes the same test. The server refuses anybody who is not an admin (403).
 */
const router = useRouter();

const MAX_TITLE = 125; // the longest name of a test (the server refuses more)
const ALL = 0; // the value of the "All" choice
const COUNTS = [10, 20, 30, 50, ALL];

const decks = ref<Deck[]>([]);
const decksLoading = ref(true);
const decksFailed = ref(false);
const title = ref('');
const deckIds = ref<string[]>([]); // the decks drawn on; all of them once they are loaded
/* Every deck is chosen: the words come from the whole collection (the "All" chip is lit). */
const anyDeck = computed(() => decks.value.length > 0 && decks.value.every((d) => deckIds.value.includes(d.id)));
/* The chips: "All" first, then the decks. Tapping "All" picks every deck, or clears them when they were all picked; tapping a deck toggles it. */
const deckChips = computed<string[]>({
  get: () => (anyDeck.value ? ['all', ...deckIds.value] : deckIds.value),
  set: (v) => {
    const wasAll = anyDeck.value;
    const picked = decks.value.map((d) => d.id).filter((id) => v.includes(id));
    if (v.includes('all') && !wasAll) deckIds.value = decks.value.map((d) => d.id);
    else if (!v.includes('all') && wasAll && picked.length === decks.value.length) deckIds.value = [];
    else deckIds.value = picked;
  }
});
const picks = ref<string[]>([]); // the lessons picked, each as pickKey(deck, tag)
const count = ref(20);
const kinds = ref<QuizKind[]>([...ALL_KINDS]); // any choice of the three kinds; "All" stands for the three

/* The chips: "All" first, then the three kinds. Tapping "All" picks the three; tapping a kind toggles it, and at least one stays picked. */
const allKinds = computed(() => ALL_KINDS.every((k) => kinds.value.includes(k)));
const kindChips = computed<string[]>({
  get: () => (allKinds.value ? ['all', ...kinds.value] : kinds.value),
  set: (v) => {
    const picked = ALL_KINDS.filter((k) => v.includes(k));
    if (v.includes('all') && !allKinds.value) kinds.value = [...ALL_KINDS];
    else if (picked.length > 0) kinds.value = picked;
  }
});

const building = ref(false);
const failed = ref<'load' | 'save' | 'needs' | null>(null);
const pool = ref<LightCard[]>([]);
const questions = ref<QuizQuestion[]>([]);
const drawn = ref(false); // questions have been drawn at least once: step 3 shows
const matching = ref(0);
const saving = ref(false);

/* The decks the paper draws on, and the tags those decks have. */
const chosenDecks = computed(() => decks.value.filter((d) => deckIds.value.includes(d.id)));
const tagGroups = computed(() =>
  chosenDecks.value
    .map((d) => ({ deck: d, tags: [...d.tags].sort((x, y) => x.tag.localeCompare(y.tag, 'ja', { numeric: true })) }))
    .filter((g) => g.tags.length > 0)
);
const togglePick = (key: string): void => {
  picks.value = picks.value.includes(key) ? picks.value.filter((k) => k !== key) : [...picks.value, key];
};
/* A name made from what is chosen, so nobody has to type one: "All decks", or the decks, or each deck with the lessons picked in it. It follows the
   choice until the admin types a name of their own (emptying the field gives the made-up name back). */
const autoTitle = computed(() => {
  if (chosenDecks.value.length === 0) return '';
  const byDeck = chosenDecks.value
    .map((d) => ({ name: d.name, tags: d.tags.map((x) => x.tag).filter((tag) => picks.value.includes(pickKey(d.id, tag))) }))
    .filter((d) => d.tags.length > 0);
  const text = byDeck.length > 0 ? byDeck.map((d) => `${d.name}: ${d.tags.join(', ')}`).join(' · ') : anyDeck.value ? t('newpaper.autoAll') : chosenDecks.value.map((d) => d.name).join(', ');
  return text.length > MAX_TITLE ? text.slice(0, MAX_TITLE - 1) + '…' : text; // too long: cut and end with …
});
const titleOwn = ref(false); // the admin typed a name
watch(autoTitle, (s) => { if (!titleOwn.value) title.value = s; }, { immediate: true });
function onTitle(s: string): void {
  title.value = s;
  titleOwn.value = s.trim().length > 0;
  if (!titleOwn.value) title.value = autoTitle.value;
}

const canBuild = computed(() => title.value.trim().length > 0 && chosenDecks.value.length > 0);

watch(
  () => tagGroups.value.map((g) => g.deck.id).join('\n'),
  () => (picks.value = picks.value.filter((k) => chosenDecks.value.some((d) => k.startsWith(d.id + '\t')))) // the lessons of a deck that was unticked go with it
);
/* the choice changed after the questions were drawn: they are no longer what is asked for */
watch([title, deckIds, picks, count, kinds], () => {
  drawn.value = false;
  if (failed.value === 'needs') failed.value = null; // the choice changed: the complaint is stale
}, { deep: true });

async function loadDecks(): Promise<void> {
  decksLoading.value = true;
  decksFailed.value = false;
  try {
    decks.value = await api.decks();
    deckIds.value = decks.value.map((d) => d.id); // by default every deck
  } catch {
    decksFailed.value = true;
  } finally {
    decksLoading.value = false;
  }
}

function draw(): void {
  const n = count.value === ALL ? MAX_QUESTIONS : count.value;
  const words = wordsWithPicks(pool.value, picks.value);
  matching.value = words.length;
  questions.value = drawFrom(words, pool.value, n, kinds.value);
  swapFailed.value = null;
  drawn.value = true;
}

/* Swap one row for another word of the same kind (not one already in the test); the row stays where it is. */
const swapFailed = ref<number | null>(null); // the row that found no other word
function swap(i: number): void {
  const old = questions.value[i];
  if (!old) return;
  const taken = new Set(questions.value.map((q) => q.card.id));
  const fresh = drawOther(wordsWithPicks(pool.value, picks.value), pool.value, taken, old.kind);
  if (!fresh) {
    swapFailed.value = i;
    return;
  }
  swapFailed.value = null;
  questions.value = questions.value.map((q, k) => (k === i ? { ...fresh, n: old.n } : q));
}

/* Drop a question that is not wanted; the rest are numbered again. */
function removeRow(i: number): void {
  swapFailed.value = null;
  questions.value = questions.value.filter((_, k) => k !== i).map((q, k) => ({ ...q, n: k }));
}

async function build(): Promise<void> {
  if (building.value) return;
  if (!canBuild.value) {
    failed.value = 'needs'; // no name, or no deck: say so instead of leaving the button dead
    return;
  }
  building.value = true;
  failed.value = null;
  try {
    pool.value = await loadPool(anyDeck.value ? [ANY_DECK] : chosenDecks.value.map((d) => d.id));
    draw();
  } catch {
    failed.value = 'load';
  } finally {
    building.value = false;
  }
}

async function publish(): Promise<void> {
  if (questions.value.length === 0 || saving.value) return;
  saving.value = true;
  failed.value = null;
  const paperId = newId();
  try {
    await api.createPaper({
      paperId,
      title: title.value.trim(),
      // a deck is a source with the lessons picked in it; once any lesson is picked, a deck with none is not a source
      sources: chosenDecks.value
        .map((d) => ({ deckId: d.id, tags: d.tags.map((x) => x.tag).filter((tag) => picks.value.includes(pickKey(d.id, tag))) }))
        .filter((s) => picks.value.length === 0 || s.tags.length > 0),
      mode: modeOf(kinds.value),
      questions: questions.value.map((q) => ({ wordId: q.card.id, kind: q.kind, options: q.options.map((o) => o.id) }))
    });
    await router.replace('/tests'); // back to the Tests screen: the new test shows under "Assigned tests"
  } catch {
    failed.value = 'save';
  } finally {
    saving.value = false;
  }
}

const kindIcon = (kind: string): string => (kind === 'listen' ? 'mdi-volume-high' : kind === 'reading' ? 'mdi-syllabary-hiragana' : 'mdi-translate');

onMounted(() => void loadDecks());
</script>

<template>
  <TopBar :title="t('nav.tests')">
    <template v-if="me.admin">
      <v-btn variant="flat" color="primary" prepend-icon="mdi-dice-multiple-outline" class="act3d act3d-blue barbtn mr-2" :loading="building" :aria-label="t('maker.build')" :data-tip="t('maker.build')" @click="build"><span class="lbl">{{ t('maker.build') }}</span></v-btn>
      <v-btn variant="flat" color="primary" prepend-icon="mdi-close" class="act3d act3d-red barbtn mr-2" :disabled="building" :aria-label="t('newpaper.cancel')" :data-tip="t('newpaper.cancel')" @click="router.replace('/tests')"><span class="lbl">{{ t('newpaper.cancel') }}</span></v-btn>
    </template>
  </TopBar>

  <v-container fluid class="newpage">
    <div class="wrap">
      <v-alert v-if="!me.admin" type="info" variant="tonal" density="compact" icon="mdi-lock-outline">{{ t('results.adminOnly') }}</v-alert>

      <template v-else>
        <v-alert v-if="failed" type="error" variant="tonal" density="compact">{{ failed === 'needs' ? t('newpaper.needs') : failed === 'save' ? t('maker.error') : t('maker.loadError') }}</v-alert>

        <!-- the short steps share one row when there is room -->
        <div class="toprow">
        <!-- 1. name -->
        <section class="step">
          <div class="shead"><span class="num n1">1</span>{{ t('newpaper.step1') }}</div>
          <v-text-field :model-value="title" @update:model-value="onTitle" :label="t('maker.name')" density="compact" variant="outlined" hide-details :maxlength="MAX_TITLE" />
        </section>

        <!-- 3. how many -->
        <section class="step">
          <div class="shead"><span class="num n3">2</span>{{ t('newpaper.step3') }}</div>
          <v-chip-group v-model="count" mandatory filter color="primary">
            <v-chip v-for="n in COUNTS" :key="n" :value="n" size="small">{{ n === ALL ? t('test.countAll') : n }}</v-chip>
          </v-chip-group>
        </section>

        <!-- 4. question type -->
        <section class="step">
          <div class="shead"><span class="num n4">3</span>{{ t('newpaper.step4') }}</div>
          <v-chip-group v-model="kindChips" multiple filter column color="primary">
            <v-chip value="all" size="small">{{ t('test.kindMixed') }}</v-chip>
            <v-chip value="meaning" size="small" prepend-icon="mdi-translate">{{ t('test.kindMeaning') }}</v-chip>
            <v-chip value="listen" size="small" prepend-icon="mdi-volume-high">{{ t('test.kindListen') }}</v-chip>
            <v-chip value="reading" size="small" prepend-icon="mdi-syllabary-hiragana">{{ t('test.kindReading') }}</v-chip>
          </v-chip-group>
        </section>
        </div>

        <!-- 2. decks and lessons (tags): takes the height the screen has left, the lessons scroll inside it -->
        <section class="step deckstep">
          <div class="shead"><span class="num n2">4</span>{{ t('newpaper.step2') }}</div>
          <v-progress-linear v-if="decksLoading" indeterminate color="primary" class="mb-2" />
          <v-alert v-if="decksFailed" type="error" variant="tonal" density="compact" class="mb-2">
            {{ t('maker.loadError') }}
            <template #append><v-btn size="small" variant="tonal" @click="loadDecks">{{ t('deck.retry') }}</v-btn></template>
          </v-alert>
          <v-chip-group v-else v-model="deckChips" multiple filter column color="primary" class="mb-3">
            <v-chip value="all" size="small">{{ t('test.kindMixed') }}</v-chip>
            <v-chip v-for="d in decks" :key="d.id" :value="d.id" size="small" class="jp">{{ d.name }}</v-chip>
          </v-chip-group>

          <div v-if="tagGroups.length === 0" class="text-caption hint mb-1">{{ t('test.noTags') }}</div>
          <template v-else>
            <div class="tagbox">
              <div v-for="g in tagGroups" :key="g.deck.id" class="taggroup">
                <div class="tagdeck jp"><v-icon icon="mdi-tag-multiple-outline" size="16" />{{ g.deck.name }} (tag)</div>
                <div class="tagchips">
                  <v-chip
                    v-for="x in g.tags"
                    :key="x.tag"
                    size="small"
                    :color="picks.includes(pickKey(g.deck.id, x.tag)) ? 'primary' : undefined"
                    :prepend-icon="picks.includes(pickKey(g.deck.id, x.tag)) ? 'mdi-check' : undefined"
                    @click="togglePick(pickKey(g.deck.id, x.tag))"
                  >{{ x.tag }} ({{ x.count }})</v-chip>
                </div>
              </div>
            </div>
          </template>
        </section>

        <!-- 5. the drawn questions in a popup: a look, then publish (or draw again) -->
        <v-bottom-sheet :model-value="drawn" max-width="100%" scrollable @update:model-value="(o: boolean) => { if (!o && !saving) drawn = false; }">
          <v-card class="previewdlg tsheet" rounded="t-xl">
            <div class="tgrip" />
            <v-card-title class="shead pt-1"><span class="num n5">5</span>{{ t('newpaper.step5') }}</v-card-title>
            <v-card-text>
            <v-alert v-if="failed === 'save'" type="error" variant="tonal" density="compact" class="mb-2">{{ t('maker.error') }}</v-alert>
            <div v-if="questions.length === 0" class="text-body-2 my-2">{{ t('maker.none') }}</div>
            <div v-else class="text-caption hint mb-1">{{ t('maker.preview', { n: questions.length, m: matching }) }}</div>
            <div class="qlist">
              <div v-for="q in questions" :key="q.n" class="qrow" :class="'k-' + q.kind">
                <span class="qn">{{ q.n + 1 }}</span>
                <v-icon :icon="kindIcon(q.kind)" size="16" class="qicon" />
                <span class="jp qword">{{ q.card.headword }}</span>
                <span class="jp qread">{{ q.card.reading && q.card.reading !== q.card.headword ? q.card.reading : '' }}</span>
                <span class="qinfo">
                  <span class="qhv">{{ q.card.hanviet }}</span>
                  <span class="qmean text-caption hint">{{ q.card.meaning.split('\n')[0] }}<em v-if="swapFailed === q.n" class="nomore"> · {{ t('maker.swapNone') }}</em></span>
                </span>
                <v-btn size="x-small" variant="flat" color="primary" class="act3d act3d-purple swapbtn" icon="mdi-shuffle-variant" :disabled="saving" :aria-label="t('maker.swap')" :data-tip="t('maker.swap')" @click="swap(q.n)" />
                <v-btn size="x-small" variant="flat" color="primary" class="act3d act3d-red delrow" icon="mdi-close" :disabled="saving" :aria-label="t('maker.removeRow')" :data-tip="t('maker.removeRow')" @click="removeRow(q.n)" />
              </div>
            </div>
            </v-card-text>
            <v-card-actions class="previewact">
              <v-btn variant="flat" color="primary" prepend-icon="mdi-publish" class="act3d act3d-green" :loading="saving" :disabled="questions.length === 0" @click="publish">{{ t('maker.publish') }}</v-btn>
              <v-btn variant="flat" color="primary" prepend-icon="mdi-close" class="act3d act3d-red" :disabled="saving" @click="drawn = false">{{ t('newpaper.cancel') }}</v-btn>
            </v-card-actions>
          </v-card>
        </v-bottom-sheet>
      </template>
    </div>
  </v-container>
</template>

<style>
/* --forest is a dark green: fine on the light page, nearly invisible on the dark one, so the dark theme uses the leaf green */
/* the popup is outside the page: Vuetify right-aligns the card buttons, they go on the left */
.previewdlg .v-card-actions.previewact {
  justify-content: flex-start !important; /* Vuetify's own rule for the card buttons is stronger */
}
.v-theme--dark .newpage .hint,
.v-theme--dark .previewdlg .hint,
.v-theme--dark .previewdlg .qn,
.v-theme--dark .previewdlg .qicon,
.v-theme--dark .newpage .qn,
.v-theme--dark .newpage .qicon {
  color: var(--leaf);
}
</style>

<style scoped>
.newpage {
  --gap: 12px; /* the same space between the cards and between the cards and every edge of the screen */
  width: 100%;
  padding: var(--gap);
}
.wrap {
  width: 100%;
  /* as tall as what is left of the screen below the bar: the lessons box (step 2) stretches or shrinks with it. On a short screen the
     steps keep their own height and the page scrolls. */
  min-height: calc(100dvh - var(--v-layout-top, 48px) - 2 * var(--gap));
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}
.wrap > * {
  min-width: 0;
  flex: 0 0 auto;
}
.deckstep {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 260px;
}
.toprow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
}
/* side by side while there is room, else one under the other; the name and the count stay small, the question type (the longest chips) takes the rest */
.toprow > .step {
  flex: 1 1 240px;
}
.toprow > .step:nth-child(2) {
  flex: 0 0 auto;
  min-width: 290px;
}
.toprow > .step:nth-child(3) {
  flex: 3 1 420px;
}
.step {
  background: var(--paper);
  border-radius: 16px;
  padding: 16px 18px 18px;
}
.shead {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-weight: 700;
}
.num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: #fff;
}
.n1 { background: #3e9f2f; }
.n2 { background: #1e88e5; }
.n3 { background: #ef8a17; }
.n4 { background: #8e4ec6; }
.n5 { background: #3e9f2f; }
.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--sc);
}
.s-deck { --sc: #3e9f2f; }
.s-tags { --sc: #ef8a17; }
.s-count { --sc: #1e88e5; }
.s-kind { --sc: #8e4ec6; }
.hint {
  color: var(--forest);
}
.taggroup {
  margin-bottom: 8px;
}
.tagdeck {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 4px;
  color: var(--headword);
}
.tagchips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tagbox {
  flex: 1 1 0;
  min-height: 120px;
  overflow-y: auto;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
/* the buttons stay under the scrolling list */
.previewact {
  gap: 8px;
  padding: 12px 16px 16px;
  justify-content: flex-start;
  border-top: 1px solid var(--paper-edge);
}
/* the same sheet that slides up from the bottom as the Test button of a deck */
.tsheet {
  background: var(--paper);
}
.tgrip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 4px;
}
.qlist {
  margin-bottom: 8px; /* the popup body scrolls */
}
/* the same kind of question, the same background */
.qrow.k-meaning {
  background: color-mix(in srgb, #1e88e5 14%, transparent);
}
.qrow.k-listen {
  background: color-mix(in srgb, #ef8a17 16%, transparent);
}
.qrow.k-reading {
  background: color-mix(in srgb, #8e4ec6 14%, transparent);
}
/* the rows are a grid with the same columns in every row: number, kind, word, reading, sino-Vietnamese, meaning, then the two buttons */
.qrow {
  display: grid;
  grid-template-columns: 28px 20px 150px 160px 150px minmax(0, 1fr) 28px 28px;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  margin-bottom: 4px;
  border-radius: 8px;
}
.qinfo {
  display: contents; /* its two spans are cells of the row */
}
.qn {
  font-size: 0.72rem;
  font-weight: 700;
  text-align: right;
  color: var(--forest);
}
.qicon {
  color: var(--forest);
}
.qword,
.qread,
.qhv,
.qmean {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qword {
  font-weight: 700;
  color: var(--headword);
}
.qread {
  font-size: 0.9rem;
  color: var(--jp);
}
.qhv {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #b8600f; /* the orange of the sino-Vietnamese line elsewhere */
}
.v-theme--dark .previewdlg .qhv {
  color: #f7a94d;
}
.nomore {
  font-style: normal;
  font-weight: 700;
}
/* a phone: two lines per question. Number, kind, word, reading and the buttons on the first; sino-Vietnamese and meaning under the word */
@media (max-width: 720px) {
  .qrow {
    grid-template-columns: 24px 18px auto minmax(0, 1fr) 28px 28px;
    row-gap: 2px;
  }
  .qinfo {
    display: block;
    grid-column: 3 / -1;
    grid-row: 2;
    min-width: 0;
  }
  .swapbtn {
    grid-column: 5;
    grid-row: 1;
  }
  .delrow {
    grid-column: 6;
    grid-row: 1;
  }
  .qinfo .qhv {
    display: block;
  }
  .qinfo .qmean {
    display: block;
  }
}
/* a phone: the bar holds only icons for the two buttons, so they and the title fit */
@media (max-width: 560px) {
  .barbtn .lbl {
    display: none;
  }
  .barbtn.v-btn {
    min-width: 40px;
    padding: 0 8px;
  }
  .barbtn :deep(.v-btn__prepend) {
    margin-inline: 0;
  }
}
</style>
