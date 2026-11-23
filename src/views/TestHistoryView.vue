<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { settings } from '../settings';
import { vFitLine } from '../lib/fitLine';
import { pendingTest } from '../store';
import type { TestAnswerDetail, TestSessionInfo } from '../types';

/*
 * The tests this user took, newest first (read from the database through the server, never kept on this device), and the detail of one:
 * every question with the right word and what was chosen. From the detail the words that were missed can be tested again, or the test deleted.
 */
const router = useRouter();
const PAGE = 30;

const sessions = ref<TestSessionInfo[]>([]);
const loading = ref(true);
const failed = ref(false);
const more = ref(false); // there may be older tests

async function load(older = false): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    const before = older ? sessions.value[sessions.value.length - 1]?.at : undefined;
    const page = await api.tests(before);
    sessions.value = older ? [...sessions.value, ...page] : page;
    more.value = page.length >= PAGE;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

const open = ref(false);
const current = ref<TestSessionInfo | null>(null);
const answers = ref<TestAnswerDetail[]>([]);
const detailLoading = ref(false);
const detailFailed = ref(false);

async function show(s: TestSessionInfo): Promise<void> {
  current.value = s;
  answers.value = [];
  detailFailed.value = false;
  detailLoading.value = true;
  open.value = true;
  try {
    answers.value = await api.testAnswers(s.sessionId);
  } catch {
    detailFailed.value = true;
  } finally {
    detailLoading.value = false;
  }
}

const missedIds = computed(() => answers.value.filter((a) => a.answered && !a.correct && a.word).map((a) => a.word!.id));

/* Unfinished tests first (they can be continued), then the finished ones. */
const groups = computed(() =>
  [
    { key: 'open', items: sessions.value.filter((s) => s.status === 'open') },
    { key: 'done', items: sessions.value.filter((s) => s.status === 'done') }
  ].filter((g) => g.items.length > 0)
);

/* Goes on with an unfinished test: the screen of the test gets its questions back from the server, from the first one not done. */
function resume(s: TestSessionInfo): void {
  pendingTest.value = { deckId: s.deckId, deckName: s.deckName, tags: s.tags, statuses: [], count: s.total, kinds: s.mode, resumeId: s.sessionId };
  void router.push('/test');
}

function testMissed(): void {
  const s = current.value;
  if (!s || missedIds.value.length === 0) return;
  pendingTest.value = { deckId: s.deckId, deckName: s.deckName, tags: [], statuses: [], count: missedIds.value.length, wordIds: missedIds.value };
  void router.push('/test');
}

const deleteOpen = ref(false); // the question "delete this test?" (the app's own dialog)
async function remove(): Promise<void> {
  deleteOpen.value = false;
  const s = current.value;
  if (!s) return;
  try {
    await api.deleteTest(s.sessionId);
    sessions.value = sessions.value.filter((x) => x.sessionId !== s.sessionId);
    open.value = false;
  } catch {
    detailFailed.value = true;
  }
}

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/* The bar: how much was right in a finished test, how much is done in an unfinished one. */
const percent = (s: TestSessionInfo): number => Math.round((100 * (s.status === 'open' ? s.answered : s.correct)) / Math.max(s.status === 'open' ? s.total : s.answered, 1));

onMounted(() => void load());
</script>

<template>
  <TopBar :title="t('test.history')" back />

  <v-container fluid class="histpage">
    <v-progress-linear v-if="loading" indeterminate color="primary" />
    <v-alert v-if="failed" type="error" variant="tonal" icon="mdi-alert-circle-outline">
      {{ t('test.historyError') }}
      <template #append><v-btn variant="tonal" size="small" :data-tip="t('tip.retry')" @click="load()">{{ t('deck.retry') }}</v-btn></template>
    </v-alert>
    <div v-else-if="!loading && sessions.length === 0" class="empty text-body-2 text-medium-emphasis">{{ t('test.historyEmpty') }}</div>

    <template v-for="g in groups" :key="g.key">
      <div class="grid">
      <div v-for="s in g.items" :key="s.sessionId" class="paper-card row" :class="{ open: s.status === 'open' }" role="button" tabindex="0" @click="show(s)" @keydown.enter.self.prevent="show(s)" @keydown.space.self.prevent="show(s)">
        <div class="info">
          <!-- the deck name, and for an unfinished test how many are done, right aligned on the same line -->
          <div class="decktop">
            <div class="deck jp">{{ s.deckName }}</div>
            <span v-if="s.status === 'open'" class="scoreline openline">{{ s.answered }}/{{ s.total }}</span>
            <span v-else class="scoreline doneline" :class="{ perfect: s.answered > 0 && s.correct === s.answered }">{{ s.correct }}/{{ s.answered }}</span>
          </div>
          <div class="text-caption text-medium-emphasis">{{ when(s.at) }}<span v-if="s.tags.length"> · {{ s.tags.join(', ') }}</span></div>
          <div class="kindline text-caption">
            <span v-if="s.nListen"><v-icon icon="mdi-volume-high" size="12" /> {{ t('test.shortListen') }} {{ t('test.score', { correct: s.correctListen, total: s.answeredListen }) }}<span class="of">/{{ s.nListen }}</span></span>
            <span v-if="s.nMeaning"><v-icon icon="mdi-translate" size="12" /> {{ t('test.shortMeaning') }} {{ t('test.score', { correct: s.correctMeaning, total: s.answeredMeaning }) }}<span class="of">/{{ s.nMeaning }}</span></span>
            <span v-if="s.nReading"><v-icon icon="mdi-syllabary-hiragana" size="12" /> {{ t('test.shortReading') }} {{ t('test.score', { correct: s.correctReading ?? 0, total: s.answeredReading ?? 0 }) }}<span class="of">/{{ s.nReading }}</span></span>
            <!-- an unfinished test: the small Continue button, right aligned on this line so the card stays low -->
            <v-btn v-if="s.status === 'open'" size="x-small" color="primary" prepend-icon="mdi-play" class="resumebtn" @click.stop="resume(s)">{{ t('test.resume') }}</v-btn>
          </div>
          <v-progress-linear :model-value="percent(s)" height="4" rounded color="primary" bg-color="surface-variant" class="mt-1" />
        </div>
      </div>
      </div>
    </template>

    <v-btn v-if="more && !failed" variant="tonal" :loading="loading" class="mt-2 align-self-center" @click="load(true)">{{ t('test.older') }}</v-btn>
  </v-container>

  <ConfirmDialog
    :model-value="deleteOpen"
    danger
    icon="mdi-delete-outline"
    confirm-icon="mdi-delete-outline"
    cancel-icon="mdi-close"
    :title="t('test.delete')"
    :message="t('test.deleteAsk')"
    :confirm-label="t('test.deleteBtn')"
    :cancel-label="t('test.cancel')"
    @confirm="remove"
    @cancel="deleteOpen = false"
  />

  <!-- the detail of one test -->
  <v-bottom-sheet v-model="open">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" />
      <div class="pa-4 pt-1">
        <div v-if="current" class="head">
          <div class="jp deck">{{ current.deckName }}</div>
          <div class="text-caption text-medium-emphasis">{{ when(current.at) }} · {{ t('test.score', { correct: current.correct, total: current.answered }) }}<span v-if="current.answered < current.total"> · {{ t('test.notDone', { n: current.total - current.answered }) }}</span></div>
        </div>
        <v-progress-linear v-if="detailLoading" indeterminate color="primary" class="my-2" />
        <v-alert v-if="detailFailed" type="error" variant="tonal" density="compact" class="my-2">{{ t('test.historyError') }}</v-alert>
        <div class="answers">
          <div v-for="a in answers" :key="a.n" class="arow" :class="{ ok: a.correct, todo: !a.answered }">
            <v-icon :icon="!a.answered ? 'mdi-minus-circle-outline' : a.correct ? 'mdi-check-circle' : 'mdi-close-circle'" size="18" class="aicon" />
            <div class="abody">
              <div v-fit-line.always class="jp aword">{{ a.word?.headword ?? t('test.removed') }}<span v-if="a.word?.reading" class="areading">{{ a.word.reading }}</span></div>
              <div v-if="a.word" v-fit-line.always class="ameaning"><span v-if="settings.showHanViet && a.word.hanviet" class="hvline">{{ a.word.hanviet }}</span>{{ a.word.meaning }}</div>
              <div v-if="a.answered && !a.correct" class="text-caption text-medium-emphasis">
                {{ t('test.picked', { word: a.picked ? (a.kind === 'listen' ? a.picked.headword : a.kind === 'reading' ? (a.picked.reading ?? a.picked.headword) : a.picked.meaning.split('\n')[0] ?? '') : t('test.noAnswer') }) }}
              </div>
            </div>
            <v-chip size="x-small" variant="tonal" :color="a.kind === 'listen' ? 'warning' : a.kind === 'reading' ? 'secondary' : 'info'" class="kind">{{ a.kind === 'listen' ? t('test.shortListen') : a.kind === 'reading' ? t('test.shortReading') : t('test.shortMeaning') }}</v-chip>
          </div>
        </div>
        <div class="actions">
          <v-btn v-if="current?.status === 'open'" class="abtn" color="primary" prepend-icon="mdi-play" :aria-label="t('test.resume')" :data-tip="t('test.resume')" @click="resume(current)"><span class="lbl">{{ t('test.resume') }}</span></v-btn>
          <v-btn v-if="missedIds.length" class="abtn" :color="current?.status === 'open' ? undefined : 'primary'" :variant="current?.status === 'open' ? 'tonal' : 'elevated'" prepend-icon="mdi-school-outline" :aria-label="t('test.again')" :data-tip="t('test.again')" @click="testMissed"><span class="lbl">{{ t('test.again') }}</span></v-btn>
          <v-btn class="abtn" variant="tonal" color="error" prepend-icon="mdi-delete-outline" :aria-label="t('test.delete')" :data-tip="t('test.delete')" @click="deleteOpen = true"><span class="lbl">{{ t('test.delete') }}</span></v-btn>
          <v-btn class="abtn" variant="tonal" color="info" prepend-icon="mdi-close" :aria-label="t('test.close')" :data-tip="t('test.close')" @click="open = false"><span class="lbl">{{ t('test.close') }}</span></v-btn>
        </div>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.histpage {
  width: 100%; /* the whole width: the number of columns follows it (see .grid) */
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-inline: 12px;
  padding-top: 4px;
  padding-bottom: 16px;
}
/* The tests fill as many columns as fit the width (one on a phone), and as many rows as needed. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: 8px;
  align-items: stretch;
}
.grid .row {
  height: 100%;
}
.empty {
  padding: 32px 8px;
  text-align: center;
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
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
}
.row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.row:active {
  transform: translateY(1px);
}
.row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
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
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 9%, var(--paper)); /* a finished test: a little greener than an unfinished one */
}
.row.open {
  border-left: 4px solid #ef8a17; /* an unfinished test: the orange of the Again button */
}
.kindline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: var(--forest);
}
.kindline .of {
  opacity: 0.6;
}
.openline {
  color: #b8600f;
}
.decktop {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.decktop .deck {
  flex: 1;
  min-width: 0;
}
.doneline {
  color: var(--forest); /* a finished test: the same figure as an unfinished one, in green */
}
.doneline.perfect {
  color: rgb(var(--v-theme-primary));
}
.decktop .scoreline {
  font-size: inherit; /* the same size as the deck name, and bold */
  font-weight: 700;
  line-height: inherit;
  flex: 0 0 auto;
  margin-left: auto;
  text-align: right;
}
.resumebtn {
  flex: 0 0 auto;
  margin-left: auto; /* to the right end of the line */
}
.arow.todo .aicon {
  color: inherit;
  opacity: 0.5;
}
.deck {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sheet {
  background: var(--paper);
  max-height: 90dvh;
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
.answers {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.arow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--paper-edge);
}
.aicon {
  margin-top: 2px;
  color: #d9534f;
}
.arow.todo {
  padding: 8px 8px; /* not answered yet: a tinted row and a grey icon (no text) */
  border-radius: 8px;
  background: color-mix(in srgb, var(--paper-edge) 45%, transparent);
}
.arow.todo .aicon {
  color: #8a8a8a;
}
.arow.ok .aicon {
  color: rgb(var(--v-theme-primary));
}
.abody {
  flex: 1;
  min-width: 0;
}
.aword {
  font-weight: 700;
  color: var(--headword);
}
.areading {
  margin-left: 0.6em; /* air between the headword and its reading (On / Kun) */
  font-weight: 400;
  font-size: 0.9rem;
  color: var(--forest);
}
.hvline {
  margin-right: 0.5em; /* Sino-Vietnamese and the Vietnamese meaning share one line */
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--hv);
}
.ameaning {
  white-space: pre-line;
}
.kind {
  flex: 0 0 auto;
}
/* phone: the buttons under the list show only their icons (the names stay as labels and tooltips) */
@media (max-width: 600px) {
  .abtn {
    min-width: 48px;
    padding: 0 14px;
  }
  .abtn .lbl {
    display: none;
  }
  .abtn :deep(.v-btn__prepend) {
    margin-inline: 0;
  }
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}
</style>
