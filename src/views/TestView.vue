<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { api, flushTests, queueTestOp } from '../api';
import { cardTextVars } from '../cardText';
import { vFitLine } from '../lib/fitLine';
import ReadingText from '../components/ReadingText.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { buildQuiz, meaningLabel, restoreQuestion, spoken, type QuizKind, type QuizQuestion } from '../lib/quiz';
import { ANY_DECK, loadPool } from '../lib/paper';
import { prefetchSpeech, speakJapanese, stopSpeaking } from '../lib/speech';
import { useVoiceBadge } from '../lib/voiceBadge';
import { settings } from '../settings';
import { pendingStart, pendingTest, type PendingTest } from '../store';
import type { StudyStatus } from '../types';

/*
 * The /test route. The deck screen (or the list of past tests) only says what to test (store: pendingTest); this screen loads the whole deck,
 * builds the questions (or, to continue an unfinished test, gets them back from the server) and runs them one by one.
 * The test is saved on the server whole as soon as it is made, each answer as it is given, and marked done at the end (api.ts keeps the steps that
 * could not be sent yet and resends them), so it can be left at any time and continued from any device.
 */
const router = useRouter();
const AUTO_NEXT_MS = 1200; // after a right answer
const DEFER_NEXT_MS = 350; // marking at the end: the chosen answer stays lit for a moment, then the next question comes
const KINDS: QuizKind[] = ['listen', 'meaning', 'reading'];

const job = ref<PendingTest | null>(pendingTest.value);
pendingTest.value = null;
if (!job.value) void router.replace('/'); // a reload or the menu: there is nothing to test

type Phase = 'loading' | 'failed' | 'few' | 'empty' | 'known' | 'asking' | 'result';
interface Done {
  pickedId: string | null; // null: skipped
  correct: boolean;
}
const phase = ref<Phase>('loading');
const waking = ref(false);
const quiz = shallowRef<QuizQuestion[]>([]);
const sessionId = ref('');
const done = ref<(Done | null)[]>([]); // one per question; null: not done yet
const index = ref(0);
const picked = ref<number | null>(null); // the option chosen on the question on screen; -1: skipped
const saveState = ref<'saving' | 'saved' | 'queued'>('saving');
const leftOut = ref(0); // words not asked because they were answered right in an earlier finished test

let timer: ReturnType<typeof setTimeout> | undefined;
let playTimer: ReturnType<typeof setTimeout> | undefined;
let gone = false;
onUnmounted(() => {
  gone = true;
  clearTimeout(timer);
  clearTimeout(playTimer);
  stopSpeaking();
});

const textVars = computed(() => cardTextVars(settings.cardText)); // --s-<text> (size), --c-<text> (colour), --i-<text> (italic): Settings > Question Style
const question = computed(() => quiz.value[index.value]);
const total = computed(() => quiz.value.length);
const answeredCount = computed(() => done.value.filter(Boolean).length);
const right = computed(() => done.value.filter((d) => d?.correct).length);
const notDone = computed(() => total.value - answeredCount.value);
const answered = computed(() => picked.value !== null);
const reveal = computed(() => answered.value && settings.testInstantCheck); // right / wrong is shown on the question
const isLast = computed(() => index.value + 1 >= total.value);
/* How many questions of each kind there are, and how many of them are answered and right. */
const byKind = computed(() =>
  KINDS.map((kind) => {
    const ids = quiz.value.flatMap((q, i) => (q.kind === kind ? [i] : []));
    return { kind, total: ids.length, answered: ids.filter((i) => done.value[i]).length, right: ids.filter((i) => done.value[i]?.correct).length };
  }).filter((k) => k.total > 0)
);
const kindLabel = (kind: QuizKind): string => (kind === 'listen' ? t('test.shortListen') : kind === 'reading' ? t('test.shortReading') : t('test.shortMeaning'));
const kindIcon = (kind: QuizKind): string => (kind === 'listen' ? 'mdi-volume-high' : kind === 'reading' ? 'mdi-syllabary-hiragana' : 'mdi-translate');
const missed = computed(() =>
  quiz.value.flatMap((q, i) => {
    const d = done.value[i];
    if (!d || d.correct) return [];
    return [{ q, picked: d.pickedId ? (q.options.find((o) => o.id === d.pickedId)?.label ?? '') : '' }];
  })
);

/* the speaker takes the colour of where the voice came from while the word is spoken, and a short note names it (lib/voiceBadge.ts) */
const speaking = ref(false);
const { badge: voiceBadge, text: voiceBadgeText, note: voiceNote } = useVoiceBadge(speaking);

function play(): void {
  const q = question.value;
  if (!q) return;
  speaking.value = true;
  speakJapanese(spoken(q.card), () => (speaking.value = false), job.value?.deckName ?? '', settings.autoSaveVoice);
}

/* The question on screen changed: a listening question is read aloud. Not in the very same moment: the sound device needs a short while to wake
   (and the voice of the answer before it to stop), otherwise the start of the first word is cut off. */
const LISTEN_DELAY_MS = 450;
function enter(): void {
  clearTimeout(playTimer);
  // the listening questions on screen and the next two are fetched now, so their voice is in hand (no wait, no stumble) when their turn comes
  for (const q of quiz.value.slice(index.value, index.value + 3)) {
    if (q.kind === 'listen') prefetchSpeech(spoken(q.card), job.value?.deckName ?? '', settings.autoSaveVoice);
  }
  if (question.value?.kind === 'listen') playTimer = setTimeout(play, LISTEN_DELAY_MS);
}

const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

async function load(): Promise<void> {
  const j = job.value;
  if (!j) return;
  phase.value = 'loading';
  waking.value = false;
  const wake = setTimeout(() => (waking.value = true), 2500); // a free server sleeps: say so instead of looking frozen
  try {
    const resuming = j.resumeId;
    // A paper over several decks has deck '*': its words (and the wrong answers) come from every deck.
    const [pool, saved] = await Promise.all([loadPool([j.deckId]), resuming ? api.testAnswers(resuming) : Promise.resolve(null)]);
    if (gone) return;
    if (saved && resuming) {
      /* Continue an unfinished test: its questions come back as they were made, from the first one not done. */
      const byId = new Map(pool.map((c) => [c.id, c]));
      const questions: QuizQuestion[] = [];
      const states: (Done | null)[] = [];
      for (const a of saved) {
        const q = a.word ? restoreQuestion({ n: a.n, kind: a.kind, wordId: a.word.id, options: a.options }, byId) : null;
        if (!q) continue; // a word of it has been removed from the dictionary since
        questions.push(q);
        states.push(a.answered ? { pickedId: a.picked?.id ?? null, correct: a.correct } : null);
      }
      if (questions.length === 0) {
        phase.value = 'empty';
        return;
      }
      sessionId.value = resuming;
      quiz.value = questions;
      done.value = states;
      picked.value = null;
      const first = states.findIndex((d) => d === null);
      if (first < 0) {
        index.value = questions.length - 1;
        void finish(); // everything was answered but the end was never sent
        return;
      }
      index.value = first;
      phase.value = 'asking';
      enter();
      return;
    }

    const matching = j.wordIds
      ? pool.filter((c) => j.wordIds!.includes(c.id))
      : pool.filter((c) => (j.tags.length === 0 || c.tags.some((tag) => j.tags.includes(tag))) && (j.statuses.length === 0 || j.statuses.includes(c.progress.status)));
    if (pool.length < 4) {
      phase.value = 'few';
      return;
    }
    if (matching.length === 0) {
      phase.value = 'empty';
      return;
    }
    /* Words last answered right in a finished test are not asked again. Not when testing the missed words of a test again, and a server
       that cannot answer does not stop the test: it is made without leaving anything out. */
    let known = new Set<string>();
    if (!j.wordIds) {
      try {
        known = new Set(await api.correctTestWords(j.deckId));
      } catch {
        /* asleep or offline: nothing is left out */
      }
      if (gone) return;
    }
    const source = matching.filter((c) => !known.has(c.id));
    leftOut.value = matching.length - source.length;
    if (source.length === 0) {
      phase.value = 'known';
      return;
    }
    const questions = buildQuiz(source, pool, { count: j.count, mode: j.kinds, kinds: j.kindList });
    if (questions.length === 0) {
      phase.value = j.kinds === 'listen' || j.kinds === 'reading' ? 'empty' : 'few'; // listening leaves out single kanji, reading the words with no reading of their own: nothing may be left
      return;
    }
    sessionId.value = newId();
    quiz.value = questions;
    done.value = questions.map(() => null);
    index.value = 0;
    picked.value = null;
    phase.value = 'asking';
    // The whole test goes to the server now, so it can be continued later (queued and resent if the server is asleep).
    void queueTestOp({
      op: 'create',
      body: {
        sessionId: sessionId.value,
        at: new Date().toISOString(),
        deckId: j.deckId,
        tags: j.tags,
        mode: j.kinds ?? 'mixed',
        questions: questions.map((q) => ({ wordId: q.card.id, kind: q.kind, options: q.options.map((o) => o.id) }))
      }
    });
    enter();
  } catch {
    if (!gone) phase.value = 'failed';
  } finally {
    clearTimeout(wake);
    waking.value = false;
  }
}

function answer(i: number): void {
  const q = question.value;
  if (!q || answered.value) return;
  picked.value = i;
  const correct = i === q.answerIndex; // i is -1 when the question is skipped: no answer, counted as missed
  const pickedId = i >= 0 ? q.options[i]!.id : null;
  done.value = done.value.map((d, k) => (k === index.value ? { pickedId, correct } : d));
  void queueTestOp({ op: 'answer', sessionId: sessionId.value, n: q.n, pickedId, at: new Date().toISOString() });
  if (!settings.testInstantCheck) timer = setTimeout(next, DEFER_NEXT_MS); // nothing is shown: straight on (the last one ends the test)
  else if (correct) timer = setTimeout(next, AUTO_NEXT_MS);
}

function next(): void {
  clearTimeout(timer);
  clearTimeout(playTimer);
  if (!answered.value) return;
  if (isLast.value) {
    void finish();
    return;
  }
  index.value++;
  picked.value = null;
  enter();
}

async function finish(): Promise<void> {
  clearTimeout(timer);
  clearTimeout(playTimer);
  stopSpeaking();
  phase.value = 'result';
  saveState.value = 'saving';
  const ok = await queueTestOp({ op: 'finish', sessionId: sessionId.value, at: new Date().toISOString() });
  if (!gone) saveState.value = ok ? 'saved' : 'queued';
}

/* "End the test" with questions left: the user is asked first (the app's own dialog). The questions left stay "not done", they are not counted as wrong. */
const endOpen = ref(false);
function endTest(): void {
  if (notDone.value > 0) endOpen.value = true;
  else void finish();
}
function confirmEnd(): void {
  endOpen.value = false;
  void finish();
}

async function sendNow(): Promise<void> {
  saveState.value = 'saving';
  const ok = await flushTests();
  if (!gone) saveState.value = ok ? 'saved' : 'queued';
}

/* The words missed: test them again here (a new test; the wrong answers still come from the whole deck), or study them. */
function testMissed(): void {
  const j = job.value;
  if (!j) return;
  const ids = missed.value.map((m) => m.q.card.id);
  job.value = { ...j, statuses: [], wordIds: ids, resumeId: undefined, count: Math.max(ids.length, 1) };
  void load();
}
function studyMissed(): void {
  const j = job.value;
  if (!j) return;
  pendingStart.value = { deckId: j.deckId, deckName: j.deckName, tags: [], statuses: [], wordIds: missed.value.map((m) => m.q.card.id) };
  void router.push('/study');
}

/* Nothing is lost by leaving: the test is already on the server, and can be continued from the list of tests. But the user is told it is in
   progress, for every way out (the X, the menu, the back arrow). */
const leaveOpen = ref(false);
let leaveAnswer: ((leave: boolean) => void) | null = null;
onBeforeRouteLeave(() => {
  if (phase.value !== 'asking') return true;
  // The question is asked in the app's own dialog; the navigation waits for the answer.
  return new Promise<boolean>((resolve) => {
    leaveAnswer = resolve;
    keepTest.value = true; // saved unless the box is unticked
    leaveOpen.value = true;
  });
});
/* Leave without keeping it: the test is deleted from the server (what was queued is sent first, so the session exists to be deleted). A failure
   leaves the test in the list of tests, where it can be deleted by hand. */
const keepTest = ref(true); // the box in the leave dialog: keep this test (continue it later), or leave and delete it
async function discard(): Promise<void> {
  const id = sessionId.value;
  if (!id) return;
  try {
    await flushTests();
    await api.deleteTest(id);
  } catch {
    /* it stays in the list of tests */
  }
}
function answerLeave(leave: boolean): void {
  leaveOpen.value = false;
  if (leave && !keepTest.value) void discard();
  leaveAnswer?.(leave);
  leaveAnswer = null;
}
function leave(): void {
  void router.push(phase.value === 'asking' ? '/tests' : '/');
}

void load();
</script>

<template>
  <TopBar :title="job?.deckName ?? t('nav.tests')">
    <v-btn icon="mdi-close" variant="text" :aria-label="t('test.leave')" :data-tip="t('test.leaveTip')" @click="leave" />
  </TopBar>

  <ConfirmDialog
    :model-value="leaveOpen"
    icon="mdi-progress-clock"
    confirm-icon="mdi-exit-run"
    cancel-icon="mdi-arrow-left"
    :title="t('test.leaveTitle')"
    :message="t('test.leaveWarn')"
    :confirm-label="t('test.leaveBtn')"
    :cancel-label="t('test.stay')"
    @confirm="answerLeave(true)"
    @cancel="answerLeave(false)"
  >
    <v-checkbox v-model="keepTest" :label="t('test.saveIt')" density="compact" hide-details color="primary" />
  </ConfirmDialog>

  <ConfirmDialog
    :model-value="endOpen"
    icon="mdi-flag-checkered"
    confirm-icon="mdi-flag-checkered"
    cancel-icon="mdi-arrow-left"
    :title="t('test.endTitle')"
    :message="t('test.endWarn', { n: notDone })"
    :confirm-label="t('test.endBtn')"
    :cancel-label="t('test.keepGoing')"
    @confirm="confirmEnd"
    @cancel="endOpen = false"
  />

  <v-container class="testpage" :style="textVars">
    <!-- loading / problems -->
    <div v-if="phase === 'loading'" class="center" role="status" aria-live="polite">
      <v-progress-circular indeterminate size="48" width="5" color="primary" />
      <div class="text-body-2 text-medium-emphasis">{{ waking ? t('deck.waking') : t('test.loading') }}</div>
    </div>
    <div v-else-if="phase === 'failed'" class="center">
      <v-icon icon="mdi-alert-circle-outline" size="44" color="error" />
      <div class="text-body-1">{{ t('err.load') }}</div>
      <v-btn color="primary" prepend-icon="mdi-refresh" :data-tip="t('tip.retry')" @click="load">{{ t('deck.retry') }}</v-btn>
    </div>
    <div v-else-if="phase === 'known'" class="center">
      <v-icon icon="mdi-check-decagram-outline" size="44" color="primary" />
      <div class="text-body-1">{{ t('test.allKnown') }}</div>
      <v-btn variant="tonal" prepend-icon="mdi-cards-outline" @click="router.push('/')">{{ t('test.toDecks') }}</v-btn>
    </div>
    <div v-else-if="phase === 'few' || phase === 'empty'" class="center">
      <v-icon icon="mdi-information-outline" size="44" color="warning" />
      <div class="text-body-1">{{ phase === 'few' ? t('test.tooFew') : t('test.empty') }}</div>
      <v-btn variant="tonal" prepend-icon="mdi-cards-outline" @click="router.push('/')">{{ t('test.toDecks') }}</v-btn>
    </div>

    <!-- a question -->
    <template v-else-if="phase === 'asking' && question">
      <div class="progress">
        <v-progress-linear :model-value="(100 * (index + (answered ? 1 : 0))) / total" height="6" rounded color="primary" bg-color="surface-variant" />
        <div class="count text-caption">{{ t('test.progress', { n: index + 1, total }) }}</div>
      </div>
      <div v-if="leftOut > 0" class="kinds text-caption text-medium-emphasis">
        <span><v-icon icon="mdi-check-decagram-outline" size="13" /> {{ t('test.leftOut', { n: leftOut }) }}</span>
      </div>

      <div class="paper-card qcard">
        <div class="ask">{{ question.kind === 'listen' ? t('test.askListen') : question.kind === 'reading' ? t('test.askReading') : t('test.askMeaning') }}</div>
        <template v-if="question.kind !== 'listen'">
          <div v-fit-line.always class="qword jp">{{ question.card.headword }}</div>
          <div v-if="question.kind === 'meaning' && settings.showReading && question.card.reading" class="qreading jp"><ReadingText :reading="question.card.reading" /></div>
          <!-- show / hide the reading of this word (hiragana, or On / Kun for a kanji): the same switch as the あ option of the study screen, bottom left -->
          <button v-if="question.kind === 'meaning' && question.card.reading" type="button" class="kanabtn" :class="{ on: settings.showReading }" :aria-pressed="settings.showReading" :aria-label="t('show.reading')" :data-tip="t('show.reading')" @click="settings.showReading = !settings.showReading">あ</button>
        </template>
        <button v-else type="button" class="speak" :class="[speaking && voiceBadge ? 'src-' + voiceBadge.source : '', { 'spk-playing': speaking }]" :title="speaking && voiceBadge ? voiceBadgeText : undefined" :aria-label="t('test.replay')" :data-tip="t('test.replay')" @click="play">
          <v-icon icon="mdi-volume-high" size="30" />
        </button>
        <span v-if="question.kind === 'listen' && voiceNote" class="voicenote" role="status">{{ voiceNote }}</span>
      </div>

      <div class="options" role="group">
        <button
          v-for="(o, i) in question.options"
          :key="o.id"
          type="button"
          class="opt"
          :class="[`c${i}`, { jp: question.kind !== 'meaning', right: reveal && i === question.answerIndex, bad: reveal && i === picked && i !== question.answerIndex, dim: reveal && i !== picked && i !== question.answerIndex, chosen: answered && !reveal && i === picked, done: answered }]"
          :aria-disabled="answered"
          @click="answer(i)"
        >
          <span class="ofit"><span v-fit-line.always class="otext">{{ o.label }}</span></span>
          <v-icon v-if="reveal && i === question.answerIndex" icon="mdi-check-circle" size="20" class="mark" />
          <v-icon v-else-if="reveal && i === picked" icon="mdi-close-circle" size="20" class="mark" />
          <v-icon v-else-if="answered && !reveal && i === picked" icon="mdi-checkbox-marked" size="28" class="mark picked" />
        </button>
      </div>
      <div v-if="!answered" class="skiprow">
        <v-btn variant="tonal" color="info" prepend-icon="mdi-skip-next" :data-tip="t('test.skipTip')" @click="answer(-1)">{{ t('btn.skip') }}</v-btn>
        <v-btn variant="tonal" color="warning" prepend-icon="mdi-flag-checkered" :data-tip="t('test.endTip')" @click="endTest">{{ t('test.endTest') }}</v-btn>
      </div>

      <!-- after the answer: what the word is (the right answer when it was missed) -->
      <div v-if="reveal" class="paper-card feedback" :class="{ ok: picked === question.answerIndex }" role="status" aria-live="polite">
        <div class="verdict">
          <v-icon :icon="picked === question.answerIndex ? 'mdi-check-circle' : picked === -1 ? 'mdi-skip-next-circle' : 'mdi-close-circle'" size="20" />
          {{ picked === question.answerIndex ? t('test.right') : picked === -1 ? t('test.skipped') : t('test.wrong') }}
        </div>
        <div class="fword jp">{{ question.card.headword }}</div>
        <div v-if="question.card.reading" class="freading jp">{{ question.card.reading }}</div>
        <div class="fmeaning">{{ question.card.meaning }}</div>
        <v-btn block color="primary" size="large" class="mt-3" :append-icon="isLast ? 'mdi-flag-checkered' : 'mdi-arrow-right'" @click="next">{{ isLast ? t('test.finish') : t('test.next') }}</v-btn>
      </div>
    </template>

    <!-- the result -->
    <template v-else-if="phase === 'result'">
      <div class="paper-card scorecard">
        <div class="bigscore" :class="{ perfect: right === total }">{{ t('test.score', { correct: right, total: answeredCount }) }}</div>
        <div v-if="right === total" class="text-body-1">{{ t('test.perfect') }}</div>
        <div class="bykind text-body-2">
          <span v-for="k in byKind" :key="k.kind"><v-icon :icon="kindIcon(k.kind)" size="15" /> {{ kindLabel(k.kind) }} {{ t('test.score', { correct: k.right, total: k.answered }) }}</span>
        </div>
        <div v-if="notDone > 0" class="text-caption text-medium-emphasis">{{ t('test.notDone', { n: notDone }) }}</div>
        <div class="savestate text-caption" :class="saveState">
          <template v-if="saveState === 'saving'"><v-progress-circular indeterminate size="12" width="2" /> {{ t('test.saving') }}</template>
          <template v-else-if="saveState === 'saved'"><v-icon icon="mdi-cloud-check-outline" size="14" /> {{ t('test.saved') }}</template>
          <template v-else>
            <v-icon icon="mdi-cloud-alert-outline" size="14" /> {{ t('test.queued') }}
            <v-btn size="x-small" variant="tonal" class="ml-2" @click="sendNow">{{ t('test.sendNow') }}</v-btn>
          </template>
        </div>
      </div>

      <!-- what to do next sits right under the score (the list of missed words can be long); on a phone only the icons show -->
      <div class="actions resultacts">
        <v-btn v-if="missed.length" class="rbtn" color="primary" prepend-icon="mdi-school-outline" :aria-label="t('test.again')" :data-tip="t('test.again')" @click="testMissed"><span class="lbl">{{ t('test.again') }}</span></v-btn>
        <v-btn v-if="missed.length && job?.deckId !== ANY_DECK" class="rbtn" variant="tonal" prepend-icon="mdi-cards-outline" :aria-label="t('test.study')" :data-tip="t('test.study')" @click="studyMissed"><span class="lbl">{{ t('test.study') }}</span></v-btn>
        <v-btn class="rbtn" variant="tonal" color="info" prepend-icon="mdi-history" :aria-label="t('test.history')" :data-tip="t('tip.history')" @click="router.push('/tests')"><span class="lbl">{{ t('test.history') }}</span></v-btn>
        <v-btn class="rbtn" variant="tonal" prepend-icon="mdi-arrow-left" :aria-label="t('test.toDecks')" :data-tip="t('test.toDecks')" @click="router.push('/')"><span class="lbl">{{ t('test.toDecks') }}</span></v-btn>
      </div>

      <template v-if="missed.length">
        <div class="label"><v-icon icon="mdi-close-circle-outline" size="14" />{{ t('test.missed') }} ({{ missed.length }})</div>
        <div class="missed">
          <div v-for="m in missed" :key="m.q.card.id" class="paper-card mrow">
            <div v-fit-line.always class="jp mword">{{ m.q.card.headword }}<span v-if="m.q.card.reading" class="mreading">{{ m.q.card.reading }}</span></div>
            <div v-fit-line.always class="mmeaning"><span v-if="settings.showHanViet && m.q.card.hanviet" class="mhv">{{ m.q.card.hanviet }}</span>{{ meaningLabel(m.q.card) }}</div>
            <div class="mpicked text-caption text-medium-emphasis"><v-icon icon="mdi-close-circle" size="13" color="error" /> {{ t('test.picked', { word: m.picked || t('test.noAnswer') }) }}</div>
          </div>
        </div>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.testpage {
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-inline: 12px;
  padding-top: 8px;
  padding-bottom: 24px;
}
.center {
  min-height: calc(100dvh - 120px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
}
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
.progress .v-progress-linear {
  flex: 1;
}
.kinds {
  display: flex;
  gap: 14px;
  margin-top: -4px;
}
.skiprow {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 4px; /* room for the pressed-in edge of the buttons */
}
.bykind {
  display: flex;
  gap: 14px;
  justify-content: center;
  color: var(--forest);
}
.count {
  flex: 0 0 auto;
  color: var(--forest);
  font-variant-numeric: tabular-nums;
}
.qcard {
  position: relative;
  padding: 18px 16px;
  text-align: center;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.kanabtn {
  position: absolute;
  bottom: 8px;
  left: 8px;
  width: 30px;
  height: 30px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 1.5px dashed #3f8a1f; /* off: an empty dashed disc, like the option of the study screen */
  background: var(--paper);
  color: #3f8a1f;
  font-family: var(--font-jp);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.35);
  transition: transform 0.1s, box-shadow 0.1s, background 0.12s;
}
.kanabtn.on {
  border-style: solid; /* on: filled with its own colour */
  background: #3f8a1f;
  color: #fff;
}
.kanabtn:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 transparent;
}
.kanabtn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .kanabtn:hover {
    transform: translateY(1px);
    box-shadow: 0 1px 0 rgba(31, 77, 36, 0.35);
  }
  .kanabtn:not(.on):hover {
    background: #d4f5c2; /* pale mint under the mouse, like the round buttons of the card */
  }
}
.ask {
  font-size: var(--s-tAsk, 12px);
  font-style: var(--i-tAsk, normal);
  color: var(--c-tAsk, #757575);
}
.qword {
  font-size: var(--s-tWord, 35.2px);
  font-style: var(--i-tWord, normal);
  line-height: 1.25;
  font-weight: 700;
  color: var(--c-tWord, var(--headword));
  overflow-wrap: anywhere;
}
.qreading {
  font-size: var(--s-tReading, 16.8px);
  font-style: var(--i-tReading, normal);
  color: var(--c-tReading, var(--forest));
}
/* the speaker: the green round button, like the play button of a deck but bigger */
.speak {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 0;
  background: rgb(var(--v-theme-primary));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 3px 0 #3f8a1f;
  transition: transform 0.1s, box-shadow 0.1s, background 0.12s;
}
.speak:active {
  transform: translateY(3px);
  box-shadow: 0 0 0 transparent;
}
/* the colour of the voice source while the word is spoken (the same colours as the read-aloud button of the study screen) */
.speak.src-browser,
.speak.src-browser-other {
  background: #8e4ec6; /* the browser's own cache */
}
.speak.src-file {
  background: #1a9c9c; /* a voice file shipped with the app */
}
.speak.src-server-memory,
.speak.src-server-file,
.speak.src-server {
  background: #2f80d1; /* from the server, no charge */
}
.speak.src-elevenlabs {
  background: #ef8a17; /* a paid ElevenLabs call */
}
.speak.src-google {
  background: #4285f4; /* a paid Google Cloud TTS call */
}
.speak.src-device {
  background: #7a7a7a; /* the device's own voice */
}
/* While the word is being read the speaker pulses: the button reads as "playing" (a tap reads it again). */
@keyframes speak-pulse {
  0%, 100% { transform: scale(1); }
  35% { transform: scale(1.16); }
  70% { transform: scale(0.97); }
}
.speak.spk-playing .v-icon {
  animation: speak-pulse 0.9s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .speak.spk-playing .v-icon { animation: none; }
}
.voicenote {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 0.7rem;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
}
@media (hover: hover) and (pointer: fine) {
  .speak:not([class*='src-']):hover {
    background: #7fd14a;
    transform: translateY(1px);
    box-shadow: 0 2px 0 #3f8a1f;
  }
}
.options {
  display: flex;
  flex-direction: column;
  gap: 10px; /* room for the pressed-in edge under each answer */
}
.opt {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 13px 14px;
  border: 2px solid var(--paper-edge);
  border-radius: 12px;
  background: var(--paper);
  color: var(--c-tAnswer, inherit);
  text-align: start;
  font-size: var(--s-tAnswer, 17.6px);
  font-style: var(--i-tAnswer, normal);
  line-height: 1.35;
  cursor: pointer;
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.3);
  transition: transform 0.1s, box-shadow 0.1s, border-color 0.15s, background 0.15s, opacity 0.15s;
}
.opt.jp {
  font-size: var(--s-tAnswerJp, 23.2px);
  font-style: var(--i-tAnswerJp, normal);
  color: var(--c-tAnswerJp, inherit);
}
.opt .ofit {
  flex: 1 1 0;
  min-width: 0; /* the room an answer is fitted to (v-fit-line): the button without the tick; the answer stays on ONE line, zoomed out when it is wider */
}
.opt .otext {
  display: inline-block; /* zoom (v-fit-line) needs a box */
  overflow-wrap: normal;
  letter-spacing: normal;
  text-transform: none; /* not the small-caps look of the .label class */
}
.opt:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.opt:active:not(.done) {
  transform: translateY(4px); /* pressed all the way down */
  box-shadow: 0 0 0 transparent;
}
/* the four answers each have a colour of their own (orange, blue, purple, teal; green and red are kept for right and wrong) */
.opt.c0 {
  --tint: #ef8a17;
}
.opt.c1 {
  --tint: #2f80d1;
}
.opt.c2 {
  --tint: #8e4ec6;
}
.opt.c3 {
  --tint: #1aa6a6;
}
.opt.c0,
.opt.c1,
.opt.c2,
.opt.c3 {
  border-color: color-mix(in srgb, var(--tint, var(--paper-edge)) 45%, var(--paper-edge));
  background: color-mix(in srgb, var(--tint, transparent) 14%, var(--paper));
  box-shadow: 0 4px 0 color-mix(in srgb, var(--tint) 70%, #000); /* a 3D edge in the answer's own, darker colour */
}
@media (hover: hover) and (pointer: fine) {
  .opt:hover:not(.done) {
    border-color: color-mix(in srgb, var(--tint, rgb(var(--v-theme-primary))) 80%, transparent);
    background: color-mix(in srgb, var(--tint, rgb(var(--v-theme-primary))) 26%, var(--paper));
    transform: translateY(2px); /* half way down under the mouse, like the other 3D buttons */
    box-shadow: 0 2px 0 color-mix(in srgb, var(--tint, rgb(var(--v-theme-primary))) 70%, #000);
  }
}
.opt.done {
  cursor: default;
  box-shadow: none;
}
.opt.right {
  border-color: rgb(var(--v-theme-primary));
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 22%, var(--paper));
}
.opt.bad {
  border-color: #d9534f;
  background: color-mix(in srgb, #d9534f 20%, var(--paper));
}
.opt.chosen {
  border-color: rgb(var(--v-theme-primary)); /* marking at the end: only "this is the one you picked"; the square tick tells it from right/wrong */
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 12%, var(--paper));
  animation: opt-pick 0.28s ease-out;
}
.opt .mark.picked {
  color: rgb(var(--v-theme-primary)); /* the green of the buttons */
  animation: opt-tick 0.3s cubic-bezier(0.2, 1.6, 0.4, 1);
}
@keyframes opt-pick {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.03);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes opt-tick {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .opt.chosen,
  .opt .mark.picked {
    animation: none;
  }
}
.opt.dim {
  opacity: 0.55;
}
.opt .mark {
  flex: 0 0 auto;
}
.opt.right .mark {
  color: rgb(var(--v-theme-primary));
}
.opt.bad .mark {
  color: #d9534f;
}
.feedback {
  padding: 14px 16px;
  border-left: 4px solid #d9534f;
}
.feedback.ok {
  border-left-color: rgb(var(--v-theme-primary));
}
.verdict {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #d9534f;
}
.feedback.ok .verdict {
  color: rgb(var(--v-theme-primary));
}
.fword {
  margin-top: 6px;
  font-size: var(--s-tFbWord, 24px);
  font-style: var(--i-tFbWord, normal);
  font-weight: 700;
  color: var(--c-tFbWord, var(--headword));
  overflow-wrap: anywhere;
}
.freading {
  font-size: var(--s-tFbReading, 16px);
  font-style: var(--i-tFbReading, normal);
  color: var(--c-tFbReading, var(--forest));
}
.fmeaning {
  margin-top: 4px;
  font-size: var(--s-tFbMeaning, 16px);
  font-style: var(--i-tFbMeaning, normal);
  color: var(--c-tFbMeaning, inherit);
  white-space: pre-line;
}
.scorecard {
  padding: 22px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.bigscore {
  font-size: 3rem;
  font-weight: 800;
  line-height: 1.1;
  color: var(--forest);
  font-variant-numeric: tabular-nums;
}
.bigscore.perfect {
  color: rgb(var(--v-theme-primary));
}
.savestate {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--forest);
}
.savestate.queued {
  color: #b8600f;
}
.missed {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mrow {
  padding: 10px 14px;
  border-left: 4px solid #d9534f; /* a missed word: red edge, like the wrong card after an answer */
}
.resultacts {
  margin-top: 2px;
}
/* phone: the buttons under the score show only their icons (names stay as labels and tooltips) */
@media (max-width: 600px) {
  .rbtn {
    min-width: 52px;
    padding: 0 14px;
  }
  .rbtn .lbl {
    display: none;
  }
  .rbtn :deep(.v-btn__prepend) {
    margin-inline: 0;
  }
}
.mword {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--headword);
}
.mreading {
  margin-left: 0.6em; /* air between the headword and its reading (On / Kun) */
  font-size: 0.9rem;
  font-weight: 400;
  color: var(--forest);
}
.mhv {
  margin-right: 0.5em; /* Sino-Vietnamese and the meaning share one line */
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--hv);
}
.mmeaning {
  margin-top: 2px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
</style>
