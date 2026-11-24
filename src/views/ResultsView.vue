<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, me } from '../api';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { paperSourceText } from '../lib/paperStart';
import type { PaperInfo, PaperQuestionStat, PaperResult } from '../types';

/*
 * Admin: how everybody did at one test (paper), on one page that scrolls down: the test itself, the figures of the whole test, how each person
 * did (tap a person for every attempt) and every question with how often it was answered right. The server refuses anybody who is not an
 * admin (403); this screen only hides itself from them.
 */
const route = useRoute();
const router = useRouter();

const paperId = computed(() => String(route.params.id ?? ''));
const paper = ref<PaperInfo | null>(null);
const results = ref<PaperResult[]>([]);
const stats = ref<PaperQuestionStat[]>([]);
const loading = ref(true);
const failed = ref(false);
const missing = ref(false);

const total = computed(() => paper.value?.total ?? 0);

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  missing.value = false;
  try {
    const found = (await api.papers()).find((p) => p.paperId === paperId.value) ?? null;
    paper.value = found;
    if (!found) {
      missing.value = true;
      return;
    }
    [results.value, stats.value] = await Promise.all([api.paperResults(found.paperId), api.paperStats(found.paperId)]);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

/* ---- the figures of the whole test ---- */
interface Person {
  userId: string;
  attempts: PaperResult[]; // newest first
  done: number;
  open: number;
  best: number | null; // of the finished ones
  average: number | null; // of the finished ones, in points
  last: string;
}

const people = computed<Person[]>(() => {
  const by = new Map<string, PaperResult[]>();
  for (const r of results.value) by.set(r.userId, [...(by.get(r.userId) ?? []), r]);
  return [...by.entries()].map(([userId, list]) => {
    const attempts = [...list].sort((a, b) => (a.at < b.at ? 1 : -1));
    const finished = attempts.filter((a) => a.status === 'done');
    return {
      userId,
      attempts,
      done: finished.length,
      open: attempts.length - finished.length,
      best: finished.length ? Math.max(...finished.map((a) => a.correct)) : null,
      average: finished.length ? finished.reduce((s, a) => s + a.correct, 0) / finished.length : null,
      last: attempts[0]!.at
    };
  });
});

const finishedAll = computed(() => results.value.filter((r) => r.status === 'done'));
const averageAll = computed(() => (finishedAll.value.length ? finishedAll.value.reduce((s, r) => s + r.correct, 0) / finishedAll.value.length : null));
const bestAll = computed(() => {
  const top = [...people.value].filter((p) => p.best !== null).sort((a, b) => b.best! - a.best!)[0];
  return top ? { score: top.best!, userId: top.userId } : null;
});

const pct = (points: number | null): number => Math.round((100 * (points ?? 0)) / Math.max(total.value, 1));
const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortWhen = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
/* green from 70% up, orange from 40%, red below: how a score reads at a glance */
const tone = (percent: number): string => (percent >= 70 ? 'good' : percent >= 40 ? 'mid' : 'low');
const barColor = (percent: number): string => (percent >= 70 ? 'primary' : percent >= 40 ? 'warning' : 'error');

/* ---- people ---- */
type Sort = 'best' | 'name' | 'recent';
const sort = ref<Sort>('best');
const sorted = computed(() => {
  const list = [...people.value];
  if (sort.value === 'name') return list.sort((a, b) => a.userId.localeCompare(b.userId));
  if (sort.value === 'recent') return list.sort((a, b) => (a.last < b.last ? 1 : -1));
  return list.sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.userId.localeCompare(b.userId));
});
const expanded = ref(new Set<string>());
function toggle(userId: string): void {
  const next = new Set(expanded.value);
  if (!next.delete(userId)) next.add(userId);
  expanded.value = next;
}

/* ---- questions ---- */
type QSort = 'hard' | 'order';
const qsort = ref<QSort>('hard');
const showQuestions = ref(false); // the questions are listed only when asked for
const rated = computed(() =>
  stats.value.map((q) => ({ ...q, rate: q.answered > 0 ? q.correct / q.answered : null }))
);
const questions = computed(() => {
  const list = [...rated.value];
  if (qsort.value === 'order') return list.sort((a, b) => a.n - b.n);
  // the worst first; the ones nobody answered yet go last
  return list.sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.answered - a.answered || a.n - b.n);
});
const kindIcon = (kind: string): string => (kind === 'listen' ? 'mdi-volume-high' : kind === 'reading' ? 'mdi-syllabary-hiragana' : 'mdi-translate');

/* who is an admin is known only once the server has answered: load when it says so */
watch(
  () => me.admin,
  (admin) => {
    if (admin && !paper.value && !failed.value) void load();
  }
);
watch(paperId, () => void load());
onMounted(() => {
  if (me.admin) void load();
  else loading.value = false;
});
</script>

<template>
  <TopBar :title="paper ? t('papers.resultsTitle', { title: paper.title }) : t('nav.tests')">
    <v-btn variant="flat" color="primary" prepend-icon="mdi-arrow-left" class="act3d act3d-purple barbtn mr-2" :aria-label="t('results.back')" :data-tip="t('results.back')" @click="router.replace('/tests')"><span class="lbl">{{ t('results.back') }}</span></v-btn>
  </TopBar>

  <v-container fluid class="detailpage">
    <v-alert v-if="!me.admin" type="info" variant="tonal" density="compact" icon="mdi-lock-outline">{{ t('results.adminOnly') }}</v-alert>

    <template v-else>
      <v-progress-linear v-if="loading" indeterminate color="primary" />
      <v-alert v-if="failed" type="error" variant="tonal" icon="mdi-alert-circle-outline">
        {{ t('papers.error') }}
        <template #append><v-btn variant="tonal" size="small" @click="load()">{{ t('deck.retry') }}</v-btn></template>
      </v-alert>
      <div v-if="missing" class="empty text-body-2">{{ t('manage.missing') }}</div>

      <template v-if="paper">
        <!-- the test itself -->
        <div class="paper-card head">
          <div class="htitle">{{ paper.title }}</div>
          <div class="text-caption mine">{{ paperSourceText(paper) }}</div>
          <div class="text-caption mine">{{ when(paper.at) }} · {{ t('papers.by', { user: paper.createdBy }) }}</div>
          <div class="kindline text-caption">
            <span>{{ t('papers.questionsCount', { n: paper.total }) }}</span>
            <span v-if="paper.nMeaning"><v-icon icon="mdi-translate" size="12" /> {{ t('test.shortMeaning') }} {{ paper.nMeaning }}</span>
            <span v-if="paper.nListen"><v-icon icon="mdi-volume-high" size="12" /> {{ t('test.shortListen') }} {{ paper.nListen }}</span>
            <span v-if="paper.nReading"><v-icon icon="mdi-syllabary-hiragana" size="12" /> {{ t('test.shortReading') }} {{ paper.nReading }}</span>
          </div>
        </div>

        <!-- 1. the whole test in four figures -->
        <section class="blk">
          <!-- nobody has taken it yet: nothing to say here, the cards and figures simply are not shown -->
          <template v-if="results.length">
            <div class="tiles">
              <div class="tile t-people"><v-icon icon="mdi-account-multiple-outline" size="18" /><div class="n">{{ people.length }}</div><div class="l">{{ t('results.people') }}</div></div>
              <div class="tile t-attempts">
                <v-icon icon="mdi-counter" size="18" /><div class="n">{{ results.length }}</div>
                <div class="l">{{ t('results.attempts') }} · {{ t('results.finishedOf', { n: finishedAll.length }) }}</div>
              </div>
              <div class="tile t-average">
                <v-icon icon="mdi-chart-line" size="18" />
                <div class="n">{{ averageAll === null ? '–' : pct(averageAll) + '%' }}</div>
                <div class="l">{{ t('results.average') }}<template v-if="averageAll !== null"> · {{ averageAll.toFixed(1) }}/{{ total }}</template></div>
              </div>
              <div class="tile t-best">
                <v-icon icon="mdi-trophy-outline" size="18" />
                <div class="n">{{ bestAll ? `${bestAll.score}/${total}` : '–' }}</div>
                <div class="l">{{ t('results.best') }}<template v-if="bestAll"> · {{ bestAll.userId }}</template></div>
              </div>
            </div>

          </template>
        </section>

        <!-- 2. how each person did -->
        <section class="blk">
          <template v-if="results.length">
            <div class="sortrow">
              <div class="sub s-user"><v-icon icon="mdi-account-multiple-outline" size="16" />{{ t('results.byUser') }}</div>
              <v-chip-group v-model="sort" mandatory filter color="primary" class="sorts" :aria-label="t('results.sort')">
                <v-chip value="best" size="x-small">{{ t('results.sortBest') }}</v-chip>
                <v-chip value="name" size="x-small">{{ t('results.sortName') }}</v-chip>
                <v-chip value="recent" size="x-small">{{ t('results.sortRecent') }}</v-chip>
              </v-chip-group>
            </div>
            <div class="grid">
              <div v-for="u in sorted" :key="u.userId" class="paper-card row person" :class="{ open: u.best === null }">
                <div class="info">
                  <div class="decktop">
                    <div class="deck">{{ u.userId }}</div>
                    <span v-if="u.best !== null" class="scoreline" :class="tone(pct(u.best))">{{ u.best }}/{{ total }}</span>
                    <span v-else class="scoreline openline">–</span>
                  </div>
                  <div class="text-caption mine">
                    {{ t('papers.attempts', { n: u.attempts.length }) }}<template v-if="u.open"> ({{ t('results.finishedOf', { n: u.done }) }})</template>
                    <template v-if="u.average !== null"> · {{ t('results.avgShort', { pct: pct(u.average) }) }}</template>
                    · {{ t('results.last', { when: shortWhen(u.last) }) }}
                  </div>
                  <v-progress-linear :model-value="pct(u.best)" height="5" rounded :color="u.best === null ? 'surface-variant' : barColor(pct(u.best))" bg-color="surface-variant" class="mt-1" />
                  <button type="button" class="more" :aria-expanded="expanded.has(u.userId)" @click="toggle(u.userId)">
                    <v-icon :icon="expanded.has(u.userId) ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
                    {{ expanded.has(u.userId) ? t('results.hide') : t('results.userAttempts', { n: u.attempts.length }) }}
                  </button>
                  <div v-if="expanded.has(u.userId)" class="attempts">
                    <div v-for="a in u.attempts" :key="a.sessionId" class="attempt">
                      <span class="text-caption mine">{{ when(a.at) }}</span>
                      <span v-if="a.status === 'open'" class="openline">{{ a.answered }}/{{ a.total }} · {{ t('papers.notDone') }}</span>
                      <span v-else class="scoreline" :class="tone(pct(a.correct))">{{ a.correct }}/{{ a.answered }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </section>

        <!-- 3. every question -->
        <section class="blk">
          <div class="sortrow">
            <v-btn size="small" variant="flat" color="primary" class="act3d act3d-orange" prepend-icon="mdi-format-list-numbered" :append-icon="showQuestions ? 'mdi-chevron-up' : 'mdi-chevron-down'" :aria-expanded="showQuestions" @click="showQuestions = !showQuestions">{{ t('manage.partQuestions') }} ({{ questions.length }})</v-btn>
            <v-chip-group v-if="showQuestions" v-model="qsort" mandatory filter color="primary" class="sorts" :aria-label="t('results.sort')">
              <v-chip value="hard" size="x-small">{{ t('manage.sortHard') }}</v-chip>
              <v-chip value="order" size="x-small">{{ t('manage.sortOrder') }}</v-chip>
            </v-chip-group>
          </div>
          <div v-if="showQuestions" class="qlist paper-card">
            <div v-for="q in questions" :key="q.n" class="qrow">
              <span class="qn">{{ q.n + 1 }}</span>
              <v-icon :icon="kindIcon(q.kind)" size="16" class="qicon" />
              <div class="qword">
                <span class="jp qhead">{{ q.word?.headword ?? '?' }}</span>
                <span class="text-caption mine qmean">{{ q.word?.meaning.split('\n')[0] }}</span>
              </div>
              <div class="qnum">
                <template v-if="q.rate !== null">
                  <div class="qrate" :class="tone(Math.round(q.rate * 100))">{{ Math.round(q.rate * 100) }}%</div>
                  <div class="text-caption mine">{{ t('results.rightOf', { correct: q.correct, answered: q.answered }) }}<template v-if="q.skipped"> · {{ t('results.skipped', { n: q.skipped }) }}</template></div>
                </template>
                <div v-else class="text-caption mine">{{ t('manage.noAnswerYet') }}</div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </template>
  </v-container>
</template>

<style>
/* --forest is a dark green: fine on the light page, nearly invisible on the dark one, so the dark theme uses the leaf green */
.v-theme--dark .detailpage .mine,
.v-theme--dark .detailpage .kindline,
.v-theme--dark .detailpage .qn,
.v-theme--dark .detailpage .qicon,
.v-theme--dark .detailpage .scoreline.good {
  color: var(--leaf);
}
</style>

<style scoped>
.blk {
  display: contents; /* the parts are only a way to read the page: the page's own gap spaces what is in them */
}
.detailpage {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-inline: 12px;
  padding-top: 4px;
  padding-bottom: 24px;
  min-height: calc(100dvh - var(--v-layout-top, 48px)); /* at least the screen: the list of questions takes what is left */
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 8px;
  align-items: start;
}
.empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--jp); /* the main text colour: the grey of text-medium-emphasis is hard to read on the dark page */
}
.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--sc);
}
.s-user { --sc: #8e4ec6; }
.s-hard { --sc: #ef8a17; }
.head {
  padding: 10px 14px;
}
.htitle {
  font-weight: 700;
  font-size: 1.05rem;
}
.kindline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: var(--forest);
}
.mine {
  color: var(--forest);
}
.parts {
  margin-top: 2px;
}

/* the four figures */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}
.tile {
  --tc: var(--forest);
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--paper);
  border-left: 4px solid var(--tc);
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  align-items: center;
}
.tile .v-icon {
  grid-row: 1 / 3;
  color: var(--tc);
}
.tile .n {
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.1;
  color: var(--tc);
}
.tile .l {
  font-size: 0.72rem;
  color: var(--jp);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-people { --tc: #8e4ec6; }
.t-attempts { --tc: #1e88e5; }
.t-average { --tc: #ef8a17; }
.t-best { --tc: #3f8a1f; }

.sortrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.sortrow .sub {
  margin-top: 0;
}
.sorts {
  flex: 0 1 auto;
}

/* a person */
.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
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
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 9%, var(--paper)); /* has a finished attempt: a little greener, like a finished test */
}
.row.open {
  border-left: 4px solid #ef8a17; /* nothing finished yet: the orange of an unfinished test */
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
.scoreline {
  font-weight: 700;
  flex: 0 0 auto;
  margin-left: auto;
  text-align: right;
}
.scoreline.good { color: rgb(var(--v-theme-primary)); }
.scoreline.mid { color: #b8600f; }
.scoreline.low { color: #d14b3a; }
.openline {
  color: #b8600f;
  font-weight: 700;
}
.more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
  padding: 2px 4px 2px 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(var(--v-theme-info));
  cursor: pointer;
}
.more.center {
  align-self: center;
  margin-top: 8px;
}
.attempts {
  margin-top: 4px;
  border-top: 1px solid var(--paper-edge);
}
.attempt {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid var(--paper-edge);
}
.attempt:last-child {
  border-bottom: 0;
}

/* the questions */
.qlist {
  display: flex;
  flex-direction: column;
  padding: 4px 14px 10px;
  /* the list scrolls inside */
  flex: 1 1 0; /* the free space of the screen below the other parts */
  min-height: 160px; /* a screen too short for that: the page scrolls instead */
  overflow-y: auto;
}
.qrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--paper-edge);
}
.qn {
  flex: 0 0 22px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--forest);
  text-align: right;
}
.qicon {
  flex: 0 0 auto;
  color: var(--forest);
}
.qword {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.qhead {
  font-weight: 700;
  color: var(--headword);
}
.qmean {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qnum {
  flex: 0 0 auto;
  text-align: right;
}
.qrate {
  font-weight: 800;
}
.qrate.good { color: rgb(var(--v-theme-primary)); }
.qrate.mid { color: #b8600f; }
.qrate.low { color: #d14b3a; }

/* a phone: the bar holds only icons, so the buttons and the title fit */
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
