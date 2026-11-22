<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, pendingResults, serverInfo, submitResult } from '../api';
import { auth } from '../auth';
import { t } from '../i18n';
import Hanko from '../components/Hanko.vue';
import KanjiSheet from '../components/KanjiSheet.vue';
import PitchLine from '../components/PitchLine.vue';
import RelatedDialog from '../components/RelatedDialog.vue';
import RubyWord from '../components/RubyWord.vue';
import TopBar from '../components/TopBar.vue';
import WordListSheet from '../components/WordListSheet.vue';
import { detailOf, ensureDetails } from '../lib/cardDetail';
import { parseNote, type RelatedWord } from '../lib/note';
import { swipeDown } from '../lib/swipeDown';
import { canSpeak, prefetchSpeech, speakJapanese, stopSpeaking, voiceSource, type VoiceOrigin, type VoiceSource } from '../lib/speech';
import { cardTextVars } from '../cardText';
import { vFitLine } from '../lib/fitLine';
import { StudySession } from '../session';
import { settings } from '../settings';
import { activeSession, focusMode, saveRun, setActiveSession, setFocusMode } from '../store';
import type { Card, Deck, KanjiInfo, StudyResult } from '../types';

const router = useRouter();
const route = useRoute();
/* Start on a deck with nothing to study sends the deck here: this screen then shows "Deck finished" for it. */
const finishedDeckId = typeof route.query.finished === 'string' ? route.query.finished : '';
const hasSession = activeSession.value !== null;
// Without a session (opened from the menu) the screen only shows an empty state; this stays inert.
/* Every step of the run (answer, jump, flip) is written down, so a reload brings the run back where it was. */
const runMark = (): string => `${s.queue.length}:${s.queue[0]?.id}:${s.learned}:${s.again}:${s.skipped}:${s.flipped}`;
const s = reactive(activeSession.value ?? new StudySession([], { reverse: false, showReading: false })) as StudySession;
watch(runMark, saveRun);

const pending = ref(pendingResults());
const related = ref<RelatedWord | null>(null);
const kanjiSel = ref<string | null>(null);
const detailOpen = ref(false);
const listOpen = ref(false); // the list of all words of this run (opened from the 1 / N counter)
/* On a touch screen (phone, tablet) the Notes stay folded until tapped; with a mouse there is room, so they always show. */
const touchOnly = typeof window !== 'undefined' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const notesOpen = ref(false);
const speaking = ref(false);
/* The eye button fans out three options (what to show on the card; each is also a switch in Settings, so a change here is saved there); any tap elsewhere folds them back. */
const fanOpen = ref(false);
const fanOptions = computed(() => [
  { key: 'reading', glyph: 'あ', label: t('show.reading'), on: s.showReading, dx: 0, dy: -62, toggle: () => (settings.showReading = s.showReading = !s.showReading) },
  { key: 'meaning', glyph: 'V', full: 'Vi', label: t('show.meaning'), on: settings.showMeaning, dx: 31, dy: -54, toggle: () => (settings.showMeaning = !settings.showMeaning) },
  { key: 'english', glyph: 'E', full: 'En', label: t('show.english'), on: settings.showEnglish, dx: 54, dy: -31, toggle: () => (settings.showEnglish = !settings.showEnglish) },
  { key: 'hanviet', glyph: '漢', label: t('show.hanviet'), on: settings.showHanViet, dx: 62, dy: 0, toggle: () => (settings.showHanViet = !settings.showHanViet) }
]);
const foldFan = (): void => {
  fanOpen.value = false;
  audioOpen.value = false;
};
/* The bottom-right button fans out three options: auto play, read aloud while auto playing, keep the voice files
   (the last one only when the server can save files: a local run with SPEECH_SAVE_DIR; elsewhere it is hidden). */
const audioOpen = ref(false);
const audioOptions = computed(() =>
  [
  { key: 'auto', icon: autoplay.value ? 'mdi-pause' : 'mdi-play', label: autoplay.value ? t('auto.pause') : t('auto.play'), on: autoplay.value, dx: 0, dy: -62, run: autoToggle },
  { key: 'sound', icon: settings.autoSpeak ? 'mdi-volume-high' : 'mdi-volume-off', label: t('set.autoSpeak'), on: settings.autoSpeak, dx: -44, dy: -44, run: () => (settings.autoSpeak = !settings.autoSpeak) },
  { key: 'save', icon: settings.autoSaveVoice ? 'mdi-content-save' : 'mdi-content-save-off-outline', label: t('set.autoSaveVoice'), on: settings.autoSaveVoice, dx: -62, dy: 0, run: () => (settings.autoSaveVoice = !settings.autoSaveVoice) }
  ].filter((o) => o.key !== 'save' || serverInfo.saveVoice)
);
/* The button is green only while all three options are on; any option off turns it orange. */
const audioAllOn = computed(() => audioOptions.value.every((o) => o.on));
watch(fanOpen, (isOpen) => isOpen && (audioOpen.value = false));
watch(audioOpen, (isOpen) => isOpen && (fanOpen.value = false));
watch([fanOpen, audioOpen], ([eye, audio]) => {
  if (eye || audio) setTimeout(() => window.addEventListener('click', foldFan, { once: true }), 0);
  else window.removeEventListener('click', foldFan);
});
const stamping = ref(false); // the "習" seal is being pressed onto the card

/* The card = what came with the deck + its heavy part (furigana, pitch, kanji, note) once that has been fetched. */
const card = computed<Card | undefined>(() => {
  const c = s.current;
  if (!c) return undefined;
  const d = detailOf(c.id);
  return { ...c, english: d?.english ?? null, note: d?.note ?? null, ruby: d?.ruby ?? null, pitch: d?.pitch ?? null, kanji: d?.kanji ?? [] };
});
/* Fetch the detail of this card, the next few and the one before it (swiping back), so swiping stays instant. */
function prefetch(): void {
  const q = s.queue;
  const last = q[q.length - 1];
  void ensureDetails([...q.slice(0, 6), ...(last ? [last] : [])].map((c) => c.id));
}
watch(() => s.current?.id, prefetch, { immediate: true });
/* The reading is NEVER shown on its own (not even after the flip): only the kanji, until the eye button is tapped. */
const readingVisible = computed(() => s.showReading);
const useRuby = computed(() => !s.reverse && !!card.value?.ruby && readingVisible.value);
const noteLines = computed(() => parseNote(card.value?.note));
const plainNotes = computed(() => noteLines.value.filter((l) => !l.related));
const relatedLines = computed(() => noteLines.value.filter((l) => !!l.related));
const textVars = computed(() => cardTextVars(settings.cardText)); // --s-<text> (size) and --c-<text> (colour) for every text on the card
const scale = computed(() => JSON.stringify(settings.cardText)); // changes whenever a size changes: the Notes re-fit

/* On a touch screen the Notes are folded, but they open by themselves when the Details still fit without scrolling:
   open them, let the layout settle (before anything is painted), and fold them again if the Details now overflow.
   Folded again on every new card and every time the back is opened; a tap on the toggle wins until then. */
let notesTouched = false;
async function fitNotes(): Promise<void> {
  if (!touchOnly || notesTouched || !detailOpen.value || plainNotes.value.length === 0) return;
  notesOpen.value = true;
  await nextTick();
  const el = detailEl.value;
  if (el && el.scrollHeight > el.clientHeight + 1) notesOpen.value = false;
}
function toggleNotes(): void {
  notesTouched = true;
  notesOpen.value = !notesOpen.value;
}
/* The details side stays open from word to word; a word with nothing to show there goes back to the front. */
watch(() => card.value?.id, () => {
  if (detailOpen.value && !hasDetail.value) detailOpen.value = false;
});
watch([() => card.value?.id, detailOpen], () => {
  notesOpen.value = false;
  notesTouched = false;
  void fitNotes();
});
watch([() => plainNotes.value.length, scale], () => void fitNotes()); // the Details finished loading, or the text size changed

/* Sino-Vietnamese sounds paired with their Han characters (香 HƯƠNG), one per row in the Details. */
const hanvietOn = computed(() => settings.showHanViet && !!card.value?.hanviet);
const hasHanViet = computed(() => (card.value?.kanji ?? []).some((k) => !!k.HanViet));
/* What a kanji means, shown to the right of its Sino-Vietnamese sound: Vietnamese first, English when there is none. */
function kanjiMeaning(k: KanjiInfo): string {
  const list = k.MeaningsVi.length ? k.MeaningsVi : k.MeaningsEn;
  return list.slice(0, 2).join('; ');
}

/* Step 3 (the "Chi tiết" sheet) only exists when the card has something beyond the word and its meaning. */
const hasDetail = computed(() => {
  const c = card.value;
  return !!c && (!!c.hanviet || !!c.english || !!c.example || !!c.pos || !!c.pitch || c.kanji.length > 0 || noteLines.value.length > 0);
});

/* Speaking: normal mode reads the front word; reverse mode only after the flip (does not give the answer away). */
/*
 * Hán Việt and the Vietnamese meaning follow the switches (the eye menu / Settings): when ON they are on the card straight away,
 * like the hiragana; no tap is needed to show them. So in Japanese -> Vietnamese mode the answer counts as already shown
 * (a tap goes straight to the Details) as soon as either of them is on.
 */
const englishOn = computed(() => settings.showEnglish && !!card.value?.english);
const answerShown = computed(() => s.flipped || (!s.reverse && (settings.showMeaning || hanvietOn.value || englishOn.value)));
const canSpeakNow = computed(() => canSpeak() && !!card.value && card.value.lang === 'ja' && (!s.reverse || s.flipped));

/* Where the word that is being spoken came from (browser cache, a saved file, the server's memory or disk, a paid ElevenLabs call, the device): the read-aloud button takes a colour for it while it plays (the text is its tooltip). */
const voiceBadge = ref<{ source: VoiceSource; origin?: VoiceOrigin } | null>(null);
const voiceBadgeText = computed(() => {
  const b = voiceBadge.value;
  return b ? t(`voice.${b.source}`) + (b.origin ? ` · ${t(`voice.${b.origin}`)}` : '') : ''; // "Browser cache · Saved file": it was fetched ahead from a saved file
});
watch(voiceSource, (heard) => {
  if (heard) voiceBadge.value = { source: heard.source, origin: heard.origin };
});
watch(speaking, (isSpeaking) => !isSpeaking && (voiceBadge.value = null)); // the word is finished: the button turns back to its usual colour

function speak(): void {
  const c = card.value;
  if (!c) return;
  if (speaking.value) {
    stopSpeaking();
    speaking.value = false;
    return;
  }
  speaking.value = true;
  speakJapanese(c.reading || c.headword, () => (speaking.value = false), s.deckName);
}

function flip(): void {
  autoStop();
  stopSpeaking();
  speaking.value = false;
  s.flip();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* Swipe left = next word, swipe right = previous word (browsing only, nothing is graded); swipe up = Details. */
/* Opening the details also reveals the answer side, so the card is already flipped when the sheet is closed. */
function openDetail(): void {
  autoStop();
  if (!hasDetail.value) return;
  if (!s.flipped) s.flip();
  detailOpen.value = true;
}

/* Text on the card can be selected and copied; the click or swipe that only ended a selection must not flip or browse. */
const hasSelection = (): boolean => !!window.getSelection()?.toString();

/* Tap the card: the first tap shows the answer, the next tap opens the Details (when the card has any). */
function tapCard(): void {
  if (swallowClick || hasSelection()) return;
  if (!answerShown.value) flip();
  else openDetail();
}

const detailEl = ref<HTMLElement | null>(null);
const detailSwipe = swipeDown(() => (detailOpen.value = false), () => detailEl.value); // drag the sheet down to close it

const slide = ref<'slide-next' | 'slide-prev'>('slide-next');
let startX = 0;
let startY = 0;

function browse(direction: 'next' | 'previous'): void {
  autoStop();
  if (stamping.value) return;
  slide.value = direction === 'next' ? 'slide-next' : 'slide-prev';
  stopSpeaking();
  speaking.value = false;
  const side = s.flipped; // the next word opens on the side that is showing now (front, answer or details)
  if (direction === 'next') s.next();
  else s.previous();
  s.flipped = side;
}

function touchStart(e: TouchEvent): void {
  startX = e.changedTouches[0]?.clientX ?? 0;
  startY = e.changedTouches[0]?.clientY ?? 0;
}

function touchEnd(e: TouchEvent): void {
  gesture((e.changedTouches[0]?.clientX ?? 0) - startX, (e.changedTouches[0]?.clientY ?? 0) - startY);
}

/* The same gestures with a mouse: press on the card, drag sideways (or up), release. */
/* Web only: devices whose main pointer is touch ignore these (they swipe, and their emulated mouse events do nothing). */
const hasMouse = (): boolean => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function mouseDown(e: MouseEvent): void {
  if (e.button !== 0 || !hasMouse()) return;
  startX = e.clientX;
  startY = e.clientY;
}

function mouseUp(e: MouseEvent): void {
  if (e.button !== 0 || !hasMouse()) return;
  gesture(e.clientX - startX, e.clientY - startY);
}

/* A drag ends with a click on the card; that click must not also flip it. */
let swallowClick = false;

function gesture(dx: number, dy: number): void {
  if (hasSelection()) return; // dragging over the text selects it
  // Swipe up: show the Details (whenever the card has details; it also shows the answer side).
  if (dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    openDetail();
    return;
  }

  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // mostly horizontal and long enough
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 0);
  browse(dx < 0 ? 'next' : 'previous');
}

/* Tapped a word in the list: show that card (when it is still in the deck) and close the list. */
function pickWord(id: string): void {
  autoStop();
  listOpen.value = false;
  if (stamping.value || id === s.current?.id) return;
  slide.value = 'slide-next';
  stopSpeaking();
  speaking.value = false;
  const side = s.flipped;
  s.jumpTo(id);
  s.flipped = side;
}

async function answer(result: StudyResult): Promise<void> {
  autoStop();
  if (stamping.value) return; // one answer at a time while the seal is pressing
  if (result === 'learned') {
    stamping.value = true;
    await sleep(650); // let the seal land before the next card replaces this one
    stamping.value = false;
  }
  slide.value = 'slide-next';
  const side = s.flipped;
  const answered = s.answer(result);
  if (!s.finished) s.flipped = side; // the next word keeps the side that was showing
  else detailOpen.value = false;
  stopSpeaking();
  speaking.value = false;
  if (!answered) return;
  await submitResult(answered.id, result);
  pending.value = pendingResults();
}

function retryAgain(): void {
  const cards = s.againCards;
  if (cards.length === 0) return;
  setActiveSession(new StudySession(cards, { reverse: s.reverse, showReading: settings.showReading, deckName: s.deckName, tags: [...s.tags] }));
  void router.replace('/').then(() => router.push('/study'));
}

/* The card stays turned over under these popups, so closing them returns to the details. */
function openRelated(r: RelatedWord): void {
  related.value = r;
}

function openKanji(literal: string): void {
  kanjiSel.value = literal;
}

/*
 * Auto play: the front of a card stays autoFrontSec, then the answer side autoBackSec, then the next card - one pass over the
 * cards that are left, then it stops. It only browses: nothing is graded and the progress is not touched. Any tap, swipe, key,
 * the list or a popup stops it (those go through flip / browse / openDetail / answer / pickWord, which call autoStop).
 */
const autoplay = ref(false);
const autoDone = ref(false); // shows the "finished" message
let autoToken = 0; // a run only goes on while its token is the current one
let autoTimer: ReturnType<typeof setTimeout> | undefined;
type WakeLock = { release: () => Promise<void> };
let wakeLock: WakeLock | null = null;

const autoPause = (seconds: number): Promise<void> =>
  new Promise((resolve) => {
    autoTimer = setTimeout(resolve, seconds * 1000);
  });

/* Reads the word and resolves when the voice has finished (never waits for ever on a voice that does not answer). */
function autoSpeakWord(): Promise<void> {
  const c = card.value;
  if (!settings.autoSpeak || !c || !canSpeakNow.value) return Promise.resolve();
  return new Promise((resolve) => {
    speaking.value = true;
    const guard = setTimeout(resolve, 10_000);
    speakJapanese(
      c.reading || c.headword,
      () => {
        clearTimeout(guard);
        speaking.value = false;
        resolve();
      },
      s.deckName,
      settings.autoSaveVoice
    );
  });
}

async function acquireWakeLock(): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null; // the phone keeps the screen on while it plays
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release();
  } catch {
    /* already released */
  }
  wakeLock = null;
}

async function autoRun(token: number): Promise<void> {
  let left = s.queue.length;
  while (token === autoToken && left > 0 && !s.finished) {
    const upcoming = s.queue[1]; // the next word's voice is fetched while this card is on screen
    if (settings.autoSpeak && upcoming?.lang === 'ja') prefetchSpeech(upcoming.reading || upcoming.headword, s.deckName, settings.autoSaveVoice);
    if (s.flipped) s.flip(); // the front of the card (the session itself, not flip(): that one would stop the auto play)
    detailOpen.value = false;
    await Promise.all([autoPause(settings.autoFrontSec), s.reverse ? Promise.resolve() : autoSpeakWord()]);
    if (token !== autoToken) return;
    s.flip(); // the answer side
    await Promise.all([autoPause(settings.autoBackSec), s.reverse ? autoSpeakWord() : Promise.resolve()]);
    if (token !== autoToken) return;
    left--;
    if (left <= 0) break;
    slide.value = 'slide-next';
    s.next();
  }
  if (token !== autoToken) return;
  autoplay.value = false; // one pass is done
  autoDone.value = true;
  stopSpeaking();
  speaking.value = false;
  void releaseWakeLock();
}

function autoStart(): void {
  if (autoplay.value || !hasSession || s.finished) return;
  autoplay.value = true;
  autoDone.value = false;
  detailOpen.value = false;
  void acquireWakeLock();
  void autoRun(++autoToken);
}

function autoStop(): void {
  if (!autoplay.value) return;
  autoToken++; // the running loop notices and quits
  clearTimeout(autoTimer);
  autoplay.value = false;
  stopSpeaking();
  speaking.value = false;
  void releaseWakeLock();
}

const autoToggle = (): void => (autoplay.value ? autoStop() : autoStart());
watch([listOpen, kanjiSel, related], () => autoStop()); // a popup over the card pauses it

function onKey(e: KeyboardEvent): void {
  if (!hasSession || s.finished) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    flip();
  } else if (e.key === 'ArrowUp') openDetail();
  else if (e.key === 'ArrowRight') browse('next');
  else if (e.key === 'ArrowLeft') browse('previous');
  else if (e.key === '1') void answer('again');
  else if (e.key === '2') void answer('learned');
  else if (e.key.toLowerCase() === 'a') autoToggle();
  else if (e.key.toLowerCase() === 'p' && canSpeakNow.value) speak();
}

const onResize = (): void => void fitNotes(); // a rotated or resized screen may give the Notes room, or take it away
/* No run in memory (opened from the menu, the page was reloaded, or the picked deck had nothing left to study): instead of an
   empty screen show the deck that was picked last - its progress and counts - with the way to the deck screen. */
const infoDeck = ref<Deck | null>(null);
const infoLoading = ref(false);
async function loadInfoDeck(): Promise<void> {
  infoLoading.value = true;
  try {
    const decks = await api.decks();
    let id: unknown = null;
    try {
      id = (JSON.parse(localStorage.getItem(`flashmobile.deckPick.${auth.user ?? ''}`) ?? 'null') as { deckId?: unknown } | null)?.deckId;
    } catch {
      /* no remembered pick */
    }
    // the deck studied last; none studied yet (or it is gone): the first deck, so this screen is not empty (a deck that was just finished is never replaced)
    infoDeck.value = decks.find((d) => d.id === (finishedDeckId || id)) ?? (finishedDeckId ? null : (decks[0] ?? null));
  } catch {
    /* offline / server asleep: the plain empty state stays */
  } finally {
    infoLoading.value = false;
  }
}
const infoLearnedPercent = computed(() => (infoDeck.value && infoDeck.value.total ? Math.round((100 * infoDeck.value.counts.learned) / infoDeck.value.total) : 0));
const infoAllLearned = computed(() => !!infoDeck.value && (finishedDeckId !== '' || infoDeck.value.total === 0 || infoDeck.value.counts.new + infoDeck.value.counts.learning === 0));
if (!hasSession) void loadInfoDeck();

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
  autoStop();
  stopSpeaking();
});
</script>

<template>
  <!-- No session yet -->
  <!-- no run, but the deck picked last has nothing left to study: the same "Deck finished" screen, from the deck's saved progress -->
  <template v-if="!hasSession && infoDeck && infoAllLearned">
    <TopBar :title="t('study.finished')" />
    <v-container fluid class="text-center px-3 pt-1">
      <div class="paper-card pa-6">
        <Hanko char="完" :size="84" />
        <div class="text-h6 mt-4">{{ t('study.finishedCount', { n: infoDeck.total }) }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ infoDeck.name }}</div>
        <v-row class="mt-4" dense>
          <v-col cols="4"><div class="stat shu"><v-icon icon="mdi-check-circle-outline" /><div class="n">{{ infoDeck.counts.learned }}</div>{{ t('btn.learned') }}</div></v-col>
          <v-col cols="4"><div class="stat"><v-icon icon="mdi-help-circle-outline" /><div class="n">{{ infoDeck.counts.learning }}</div>{{ t('status.learning') }}</div></v-col>
          <v-col cols="4"><div class="stat"><v-icon icon="mdi-skip-next-outline" /><div class="n">{{ infoDeck.counts.skipped }}</div>{{ t('study.skippedStat') }}</div></v-col>
        </v-row>
        <div class="text-caption text-medium-emphasis mt-3"><v-icon icon="mdi-cloud-check-outline" size="14" /> {{ t('study.saved') }}</div>
      </div>
      <v-btn block color="primary" size="large" prepend-icon="mdi-cards-outline" class="mt-4" :data-tip="t('tip.backToDecks')" @click="router.replace('/')">{{ t('study.backToDecks') }}</v-btn>
    </v-container>
  </template>

  <template v-else-if="!hasSession">
    <TopBar :title="t('nav.study')" />
    <v-container fluid class="text-center pt-12 px-3">
      <Hanko char="学" :size="88" />
      <div class="text-h6 mt-5">{{ t('study.none') }}</div>
      <div class="text-body-2 text-medium-emphasis mt-1">{{ t('study.noneHint') }}</div>
      <!-- the deck picked last: its progress, so this screen is never an empty page -->
      <div v-if="infoDeck" class="paper-card infodeck mt-6">
        <div class="text-subtitle-1 font-weight-medium">{{ infoDeck.name }}</div>
        <div class="text-caption text-medium-emphasis">{{ t('study.infoLearned', { a: infoDeck.counts.learned, b: infoDeck.total }) }}</div>
        <v-progress-linear :model-value="infoLearnedPercent" height="6" rounded color="primary" bg-color="surface-variant" class="mt-3" />
        <div class="d-flex justify-space-between mt-3 text-center">
          <div v-for="k in (['new', 'learning', 'learned', 'skipped'] as const)" :key="k">
            <div class="text-h6">{{ infoDeck.counts[k] }}</div>
            <div class="text-caption">{{ t(`status.${k}`) }}</div>
          </div>
        </div>
        <div v-if="infoAllLearned" class="text-body-2 mt-3"><v-icon icon="mdi-check-circle" color="primary" size="18" class="mr-1" />{{ t('study.infoAllDone') }}</div>
      </div>
      <v-progress-linear v-else-if="infoLoading" indeterminate class="mt-6" color="primary" />
      <v-btn color="primary" size="large" prepend-icon="mdi-cards-outline" class="mt-6" :data-tip="t('tip.choose')" @click="router.replace('/')">{{ t('study.choose') }}</v-btn>
    </v-container>
  </template>

  <!-- Finished -->
  <template v-else-if="s.finished">
    <TopBar :title="t('study.finished')" />
    <v-container fluid class="text-center px-3 pt-1">
      <div class="paper-card pa-6">
        <Hanko char="完" :size="84" stamping />
        <div class="text-h6 mt-4">{{ t('study.finishedCount', { n: s.total }) }}</div>
        <v-row class="mt-4" dense>
          <v-col cols="4"><div class="stat shu"><v-icon icon="mdi-check-circle-outline" /><div class="n">{{ s.learned }}</div>{{ t('btn.learned') }}</div></v-col>
          <v-col cols="4"><div class="stat"><v-icon icon="mdi-help-circle-outline" /><div class="n">{{ s.again }}</div>{{ t('btn.again') }}</div></v-col>
          <v-col cols="4"><div class="stat"><v-icon icon="mdi-skip-next-outline" /><div class="n">{{ s.skipped }}</div>{{ t('study.skippedStat') }}</div></v-col>
        </v-row>
        <div v-if="pending > 0" class="text-caption text-warning mt-3">
          <v-icon icon="mdi-cloud-upload-outline" size="14" /> {{ t('study.unsent', { n: pending }) }}
        </div>
        <div v-else class="text-caption text-medium-emphasis mt-3"><v-icon icon="mdi-cloud-check-outline" size="14" /> {{ t('study.saved') }}</div>
      </div>
      <v-btn v-if="s.againCards.length" block color="primary" size="large" prepend-icon="mdi-refresh" class="mt-4" :data-tip="t('tip.retryAgain')" @click="retryAgain">
        {{ t('study.reviewMissed', { n: s.againCards.length }) }}
      </v-btn>
      <v-btn block color="primary" size="large" prepend-icon="mdi-cards-outline" class="mt-2" :data-tip="t('tip.backToDecks')" @click="router.replace('/')">{{ t('study.backToDecks') }}</v-btn>
    </v-container>
  </template>

  <!-- Studying: three steps on one card (word -> meaning -> details sheet), never scrolls -->
  <template v-else-if="card">
    <TopBar :hidden="focusMode">
      <!-- grading buttons live in the header, right of the counter; always usable (you may know the word without flipping).
           On narrow screens only the icons show (the names stay as accessible labels). -->
      <div class="acts">
        <v-btn class="act act-again" prepend-icon="mdi-help-circle-outline" variant="flat" color="primary" :disabled="stamping" :aria-label="t('btn.again')" :data-tip="t('tip.again')" @click="answer('again')"><span class="lbl">{{ t('btn.again') }}</span></v-btn>
        <v-btn class="act act-learned" prepend-icon="mdi-check" variant="flat" color="primary" :disabled="stamping" :aria-label="t('btn.learned')" :data-tip="t('tip.learned')" @click="answer('learned')"><span class="lbl">{{ t('btn.learned') }}</span></v-btn>
        <v-btn class="act act-skip" prepend-icon="mdi-skip-next-outline" variant="flat" color="primary" :disabled="stamping" :aria-label="t('btn.skip')" :data-tip="t('tip.skip')" @click="answer('skip')"><span class="lbl">{{ t('btn.skip') }}</span></v-btn>
        <v-btn class="act act-list" prepend-icon="mdi-book-open-page-variant-outline" variant="flat" color="primary" :aria-label="t('list.open')" @click="listOpen = true"><span class="lbl">{{ t('list.short') }}</span></v-btn>
      </div>
    </TopBar>

    <div class="stage" :class="{ focus: focusMode }" :style="textVars" @touchstart.passive="touchStart" @touchend.passive="touchEnd" @mousedown="mouseDown" @mouseup="mouseUp">
      <div class="paper-card card">
        <!-- focus mode: hides the top bar so the card gets the whole screen; the same corner button brings the bar back -->
        <button type="button" class="focusbtn" :aria-label="focusMode ? t('study.focusOff') : t('study.focusOn')" :data-tip="focusMode ? t('study.focusOff') : t('study.focusOn')" @click.stop="setFocusMode(!focusMode)"><v-icon :icon="focusMode ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'" size="22" /></button>
        <!-- position in the run, bottom centre of the card; tap it for the word list -->
        <button type="button" class="counter" :aria-label="t('list.open')" @click.stop="listOpen = true">
          {{ s.position }} / {{ s.total }}
          <v-icon v-if="pending > 0" icon="mdi-cloud-upload-outline" size="14" class="ml-1" :title="t('study.unsentTip')" />
        </button>
        <div class="flipper" :class="{ back: detailOpen }">
        <div class="face">
        <!-- the word; tapping it flips the card -->
        <div class="wordarea" :class="{ tappable: !answerShown || hasDetail }" @click="tapCard">
          <Hanko v-if="stamping" char="習" :size="92" stamping class="press-seal" />
          <!-- Only this part changes when you move to another word (the card, the top bar buttons and the tools stay still). -->
          <Transition :name="slide" mode="out-in">
          <div :key="card.id" class="wordbody">
          <!-- step 1 / 2: the word (normal) or the meaning (reverse) -->
          <template v-if="!s.reverse">
            <RubyWord v-if="useRuby && card.ruby" v-fit-line :cells="card.ruby" />
            <template v-else>
              <div v-fit-line class="word jp">{{ card.headword }}</div>
              <div v-if="readingVisible && card.reading" class="reading rd">
                <PitchLine v-if="card.pitch" :morae="card.pitch.morae" />
                <template v-else>{{ card.reading }}</template>
              </div>
            </template>
            <!-- step 2: the meaning -->
            <template v-if="settings.showMeaning || hanvietOn || englishOn">
              <div class="sep" />
              <!-- Sino-Vietnamese right above the Vietnamese meaning; each can be switched off in Settings -->
              <div v-if="hanvietOn" v-fit-line class="hv hanviet top">{{ card.hanviet!.toUpperCase() }}</div>
              <div v-if="settings.showMeaning" v-fit-line class="meaning">{{ card.meaning }}</div>
              <div v-if="englishOn" v-fit-line class="english">{{ card.english }}</div>
            </template>
          </template>
          <template v-else>
            <div v-if="hanvietOn" v-fit-line class="hv hanviet top">{{ card.hanviet!.toUpperCase() }}</div>
            <!-- in reverse mode the meaning is the question, so it is always shown -->
            <div v-fit-line class="meaning" :class="{ big: !s.flipped }">{{ card.meaning }}</div>
            <div v-if="englishOn" v-fit-line class="english">{{ card.english }}</div>
            <template v-if="s.flipped">
              <div class="sep" />
              <div v-fit-line class="word jp small">{{ card.headword }}</div>
              <div v-if="card.reading && s.showReading" class="reading rd">{{ card.reading }}</div>
            </template>
          </template>
          <!-- read aloud: right under the last line of the card, in the middle (a tap on it must not flip the card) -->
          <v-btn v-if="canSpeakNow" class="tool3d speakc" :class="speaking && voiceBadge ? 'src-' + voiceBadge.source : ''" :data-voice="speaking && voiceBadge ? voiceBadgeText : undefined" :title="speaking && voiceBadge ? voiceBadgeText : undefined" variant="text" color="primary" :icon="speaking ? 'mdi-stop' : 'mdi-volume-high'" :aria-label="speaking ? t('study.stop') : t('study.read')" :data-tip="t('study.read')" @click.stop="speak" />
          </div>
          </Transition>

          <!-- reading toggle at the bottom left, speaker at the bottom right -->
          <div class="tools">
            <!-- the eye fans out three small round options around itself: hiragana, Vietnamese meaning, Hán Việt (lit = shown) -->
            <div class="fan" :class="{ open: fanOpen }">
              <button
                v-for="(o, idx) in fanOptions"
                :key="o.key"
                type="button"
                class="fanopt"
                :class="['k-' + o.key, { on: o.on }]"
                :style="{ '--dx': o.dx + 'px', '--dy': o.dy + 'px', '--i': idx, '--n': fanOptions.length }"
                :title="o.label"
                :aria-label="o.label"
                :aria-pressed="o.on"
                @click.stop="o.toggle()"
              >{{ 'full' in o ? o.full : o.glyph }}</button>
              <!-- the button itself shows the four options as tiny marks: lit = shown on the card, dim = hidden -->
              <v-btn variant="text" color="primary" class="tool3d eye4" :aria-label="t('show.title')" :aria-expanded="fanOpen" @click.stop="fanOpen = !fanOpen">
                <span class="marks"><span v-for="o in fanOptions" :key="o.key" class="mk" :class="['k-' + o.key, { on: o.on }]">{{ o.glyph }}</span></span>
              </v-btn>
            </div>
            <!-- auto play options: auto play, read aloud while auto playing, keep the voice files -->
            <div class="fan speakfan" :class="{ open: audioOpen }">
              <button
                v-for="(o, idx) in audioOptions"
                :key="o.key"
                type="button"
                class="fanopt"
                :class="['a-' + o.key, { on: o.on }]"
                :style="{ '--dx': o.dx + 'px', '--dy': o.dy + 'px', '--i': idx, '--n': audioOptions.length }"
                :title="o.label"
                :aria-label="o.label"
                :aria-pressed="o.on"
                @click.stop="o.run()"
              ><v-icon :icon="o.icon" /></button>
              <v-btn variant="text" color="primary" class="tool3d speak eye4" :class="{ partial: !audioAllOn }" :aria-label="t('auto.menu')" :aria-expanded="audioOpen" @click.stop="audioOpen = !audioOpen">
                <!-- like the eye: the three options as tiny marks, lit = on, dim = off -->
                <span class="marks"><span v-for="o in audioOptions" :key="o.key" class="mk" :class="['a-' + o.key, { on: o.on }]"><v-icon :icon="o.icon" /></span></span>
              </v-btn>
            </div>
          </div>
        </div>

        </div>
        <!-- back of the card: the details (tap, or swipe down, to turn back) -->
        <div class="face back-face" @click="detailOpen = false" @touchstart.passive="detailSwipe.onTouchstart" @touchend.passive="detailSwipe.onTouchend">
        <div ref="detailEl" class="px-4 pt-3 pb-2 detail">
          <!-- the word and its meaning stay visible on the back (the meaning follows the Settings switch) -->
          <div class="back-head">
            <div class="bline">
              <!-- the speaker sits to the left of the word; the reading beside it carries the pitch line when the word has one -->
              <v-btn
                v-if="canSpeakNow"
                :icon="speaking ? 'mdi-stop' : 'mdi-volume-high'"
                variant="text"
                color="primary"
                size="small"
                class="bspeak tool3d"
                :aria-label="speaking ? t('study.stop') : t('study.read')"
                @click.stop="speak"
              />
              <!-- the word with its reading under it (furigana over each kanji when the card has them), like the front -->
              <!-- the word stays on ONE line whatever its size (v-fit-line zooms it out to the width of this column) -->
              <div class="bwcol" :class="{ spk: canSpeakNow }">
                <RubyWord v-if="card.ruby" v-fit-line :cells="card.ruby" />
                <template v-else>
                  <span v-fit-line class="jp bw">{{ card.headword }}</span>
                  <span v-if="card.reading" class="rd br">
                    <PitchLine v-if="card.pitch" :morae="card.pitch.morae" />
                    <template v-else>{{ card.reading }}</template>
                  </span>
                </template>
              </div>
              <!-- Sino-Vietnamese over the Vietnamese meaning, in the place the reading used to be -->
              <div class="bside">
                <div v-if="card.hanviet" class="hv hanviet bhv">{{ card.hanviet.toUpperCase() }}</div>
                <div class="bm">{{ card.meaning }}</div>
              </div>
            </div>
          </div>

          <!-- the Details always show everything the card has; the Settings switches only affect the front -->
          <div v-if="card.kanji.length || card.pos" class="pair">
            <div v-if="card.kanji.length" class="item">
              <v-icon icon="mdi-ideogram-cjk" color="teal" />
              <div class="grow">
                <div class="label">{{ hasHanViet ? t('detail.sinoViet') : t('detail.kanji') }}</div>
                <!-- one row per kanji, in aligned columns: kanji | Sino-Vietnamese sound | meaning. Tap the kanji (only the kanji) for its stroke order. -->
                <div class="hvpairs">
                  <div v-for="k in card.kanji" :key="k.Literal" class="hvp">
                    <button type="button" class="jp k" :aria-label="`Kanji ${k.Literal}`" @click.stop="openKanji(k.Literal)">{{ k.Literal }}</button><span class="hv">{{ k.HanViet ? k.HanViet.toUpperCase() : '' }}</span><span class="hm">{{ kanjiMeaning(k) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="card.pos" class="item">
              <v-icon icon="mdi-tag-outline" color="warning" />
              <div><div class="label">{{ t('detail.pos') }}</div><span class="posv">{{ card.pos }}</span></div>
            </div>
          </div>

          <div v-if="card.english" class="item">
            <v-icon icon="mdi-alphabetical-variant" color="info" />
            <div><div class="label">English</div><i class="den">{{ card.english.replace(/\n/g, '; ') }}</i></div>
          </div>

          <div v-if="card.example" class="item">
            <v-icon icon="mdi-format-quote-open-outline" color="secondary" />
            <div class="grow">
              <div class="label">{{ t('detail.example') }}</div>
              <div class="jp example">{{ card.example }}</div>
              <div v-if="card.exampleVi" class="exvi">{{ card.exampleVi }}</div>
            </div>
          </div>

          <div v-if="card.pitch" class="item">
            <v-icon icon="mdi-chart-line-variant" color="pink" />
            <div>
              <div class="label">{{ t('detail.pitch') }}</div>
              <PitchLine :morae="card.pitch.morae" />
              <span class="ml-2 text-medium-emphasis pitchv">{{ card.pitch.label }}<span v-if="card.pitch.note"> · {{ card.pitch.note }}</span></span>
            </div>
          </div>

          <!-- all plain note lines under ONE "Notes" label, all related words under ONE "Related" label -->
          <div v-if="plainNotes.length" class="item">
            <v-icon icon="mdi-note-text-outline" color="secondary" />
            <div class="grow">
              <button v-if="touchOnly" type="button" class="label notes-toggle" :aria-expanded="notesOpen" @click.stop="toggleNotes">
                {{ t('detail.notes') }}<v-icon :icon="notesOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
              </button>
              <div v-else class="label">{{ t('detail.notes') }}</div>
              <template v-if="!touchOnly || notesOpen">
                <div v-for="(line, i) in plainNotes" :key="i" class="noteline">{{ line.text }}</div>
              </template>
            </div>
          </div>

          <div v-if="relatedLines.length" class="item">
            <v-icon icon="mdi-link-variant" color="primary" />
            <div class="grow">
              <div class="label">{{ t('detail.related') }}</div>
              <div v-for="(line, i) in relatedLines" :key="i" class="noteline">
                <a class="related" href="#" @click.prevent.stop="openRelated(line.related!)">{{ line.related!.headword }}{{ line.related!.reading ? `(${line.related!.reading})` : '' }}</a>
                = {{ line.related!.meaning }}
              </div>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>

      <!-- arrows for mouse users only (hidden on touch screens, where you swipe) -->
      <v-btn class="nav nav-prev" icon="mdi-chevron-left" size="small" variant="flat" :disabled="s.total < 2" :aria-label="t('study.prev')" @click="browse('previous')" />
      <v-btn class="nav nav-next" icon="mdi-chevron-right" size="small" variant="flat" :disabled="s.total < 2" :aria-label="t('study.next')" @click="browse('next')" />
    </div>


    <v-snackbar v-model="autoDone" :timeout="4000" color="primary">{{ t('auto.done') }}</v-snackbar>
    <WordListSheet :open="listOpen" :session="s" @close="listOpen = false" @pick="pickWord" />
    <KanjiSheet :kanji="card.kanji" :selected="kanjiSel" @close="kanjiSel = null" @select="(l: string) => (kanjiSel = l)" />
    <RelatedDialog :headword="related?.headword ?? null" :reading="related?.reading ?? null" :fallback-meaning="related?.meaning ?? ''" @close="related = null" />
  </template>
</template>

<style scoped>
.stage {
  position: relative;
  padding: 0 4px 4px; /* the word card fills the screen: thin margins left, right and bottom; it starts right under the top bar */
  height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden; /* nothing ever sticks out of the screen while swiping */
}
.stage.focus {
  height: 100dvh;
  padding-top: 4px;
}
.card {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* The card slides out and the next one slides in from the side you swiped towards. */
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.slide-next-leave-to,
.slide-prev-enter-from {
  transform: translateX(-48px);
  opacity: 0;
}
.slide-next-enter-from,
.slide-prev-leave-to {
  transform: translateX(48px);
  opacity: 0;
}
.nav {
  display: none;
}
@media (hover: hover) and (pointer: fine) {
  .stage {
    user-select: none; /* dragging with the mouse must not select text */
  }
  .nav {
    display: inline-flex;
    position: absolute;
    top: 55%;
    z-index: 3;
    /* nearly invisible until the mouse is over it, so it never hides what is under it on the card */
    opacity: 0.15;
    transition: opacity 0.15s ease;
    background: rgba(255, 255, 255, 0.85) !important;
    color: var(--forest) !important;
    box-shadow: 0 3px 0 rgba(31, 77, 36, 0.35);
  }
  .nav:hover,
  .nav:focus-visible {
    opacity: 1;
  }
  .nav:not(.v-btn--disabled):active {
    box-shadow: 0 1px 0 rgba(31, 77, 36, 0.35);
    transform: translateY(2px);
  }
  .nav-prev {
    left: 0;
  }
  .nav-next {
    right: 0;
  }
}
/* The three grading buttons: a row of their own above the card, not inside it. */
.counter {
  position: absolute;
  /* bottom centre of the card, between the eye button (left) and the speaker (right); no background */
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  height: 34px; /* same height as the tool buttons, so it is vertically centred with them */
  z-index: 3;
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  font-size: var(--s-counter);
  font-style: var(--i-counter);
  font-weight: 700;
  color: var(--c-counter, var(--leaf));
  background: none;
  cursor: pointer;
}
.focusbtn {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 3;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  color: var(--c-counter, var(--leaf)); /* the same colour as the 1 / N counter */
  opacity: 1;
  cursor: pointer;
}
.focusbtn .v-icon {
  -webkit-text-stroke: 0.4px currentColor; /* the icon font is thin: thicken the strokes */
}
.focusbtn:hover,
.focusbtn:active {
  filter: brightness(1.2);
}
.acts {
  display: flex;
  gap: 8px;
  margin-right: 6px;
}
.act {
  min-width: 0;
  height: 34px !important;
  padding: 0 12px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 700;
}
/* Narrow screens (phones): icons only, so the three buttons, the counter, the menu and the close button all fit. */
@media (max-width: 560px) {
  .acts {
    flex: none;
    gap: 6px;
    margin-right: 12px; /* keep the last (Skip) button off the screen edge */
  }
  .act {
    min-width: 40px;
    padding: 0 8px;
  }
  .lbl {
    display: none;
  }
  .act :deep(.v-btn__prepend) {
    margin-inline: 0;
  }
}
/* each button of the top bar has its own colour (--bc fill, --bd edge, --bh when the mouse is over): Again orange, Learned green, Skip blue, Words purple */
.act-again { --bc: #ef8a17; --bd: #b8600f; --bh: #f7a94d; }
.act-learned { --bc: #5db82f; --bd: #3f8a1f; --bh: #9be35f; }
.act-skip { --bc: #2f80d1; --bd: #1f5a99; --bh: #5aa0e6; }
.act-list { --bc: #8e4ec6; --bd: #6a3499; --bh: #aa75d8; }
.act.v-btn.bg-primary:not(.v-btn--disabled) {
  background-color: var(--bc) !important;
  color: #fff !important;
  box-shadow: 0 4px 0 var(--bd);
}
.act.v-btn.bg-primary:not(.v-btn--disabled):hover {
  background-color: var(--bh) !important;
  color: #fff !important;
  box-shadow: 0 2px 0 var(--bd);
}
.act.v-btn.bg-primary:not(.v-btn--disabled):hover:active {
  box-shadow: 0 1px 0 var(--bd);
}
.act.playing.v-btn:not(.v-btn--disabled) {
  background: #9be35f !important; /* running: the lighter green, like a button under the mouse */
  color: #4e342e !important;
}
/* Again and Skip are pressed-in 3D buttons too, like Learned (darker edge underneath, sinks when pressed). */
.act.v-btn--variant-tonal:not(.v-btn--disabled) {
  box-shadow: 0 3px 0 rgba(31, 77, 36, 0.35);
}
.act.v-btn--variant-tonal:not(.v-btn--disabled):active {
  box-shadow: 0 1px 0 rgba(31, 77, 36, 0.35);
  transform: translateY(2px);
}
.wordarea {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px 14px;
  overflow: hidden; /* the sliding word never leaves the card */
}
.wordbody,
.bw {
  user-select: text; /* the word, its reading and meaning can be selected and copied */
}
.wordbody {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  max-width: 100%;
}
.wordarea.tappable {
  cursor: pointer;
}
.press-seal {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: -46px 0 0 -46px;
  z-index: 2;
}
.tools {
  position: absolute;
  bottom: 8px;
  left: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  pointer-events: none; /* the empty middle of the strip must not swallow taps meant for the card */
}
.speakc.v-btn:not(.v-btn--disabled)[class*='src-'] {
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.25);
}
.speakc.src-browser.v-btn:not(.v-btn--disabled),
.speakc.src-browser-other.v-btn:not(.v-btn--disabled) {
  background: #8e4ec6 !important; /* the browser's own cache */
}
.speakc.src-file.v-btn:not(.v-btn--disabled) {
  background: #1a9c9c !important; /* a voice file shipped with the app */
}
.speakc.src-server-memory.v-btn:not(.v-btn--disabled),
.speakc.src-server-file.v-btn:not(.v-btn--disabled),
.speakc.src-server.v-btn:not(.v-btn--disabled) {
  background: #2f80d1 !important; /* from the server, no charge */
}
.speakc.src-elevenlabs.v-btn:not(.v-btn--disabled) {
  background: #ef8a17 !important; /* a paid ElevenLabs call */
}
.speakc.src-device.v-btn:not(.v-btn--disabled) {
  background: #7a7a7a !important; /* the phone's own voice */
}
.tools > * {
  pointer-events: auto;
}
.eye4.v-btn {
  padding: 0 !important;
}
.marks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  justify-items: center;
  width: 24px;
  height: 20px; /* fits inside the 34 x 28 button, nothing grows */
  line-height: 1;
}
.mk {
  /* a tiny copy of the option's button: its own colour behind the letter, no border */
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 11px;
  height: 10px;
  padding: 0 1px;
  border-radius: 5px;
  font-family: var(--font-jp);
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  text-transform: none; /* "Vi" and "En" as written: the Vuetify button would turn them into VI / EN */
  color: #fff;
  background: var(--oc, #3f8a1f);
  opacity: 0.45; /* off: faded */
  transition: opacity 0.15s;
}
.mk.on {
  opacity: 1; /* on: full colour */
  font-weight: 900;
}
.fan {
  position: relative;
  width: 34px;
  height: 28px;
}
.fanopt {
  position: absolute;
  left: 2px;
  top: -1px;
  width: 30px;
  height: 30px;
  box-sizing: border-box;
  border: 1.5px dashed var(--oc, var(--leaf)); /* off: an empty dashed disc in the option's own colour */
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-jp);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  background: var(--paper);
  color: var(--oc, var(--leaf));
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.35);
  opacity: 0;
  pointer-events: none;
  transform: translate(0, 0) scale(0.4);
  /* closing (the state this rule describes): slow and gentle, the outermost option folds first, one after another */
  transition: transform 0.5s cubic-bezier(0.45, 0, 0.2, 1) calc((var(--n) - 1 - var(--i)) * 70ms), opacity 0.45s ease calc((var(--n) - 1 - var(--i)) * 70ms);
}
.fan.open .fanopt {
  opacity: 1;
  pointer-events: auto;
  transform: translate(calc(var(--dx) * var(--k, 1)), calc(var(--dy) * var(--k, 1))) scale(1);
  /* opening: just as slow and gentle, in the opposite order: the nearest option appears first, the outermost last */
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) calc(var(--i) * 55ms), opacity 0.36s ease calc(var(--i) * 55ms);
}
@media (hover: hover) and (pointer: fine) {
  /* the fanned-out options sink a little under the mouse too (only once they are out: .open sets the transform) */
  .fan.open .fanopt:hover {
    box-shadow: 0 1px 0 rgba(31, 77, 36, 0.35);
    transform: translate(calc(var(--dx) * var(--k, 1)), calc(var(--dy) * var(--k, 1) + 1px)) scale(1);
  }
  .fan.open .fanopt.on:hover {
    box-shadow: 0 1px 0 var(--od, #3f8a1f);
  }
}
/* each option has its own colour: hiragana green, Vietnamese orange, English blue, Sino-Vietnamese purple (--oc fill, --od edge) */
.fanopt.k-meaning,
.mk.k-meaning {
  --oc: #ef8a17;
  --od: #b8600f;
}
.fanopt.k-english,
.mk.k-english {
  --oc: #2f80d1;
  --od: #1f5a99;
}
.fanopt.k-hanviet,
.mk.k-hanviet {
  --oc: #8e4ec6;
  --od: #6a3499;
}
.mk.a-auto,
.fanopt.a-auto {
  --oc: #2f80d1;
  --od: #1f5a99;
}
.mk.a-sound {
  --oc: #ef8a17;
}
.mk.a-save {
  --oc: #8e4ec6;
}
.tools .tool3d.v-btn .mk .v-icon {
  font-size: 9px !important; /* tiny marks: beats the 18px / 22px of the button's own icon rule */
  width: auto;
  height: auto;
}
.speak .marks .mk:nth-child(3) {
  grid-column: 1 / -1; /* three marks: the last one sits centred under the other two */
}
.fanopt.a-sound {
  --oc: #ef8a17;
  --od: #b8600f;
}
.fanopt.a-save {
  --oc: #8e4ec6;
  --od: #6a3499;
}
/* the read-aloud button under the card: the phone size of the other card buttons, a little larger with a mouse */
.speakc.v-btn {
  display: flex;
  margin: 10px auto 0;
  width: 34px !important;
  height: 28px !important;
}
.speakc.v-btn .v-icon {
  font-size: 18px;
}
.fanopt .v-icon {
  font-size: 16px; /* icons inside the fanned-out options: phone */
}
@media (hover: hover) and (pointer: fine) {
  .speakc.v-btn {
    width: 52px !important;
    height: 43px !important;
  }
  .speakc.v-btn .v-icon {
    font-size: 25px;
  }
  .fanopt .v-icon {
    font-size: 24px; /* web: the options are larger too (they sit in 40px circles) */
  }
}
.tools .speak.partial.v-btn:not(.v-btn--disabled) {
  background: #ef8a17 !important; /* not every auto play option is on: an orange button instead of the green one */
  box-shadow: 0 3px 0 #b8600f;
}
.fanopt.on {
  background: var(--oc, rgb(var(--v-theme-primary))); /* lit = shown on the card */
  border-style: solid;
  border-color: transparent;
  color: #fff;
  box-shadow: 0 2px 0 var(--od, #3f8a1f);
}
/* Web (a real mouse): the two buttons in the card, the four marks and the fanned-out options are a little larger; phones keep the small size. */
@media (hover: hover) and (pointer: fine) {
  .tools .tool3d.v-btn {
    width: 46px !important;
    height: 38px !important;
  }
  .tools .tool3d.v-btn .v-icon {
    font-size: 22px;
  }
  .marks {
    width: 34px;
    height: 28px;
  }
  .mk {
    font-size: 0.66rem;
    min-width: 16px;
    height: 13px;
    padding: 0 2px;
    border-radius: 7px;
  }
  .tools .tool3d.v-btn .mk .v-icon {
    font-size: 11px !important;
  }
  .fan {
    --k: 1.4;
    width: 46px;
    height: 38px;
  }
  .fanopt {
    left: 3px;
    top: 0;
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }
}
.tools .speakfan {
  margin-left: auto; /* stays on the right even when the reading toggle is not shown */
}
.word {
  font-size: var(--s-word);
  font-style: var(--i-word);
  line-height: 1.2;
  color: var(--c-word, var(--headword)); /* the headword is red, as on LCT's lookup card */
  font-weight: 700;
}
.word.small {
  font-size: var(--s-answerWord);
  font-style: var(--i-answerWord);
  color: var(--c-answerWord, var(--headword));
}
.reading {
  font-size: var(--s-reading);
  font-style: var(--i-reading);
  color: var(--c-reading, var(--rd));
  margin-top: 2px;
}
.sep {
  width: 34px;
  height: 1px;
  background: var(--gold);
  margin: 16px 0;
}
.meaning {
  font-size: var(--s-meaning);
  font-style: var(--i-meaning);
  color: var(--c-meaning, inherit);
  font-weight: 500;
  line-height: 1.4;
  white-space: pre-line;
}
.hanviet {
  font-size: var(--s-hanviet);
  font-style: var(--i-hanviet);
  color: var(--c-hanviet, var(--hv));
  font-weight: 700;
  letter-spacing: 0.12em;
}
.hanviet.top {
  margin-bottom: 4px;
}
.english {
  margin-top: 4px;
  font-size: var(--s-english);
  font-style: var(--i-english);
  color: var(--c-english, inherit);
  opacity: 0.8;
}
.meaning.big {
  font-family: var(--font-jp);
  font-size: var(--s-question);
  font-style: var(--i-question);
  color: var(--c-question, inherit);
}
/* Front and back swap with a quick cross-fade (no sliding, no 3D turning, which looked confusing). */
.flipper {
  position: relative;
  flex: 1;
  min-height: 0;
}
.face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  transition: opacity 0.3s ease, visibility 0s linear 0s;
}
.back-face {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.3s ease, visibility 0s linear 0.3s;
}
.flipper.back .face:not(.back-face) {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.3s ease, visibility 0s linear 0.3s;
}
.flipper.back .back-face {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: opacity 0.3s ease 0.08s, visibility 0s linear 0s;
}
.detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto; /* the sheet never cuts content: it scrolls only if the card has more than fits */
}
/* On a wide screen the details sit in a centred column (like the front of the card) instead of hugging the left edge. */
.detail > * {
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
}
.back-head {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--paper-edge);
}
.bline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
}
.bspeak {
  flex: 0 0 auto;
  margin-left: -6px;
}
.bwcol {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: 100%; /* never wider than the line: a long word is zoomed out to fit, not wrapped */
}
.bwcol.spk {
  max-width: calc(100% - 40px); /* room for the speaker button to its left */
}
.bw {
  display: inline-block; /* zoom (v-fit-line) needs a box */
}
.bside {
  flex: 1 1 140px;
  min-width: 0;
}
.bw {
  font-size: var(--s-word);
  font-style: var(--i-word);
  line-height: 1.2;
  color: var(--c-word, var(--headword));
  font-weight: 700;
}
.br {
  font-size: var(--s-backReading);
  font-style: var(--i-backReading);
  color: var(--c-backReading, var(--rd));
  opacity: 0.9;
}
.bhv {
  margin-top: 4px;
  font-size: var(--s-backHanviet);
  font-style: var(--i-backHanviet);
  color: var(--c-backHanviet, var(--hv));
}
.label {
  font-size: var(--s-label);
  font-style: var(--i-label);
  color: var(--c-label, var(--leaf));
}
.den {
  font-size: var(--s-detailEnglish);
  font-style: var(--i-detailEnglish);
  color: var(--c-detailEnglish, inherit);
}
.posv {
  font-size: var(--s-pos);
  font-style: var(--i-pos);
  color: var(--c-pos, inherit);
}
.pitchv {
  font-size: var(--s-pitchLabel);
  font-style: var(--i-pitchLabel);
  color: var(--c-pitchLabel, inherit);
}
.notes-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
.example {
  font-size: var(--s-example);
  font-style: var(--i-example);
  color: var(--c-example, var(--jp));
  line-height: 1.5;
}
.exvi {
  font-size: var(--s-exampleVi);
  font-style: var(--i-exampleVi);
  color: var(--c-exampleVi, inherit);
  opacity: 0.8;
}
.bm {
  margin-top: 2px;
  font-size: var(--s-backMeaning);
  font-style: var(--i-backMeaning);
  color: var(--c-backMeaning, inherit);
  font-weight: 600;
  white-space: pre-line;
}
.pair {
  display: grid;
  /* Sino-Viet and Part of speech one under the other, each on its own row like English (side by side squeezed the kanji meanings) */
  grid-template-columns: 1fr;
  gap: 12px;
}
.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.92rem;
  min-width: 0;
}
.item .grow {
  flex: 1;
  min-width: 0;
}
.noteline {
  font-size: var(--s-notes);
  font-style: var(--i-notes);
  color: var(--c-notes, inherit);
}
.noteline + .noteline {
  margin-top: 3px;
}
.hv {
  color: var(--hv);
  letter-spacing: 0.06em;
}
.hvpairs {
  /* one kanji per row, in three aligned columns: kanji | Sino-Viet sound | meaning */
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 6px;
  align-items: baseline;
}
.hvp {
  /* a plain row whose three parts sit in the columns of .hvpairs; only the kanji is a button (tap for the stroke order) */
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  text-align: left;
}
/* Only the kanji is framed (and tappable), like the kanji tiles used to be: a thin border with rounded corners, no 3D edge. */
.hvp .k {
  font-family: var(--font-jp);
  cursor: pointer;
  color: var(--c-kanjiChar, var(--headword)); /* same red as the kanji in the word list */
  min-width: 42px;
  padding: 2px 8px;
  text-align: center;
  font-size: var(--s-kanjiChar);
  font-style: var(--i-kanjiChar);
  line-height: 1.2;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
}
.hvp .k:hover {
  border-color: var(--leaf);
}
.hvp .hm {
  font-size: var(--s-kanjiMeaning);
  font-style: var(--i-kanjiMeaning);
  color: var(--c-kanjiMeaning, inherit);
  opacity: 0.85;
}
.hvp .hv {
  font-size: var(--s-kanjiSound);
  font-style: var(--i-kanjiSound);
  color: var(--c-kanjiSound, var(--hv));
}
.related {
  font-size: var(--s-related);
  font-style: var(--i-related);
  color: var(--c-related, var(--forest));
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--leaf);
}
.stat {
  border-radius: 8px;
  padding: 10px 0;
  background: rgb(var(--v-theme-surface-variant));
}
.stat.shu {
  background: color-mix(in srgb, var(--shu) 14%, transparent);
}
.stat .n {
  font-size: 1.6rem;
  font-weight: 500;
}
</style>
