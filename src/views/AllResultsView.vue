<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, me } from '../api';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import type { PaperInfo, PaperResult } from '../types';

/*
 * Admin: how everybody did at every test, on one screen. "By test": a row per test with its figures (tap a row for the results of that test);
 * "Matrix": a row per person, a column per test, the best score in each cell. The results of the tests are fetched one test after the other
 * (the server allows about 240 calls a minute) and shown as they arrive. The server refuses anybody who is not an admin (403).
 */
const router = useRouter();

const papers = ref<PaperInfo[]>([]);
const results = ref(new Map<string, PaperResult[]>()); // paperId -> every attempt of every person
const loading = ref(true);
const failed = ref(false);
const fetched = ref(0);

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  fetched.value = 0;
  results.value = new Map();
  try {
    papers.value = await api.papers();
    for (const p of papers.value) {
      const list = await api.paperResults(p.paperId); // p.attempts counts only the admin's own attempts, not everybody's
      results.value = new Map(results.value).set(p.paperId, list);
      fetched.value++;
    }
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

/* ---- per test ---- */
interface Row {
  paper: PaperInfo;
  people: number;
  attempts: number;
  finished: number;
  average: number | null; // percent of the finished attempts
  best: { userId: string; correct: number } | null;
}
const rows = computed<Row[]>(() =>
  papers.value.map((paper) => {
    const list = results.value.get(paper.paperId) ?? [];
    const done = list.filter((r) => r.status === 'done');
    const top = [...done].sort((a, b) => b.correct - a.correct)[0];
    return {
      paper,
      people: new Set(list.map((r) => r.userId)).size,
      attempts: list.length,
      finished: done.length,
      average: done.length ? (100 * done.reduce((s, r) => s + r.correct, 0)) / (done.length * Math.max(paper.total, 1)) : null,
      best: top ? { userId: top.userId, correct: top.correct } : null
    };
  })
);

type Sort = 'recent' | 'hard' | 'taken';
const sort = ref<Sort>('recent');
const sortedRows = computed(() => {
  const list = [...rows.value];
  if (sort.value === 'hard') return list.sort((a, b) => (a.average ?? 101) - (b.average ?? 101));
  if (sort.value === 'taken') return list.sort((a, b) => b.attempts - a.attempts);
  return list.sort((a, b) => (a.paper.at < b.paper.at ? 1 : -1));
});

/* ---- the figures of everything ---- */
const nobody = computed(() => rows.value.filter((r) => r.attempts === 0).length);
const everyone = computed(() => {
  const set = new Set<string>();
  for (const list of results.value.values()) for (const r of list) set.add(r.userId);
  return set;
});
const attemptsAll = computed(() => rows.value.reduce((s, r) => s + r.attempts, 0));
const finishedAll = computed(() => rows.value.reduce((s, r) => s + r.finished, 0));
const averageAll = computed(() => {
  const withAverage = rows.value.filter((r) => r.average !== null);
  return withAverage.length ? Math.round(withAverage.reduce((s, r) => s + r.average!, 0) / withAverage.length) : null;
});

/* ---- the matrix: a person, a test, the best finished score ---- */
type View = 'tests' | 'matrix';
const view = ref<View>('tests');
const matrixPapers = computed(() => [...papers.value].sort((a, b) => (a.at < b.at ? 1 : -1)));
function bestOf(userId: string, paperId: string): number | null {
  const mine = (results.value.get(paperId) ?? []).filter((r) => r.userId === userId && r.status === 'done');
  return mine.length ? Math.max(...mine.map((r) => r.correct)) : null;
}
const matrixPeople = computed(() => {
  const list = [...everyone.value].map((userId) => {
    const percents = papers.value
      .map((p) => {
        const best = bestOf(userId, p.paperId);
        return best === null ? null : (100 * best) / Math.max(p.total, 1);
      })
      .filter((x): x is number => x !== null);
    return { userId, average: percents.length ? Math.round(percents.reduce((s, x) => s + x, 0) / percents.length) : null };
  });
  return list.sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.userId.localeCompare(b.userId));
});

/* green from 75% up, amber from 50%, red below: how a score reads at a glance */
const tone = (percent: number): string => (percent >= 75 ? 'good' : percent >= 50 ? 'mid' : 'low');
const when = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
const open = (paperId: string): void => void router.push(`/tests/results/${encodeURIComponent(paperId)}`);

/* wait until it is known who is signed in: a reload opens this screen before the server has said whether it is an admin */
watch(
  () => me.ready,
  (ready) => {
    if (!ready) return;
    if (me.admin) void load();
    else loading.value = false;
  },
  { immediate: true }
);
</script>

<template>
  <TopBar :title="t('allres.title')">
    <v-btn variant="flat" color="primary" prepend-icon="mdi-arrow-left" class="act3d act3d-purple barbtn mr-2" :aria-label="t('results.back')" :data-tip="t('results.back')" @click="router.replace('/tests')"><span class="lbl">{{ t('results.back') }}</span></v-btn>
  </TopBar>

  <v-container fluid class="allpage">
    <v-alert v-if="me.ready && !me.admin" type="info" variant="tonal" density="compact" icon="mdi-lock-outline">{{ t('results.adminOnly') }}</v-alert>

    <template v-else-if="me.ready">
      <v-progress-linear v-if="loading" :model-value="papers.length ? (100 * fetched) / papers.length : 0" :indeterminate="papers.length === 0" color="primary" />
      <v-alert v-if="failed" type="error" variant="tonal" icon="mdi-alert-circle-outline">
        {{ t('papers.error') }}
        <template #append><v-btn variant="tonal" size="small" @click="load()">{{ t('deck.retry') }}</v-btn></template>
      </v-alert>
      <div v-if="!loading && !failed && papers.length === 0" class="empty text-body-2">{{ t('allres.none') }}</div>

      <template v-if="papers.length">
        <div class="tiles">
          <div class="tile t-tests"><v-icon icon="mdi-clipboard-text-outline" size="18" /><div class="n">{{ papers.length }}</div><div class="l">{{ t('allres.tTests', { n: nobody }) }}</div></div>
          <div class="tile t-people"><v-icon icon="mdi-account-multiple-outline" size="18" /><div class="n">{{ everyone.size }}</div><div class="l">{{ t('allres.tPeople') }}</div></div>
          <div class="tile t-attempts"><v-icon icon="mdi-counter" size="18" /><div class="n">{{ attemptsAll }}</div><div class="l">{{ t('allres.tAttempts', { n: finishedAll }) }}</div></div>
          <div class="tile t-average"><v-icon icon="mdi-chart-line" size="18" /><div class="n">{{ averageAll === null ? '–' : averageAll + '%' }}</div><div class="l">{{ t('allres.tAverage') }}</div></div>
        </div>

        <div class="sortrow">
          <div class="tabs">
            <v-btn variant="flat" color="primary" prepend-icon="mdi-clipboard-list-outline" class="act3d act3d-blue" :class="{ quiet: view !== 'tests' }" @click="view = 'tests'">{{ t('allres.byTest') }}</v-btn>
            <v-btn variant="flat" color="primary" prepend-icon="mdi-table" class="act3d act3d-blue" :class="{ quiet: view !== 'matrix' }" @click="view = 'matrix'">{{ t('allres.matrix') }}</v-btn>
          </div>
          <v-chip-group v-if="view === 'tests'" v-model="sort" mandatory filter color="primary" class="sorts" :aria-label="t('results.sort')">
            <v-chip value="recent" size="x-small">{{ t('allres.sortRecent') }}</v-chip>
            <v-chip value="hard" size="x-small">{{ t('allres.sortHard') }}</v-chip>
            <v-chip value="taken" size="x-small">{{ t('allres.sortTaken') }}</v-chip>
          </v-chip-group>
        </div>

        <!-- by test -->
        <template v-if="view === 'tests'">
          <div class="sub s-tests"><v-icon icon="mdi-format-list-numbered" size="16" />{{ t('allres.hintTests') }}</div>
          <div class="paper-card list">
            <div class="hdr">
              <div>{{ t('allres.cTest') }}</div><div class="num">{{ t('allres.cQs') }}</div><div class="num">{{ t('allres.cPeople') }}</div><div class="num">{{ t('allres.cAttempts') }}</div>
              <div>{{ t('allres.cAverage') }}</div><div>{{ t('allres.cBest') }}</div><div>{{ t('allres.cDone') }}</div>
            </div>
            <div v-for="r in sortedRows" :key="r.paper.paperId" class="tr" :class="{ none: r.attempts === 0 }" role="button" tabindex="0" @click="open(r.paper.paperId)" @keydown.enter.self.prevent="open(r.paper.paperId)">
              <div class="cell0">
                <div class="jp nm">{{ r.paper.title }}</div>
                <div class="mine">{{ when(r.paper.at) }} · {{ t('papers.by', { user: r.paper.createdBy }) }}</div>
              </div>
              <div class="num">{{ r.paper.total }}</div>
              <div class="num">{{ r.people }}</div>
              <div class="num">{{ r.attempts }}</div>
              <div>
                <template v-if="r.average !== null">
                  <b :class="tone(r.average)">{{ Math.round(r.average) }}%</b>
                  <div class="meter"><i :class="tone(r.average)" :style="{ width: r.average + '%' }" /></div>
                </template>
                <span v-else class="mine">–</span>
              </div>
              <div class="mine">{{ r.best ? `${r.best.userId} ${r.best.correct}/${r.paper.total}` : '–' }}</div>
              <div class="mine">{{ r.attempts ? t('allres.finishedOf', { done: r.finished, n: r.attempts }) : '–' }}</div>
            </div>
          </div>
        </template>

        <!-- matrix -->
        <template v-else>
          <div class="sub s-matrix"><v-icon icon="mdi-table" size="16" />{{ t('allres.hintMatrix') }}</div>
          <div class="paper-card mx">
            <table>
              <thead>
                <tr>
                  <th>{{ t('allres.person') }}</th>
                  <th v-for="p in matrixPapers" :key="p.paperId" class="mxh" :title="p.title" @click="open(p.paperId)">{{ p.title }}</th>
                  <th>{{ t('allres.cAverage') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in matrixPeople" :key="u.userId">
                  <td class="jp">{{ u.userId }}</td>
                  <td v-for="p in matrixPapers" :key="p.paperId">
                    <template v-for="best in [bestOf(u.userId, p.paperId)]" :key="p.paperId">
                      <span v-if="best !== null" class="cell" :class="tone((100 * best) / Math.max(p.total, 1))">{{ best }}/{{ p.total }}</span>
                      <span v-else class="cell zero">–</span>
                    </template>
                  </td>
                  <td><span v-if="u.average !== null" class="cell" :class="tone(u.average)">{{ u.average }}%</span><span v-else class="cell zero">–</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="note">{{ t('allres.matrixNote') }}</div>
        </template>
      </template>
    </template>
  </v-container>
</template>

<style>
/* --forest is a dark green: fine on the light page, nearly invisible on the dark one, so the dark theme uses the leaf green */
.v-theme--dark .allpage .mine,
.v-theme--dark .allpage .hdr,
.v-theme--dark .allpage .note,
.v-theme--dark .allpage .mx th {
  color: var(--leaf);
}
</style>

<style scoped>
.allpage {
  --gap: 8px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  padding-inline: 12px;
  padding-top: 4px;
  padding-bottom: 24px;
}
.empty {
  padding: 32px 8px;
  text-align: center;
  color: var(--jp);
}
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
.t-tests { --tc: #8e4ec6; }
.t-people { --tc: #1e88e5; }
.t-attempts { --tc: #ef8a17; }
.t-average { --tc: #3f8a1f; }
.v-theme--dark .t-average { --tc: #8fd35f; }
.v-theme--dark .t-tests { --tc: #c08ae8; }
.sortrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sorts {
  flex: 0 1 auto;
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
.s-tests { --sc: #ef8a17; }
.s-matrix { --sc: #1e88e5; }
.list {
  padding: 4px 14px 10px;
}
.hdr,
.tr {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) 44px 64px 76px minmax(100px, 1.2fr) minmax(0, 1.3fr) 84px;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
}
.hdr {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--forest);
  border-bottom: 2px solid var(--paper-edge);
}
.tr {
  border-bottom: 1px solid var(--paper-edge);
  cursor: pointer;
}
.tr:last-child {
  border-bottom: 0;
}
.tr.none {
  opacity: 0.7;
}
.tr:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .tr:hover {
    background: color-mix(in srgb, rgb(var(--v-theme-primary)) 8%, transparent);
  }
}
.nm {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell0 {
  min-width: 0;
}
.mine {
  font-size: 0.75rem;
  color: var(--forest);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.num {
  text-align: right;
}
.meter {
  height: 5px;
  border-radius: 3px;
  background: var(--paper-edge);
  margin-top: 3px;
}
.meter i {
  display: block;
  height: 100%;
  border-radius: 3px;
}
b.good { color: #3f8a1f; }
b.mid { color: #b8600f; }
b.low { color: #c9382f; }
.meter i.good { background: #639922; }
.meter i.mid { background: #ba7517; }
.meter i.low { background: #e24b4a; }
.v-theme--dark b.good { color: #8fd35f; }
.v-theme--dark b.mid { color: #f7a94d; }
.v-theme--dark b.low { color: #ff8a80; }
.mx {
  overflow: auto;
  padding: 4px 14px 10px;
}
.mx table {
  border-collapse: separate;
  border-spacing: 0 4px;
  width: 100%;
  font-size: 0.8rem;
}
.mx th {
  font-size: 0.72rem;
  color: var(--forest);
  font-weight: 700;
  padding: 4px 6px;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mxh {
  cursor: pointer;
}
.mx td {
  padding: 3px 6px;
  text-align: center;
  white-space: nowrap;
}
.mx td:first-child,
.mx th:first-child {
  text-align: left;
  position: sticky;
  left: 0;
  background: var(--paper);
  font-weight: 700;
}
.cell {
  display: inline-block;
  min-width: 50px;
  border-radius: 8px;
  padding: 3px 6px;
  font-weight: 700;
}
.cell.good { background: #d3efc4; color: #27500a; }
.cell.mid { background: #fbe3b4; color: #633806; }
.cell.low { background: #f8c9c4; color: #791f1f; }
.cell.zero { background: color-mix(in srgb, var(--paper-edge) 60%, transparent); color: var(--forest); font-weight: 400; }
.v-theme--dark .cell.good { background: #27500a; color: #d3efc4; }
.v-theme--dark .cell.mid { background: #633806; color: #fbe3b4; }
.v-theme--dark .cell.low { background: #791f1f; color: #f8c9c4; }
.note {
  font-size: 0.72rem;
  color: var(--forest);
  padding: 0 4px;
}
/* a phone: the title and the average, the rest is a tap away (the results of the test) */
@media (max-width: 760px) {
  .hdr,
  .tr {
    grid-template-columns: minmax(0, 1fr) 70px 70px;
  }
  .hdr > :nth-child(2),
  .hdr > :nth-child(4),
  .hdr > :nth-child(6),
  .hdr > :nth-child(7),
  .tr > :nth-child(2),
  .tr > :nth-child(4),
  .tr > :nth-child(6),
  .tr > :nth-child(7) {
    display: none;
  }
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
