<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { pendingResults, submitResult } from '../api';
import { t } from '../i18n';
import Hanko from '../components/Hanko.vue';
import KanjiSheet from '../components/KanjiSheet.vue';
import PitchLine from '../components/PitchLine.vue';
import RelatedDialog from '../components/RelatedDialog.vue';
import RubyWord from '../components/RubyWord.vue';
import TopBar from '../components/TopBar.vue';
import { parseNote, type RelatedWord } from '../lib/note';
import { swipeDown } from '../lib/swipeDown';
import { canSpeak, speakJapanese, stopSpeaking } from '../lib/speech';
import { StudySession } from '../session';
import { settings } from '../settings';
import { activeSession } from '../store';
import type { StudyResult } from '../types';

const router = useRouter();
const hasSession = activeSession.value !== null;
// Without a session (opened from the menu) the screen only shows an empty state; this stays inert.
const s = reactive(activeSession.value ?? new StudySession([], { reverse: false, showReading: false })) as StudySession;

const pending = ref(pendingResults());
const related = ref<RelatedWord | null>(null);
const kanjiSel = ref<string | null>(null);
const detailOpen = ref(false);
const speaking = ref(false);
const stamping = ref(false); // the "習" seal is being pressed onto the card

const card = computed(() => s.current);
/* The reading is NEVER shown on its own (not even after the flip): only the kanji, until the eye button is tapped. */
const readingVisible = computed(() => s.showReading);
const useRuby = computed(() => !s.reverse && !!card.value?.ruby && readingVisible.value);
const noteLines = computed(() => parseNote(card.value?.note));
const plainNotes = computed(() => noteLines.value.filter((l) => !l.related));
const relatedLines = computed(() => noteLines.value.filter((l) => !!l.related));
const scale = computed(() => settings.fontScale);
/* The eye button toggles the reading. In reverse mode the word itself only appears after the flip, so does the button. */
const canToggleReading = computed(() => !!card.value?.reading && (!s.reverse || s.flipped));

/*
 * Sino-Vietnamese sounds paired with their Han characters (香 HƯƠNG). When the word's own Hán Việt text is just those
 * sounds joined, only the pairs are shown; if it differs (the user wrote something else) both are shown.
 */
const hanvietOn = computed(() => settings.showHanViet && !!card.value?.hanviet);
const hanvietPairs = computed(() => (card.value?.kanji ?? []).filter((k) => !!k.HanViet));
const pairsMatchWord = computed(() => {
  const c = card.value;
  if (!c?.hanviet || hanvietPairs.value.length === 0) return false;
  const joined = hanvietPairs.value.map((k) => k.HanViet!.trim().toLowerCase()).join(' ');
  return joined === c.hanviet.trim().toLowerCase().replace(/\s+/g, ' ');
});

/* Step 3 (the "Chi tiết" sheet) only exists when the card has something beyond the word and its meaning. */
const hasDetail = computed(() => {
  const c = card.value;
  return !!c && (!!c.hanviet || !!c.english || !!c.pos || !!c.pitch || c.kanji.length > 0 || noteLines.value.length > 0);
});

/* Speaking: normal mode reads the front word; reverse mode only after the flip (does not give the answer away). */
const canSpeakNow = computed(() => canSpeak() && !!card.value && card.value.lang === 'ja' && (!s.reverse || s.flipped));

function speak(): void {
  const c = card.value;
  if (!c) return;
  if (speaking.value) {
    stopSpeaking();
    speaking.value = false;
    return;
  }
  speaking.value = true;
  speakJapanese(c.reading || c.headword, () => (speaking.value = false));
}

function flip(): void {
  stopSpeaking();
  speaking.value = false;
  s.flip();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* Swipe left = next word, swipe right = previous word (browsing only, nothing is graded); swipe up = Details. */
/* Opening the details also reveals the answer side, so the card is already flipped when the sheet is closed. */
function openDetail(): void {
  if (!hasDetail.value) return;
  if (!s.flipped) s.flip();
  detailOpen.value = true;
}

/* Tap the card: the first tap shows the answer, the next tap opens the Details (when the card has any). */
function tapCard(): void {
  if (swallowClick) return;
  if (!s.flipped) flip();
  else openDetail();
}

const detailEl = ref<HTMLElement | null>(null);
const detailSwipe = swipeDown(() => (detailOpen.value = false), () => detailEl.value); // drag the sheet down to close it

const slide = ref<'slide-next' | 'slide-prev'>('slide-next');
let startX = 0;
let startY = 0;

function browse(direction: 'next' | 'previous'): void {
  if (stamping.value) return;
  slide.value = direction === 'next' ? 'slide-next' : 'slide-prev';
  detailOpen.value = false;
  stopSpeaking();
  speaking.value = false;
  if (direction === 'next') s.next();
  else s.previous();
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

async function answer(result: StudyResult): Promise<void> {
  if (stamping.value) return; // one answer at a time while the seal is pressing
  if (result === 'learned') {
    stamping.value = true;
    await sleep(650); // let the seal land before the next card replaces this one
    stamping.value = false;
  }
  slide.value = 'slide-next';
  const answered = s.answer(result);
  detailOpen.value = false;
  stopSpeaking();
  speaking.value = false;
  if (!answered) return;
  await submitResult(answered.id, result);
  pending.value = pendingResults();
}

function retryAgain(): void {
  const cards = s.againCards;
  if (cards.length === 0) return;
  activeSession.value = new StudySession(cards, { reverse: s.reverse, showReading: settings.showReading });
  void router.replace('/').then(() => router.push('/study'));
}

/* The card stays turned over under these popups, so closing them returns to the details. */
function openRelated(r: RelatedWord): void {
  related.value = r;
}

function openKanji(literal: string): void {
  kanjiSel.value = literal;
}

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
  else if (e.key.toLowerCase() === 'p' && canSpeakNow.value) speak();
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  stopSpeaking();
});
</script>

<template>
  <!-- No session yet -->
  <template v-if="!hasSession">
    <TopBar :title="t('nav.study')" />
    <v-container class="text-center pt-12">
      <Hanko char="学" :size="88" />
      <div class="text-h6 mt-5">{{ t('study.none') }}</div>
      <div class="text-body-2 text-medium-emphasis mt-1">{{ t('study.noneHint') }}</div>
      <v-btn color="primary" size="large" prepend-icon="mdi-cards-outline" class="mt-6" @click="router.replace('/')">{{ t('study.choose') }}</v-btn>
    </v-container>
  </template>

  <!-- Finished -->
  <template v-else-if="s.finished">
    <TopBar :title="t('study.finished')" />
    <v-container class="text-center">
      <div class="paper-card pa-6 mt-4">
        <Hanko char="完" :size="84" stamping />
        <div class="text-h6 mt-4">{{ t('study.finishedCount', { n: s.total }) }}</div>
        <v-row class="mt-4" dense>
          <v-col cols="4"><div class="stat shu"><v-icon icon="mdi-check-circle-outline" /><div class="n">{{ s.learned }}</div>{{ t('btn.learned') }}</div></v-col>
          <v-col cols="4"><div class="stat"><v-icon icon="mdi-refresh" /><div class="n">{{ s.again }}</div>{{ t('btn.again') }}</div></v-col>
          <v-col cols="4"><div class="stat"><v-icon icon="mdi-skip-next-outline" /><div class="n">{{ s.skipped }}</div>{{ t('study.skippedStat') }}</div></v-col>
        </v-row>
        <div v-if="pending > 0" class="text-caption text-warning mt-3">
          <v-icon icon="mdi-cloud-upload-outline" size="14" /> {{ t('study.unsent', { n: pending }) }}
        </div>
        <div v-else class="text-caption text-medium-emphasis mt-3"><v-icon icon="mdi-cloud-check-outline" size="14" /> {{ t('study.saved') }}</div>
      </div>
      <v-btn v-if="s.againCards.length" block color="primary" size="large" prepend-icon="mdi-refresh" class="mt-4" @click="retryAgain">
        {{ t('study.reviewMissed', { n: s.againCards.length }) }}
      </v-btn>
      <v-btn block variant="tonal" size="large" prepend-icon="mdi-cards-outline" class="mt-2" @click="router.replace('/')">{{ t('study.backToDecks') }}</v-btn>
    </v-container>
  </template>

  <!-- Studying: three steps on one card (word -> meaning -> details sheet), never scrolls -->
  <template v-else-if="card">
    <TopBar>
      <template #center>
        {{ s.position }} / {{ s.total }}
        <v-icon v-if="pending > 0" icon="mdi-cloud-upload-outline" size="14" class="ml-1" :title="t('study.unsentTip')" />
      </template>
      <v-btn icon="mdi-close" size="small" variant="text" :aria-label="t('study.end')" @click="router.replace('/')" />
    </TopBar>

    <div class="stage" :style="{ '--fs': scale }" @touchstart.passive="touchStart" @touchend.passive="touchEnd" @mousedown="mouseDown" @mouseup="mouseUp">
      <!-- grading buttons: their own row ABOVE the card (outside the word frame); always usable (you may know the word without flipping) -->
      <div class="acts">
        <v-btn class="act" prepend-icon="mdi-refresh" variant="tonal" color="secondary" :disabled="stamping" @click="answer('again')">{{ t('btn.again') }}</v-btn>
        <v-btn class="act" prepend-icon="mdi-check" variant="flat" color="primary" :disabled="stamping" @click="answer('learned')">{{ t('btn.learned') }}</v-btn>
        <v-btn class="act" prepend-icon="mdi-skip-next-outline" variant="tonal" color="secondary" :disabled="stamping" @click="answer('skip')">{{ t('btn.skip') }}</v-btn>
      </div>

      <Transition :name="slide" mode="out-in">
      <div :key="card.id" class="paper-card card">
        <div class="flipper" :class="{ back: detailOpen }">
        <div class="face">
        <!-- the word; tapping it flips the card -->
        <div class="wordarea" :class="{ tappable: !s.flipped || hasDetail }" @click="tapCard">
          <Hanko v-if="stamping" char="習" :size="92" stamping class="press-seal" />
          <!-- step 1 / 2: the word (normal) or the meaning (reverse) -->
          <template v-if="!s.reverse">
            <RubyWord v-if="useRuby && card.ruby" :cells="card.ruby" :scale="scale" />
            <template v-else>
              <div class="word jp">{{ card.headword }}</div>
              <div v-if="readingVisible && card.reading" class="reading rd">
                <PitchLine v-if="card.pitch" :morae="card.pitch.morae" />
                <template v-else>{{ card.reading }}</template>
              </div>
            </template>
            <!-- step 2: the meaning -->
            <template v-if="s.flipped && (settings.showMeaning || hanvietOn)">
              <div class="sep" />
              <!-- Sino-Vietnamese right above the Vietnamese meaning; each can be switched off in Settings -->
              <div v-if="hanvietOn" class="hv hanviet top">{{ card.hanviet!.toUpperCase() }}</div>
              <div v-if="settings.showMeaning" class="meaning">{{ card.meaning }}</div>
            </template>
          </template>
          <template v-else>
            <div v-if="s.flipped && hanvietOn" class="hv hanviet top">{{ card.hanviet!.toUpperCase() }}</div>
            <!-- in reverse mode the meaning is the question, so it is always shown -->
            <div class="meaning" :class="{ big: !s.flipped }">{{ card.meaning }}</div>
            <template v-if="s.flipped">
              <div class="sep" />
              <div class="word jp small">{{ card.headword }}</div>
              <div v-if="card.reading && s.showReading" class="reading rd">{{ card.reading }}</div>
            </template>
          </template>

          <!-- the reading toggle sits right next to the speaker -->
          <div class="tools">
            <v-btn
              v-if="canToggleReading"
              :icon="s.showReading ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              variant="text"
              color="primary"
              :aria-label="s.showReading ? t('study.hideReading') : t('study.showReading')"
              @click.stop="s.showReading = !s.showReading"
            />
            <v-btn
              v-if="canSpeakNow"
              :icon="speaking ? 'mdi-stop' : 'mdi-volume-high'"
              variant="text"
              color="primary"
              :aria-label="speaking ? t('study.stop') : t('study.read')"
              @click.stop="speak"
            />
          </div>
        </div>

        <!-- step 3 -->
        <button v-if="hasDetail" type="button" class="more" @click="openDetail">
          <v-icon icon="mdi-information-outline" size="18" /> {{ t('study.details') }} <v-icon icon="mdi-chevron-up" size="18" />
        </button>
        <div v-else class="more-space" />
        </div>
        <!-- back of the card: the details (tap, or swipe down, to turn back) -->
        <div class="face back-face" @click="detailOpen = false" @touchstart.passive="detailSwipe.onTouchstart" @touchend.passive="detailSwipe.onTouchend">
        <div ref="detailEl" class="px-4 pt-3 pb-2 detail">
          <!-- the word and its meaning stay visible on the back (the meaning follows the Settings switch) -->
          <div class="back-head">
            <span class="jp bw">{{ card.headword }}</span>
            <span v-if="card.reading" class="rd br">{{ card.reading }}</span>
            <div class="bm">{{ card.meaning }}</div>
          </div>

          <!-- the Details always show everything the card has; the Settings switches only affect the front -->
          <div v-if="card.hanviet || card.pos" class="pair">
            <div v-if="card.hanviet" class="item">
              <v-icon icon="mdi-ideogram-cjk" color="teal" />
              <div>
                <div class="label">{{ t('detail.sinoViet') }}</div>
                <!-- the Han characters next to each Sino-Vietnamese sound: 香 HƯƠNG -->
                <div v-if="hanvietPairs.length" class="hvpairs">
                  <span v-for="k in hanvietPairs" :key="k.Literal" class="hvp"><span class="jp k">{{ k.Literal }}</span><span class="hv">{{ k.HanViet!.toUpperCase() }}</span></span>
                </div>
                <div v-if="!pairsMatchWord" class="hv">{{ card.hanviet!.toUpperCase() }}</div>
              </div>
            </div>
            <div v-if="card.pos" class="item">
              <v-icon icon="mdi-tag-outline" color="warning" />
              <div><div class="label">{{ t('detail.pos') }}</div>{{ card.pos }}</div>
            </div>
          </div>

          <div v-if="card.english" class="item">
            <v-icon icon="mdi-alphabetical-variant" color="info" />
            <div><div class="label">English</div><i>{{ card.english.replace(/\n/g, '; ') }}</i></div>
          </div>

          <div v-if="card.pitch" class="item">
            <v-icon icon="mdi-chart-line-variant" color="pink" />
            <div>
              <div class="label">{{ t('detail.pitch') }}</div>
              <PitchLine :morae="card.pitch.morae" />
              <span class="ml-2 text-medium-emphasis">{{ card.pitch.label }}<span v-if="card.pitch.note"> · {{ card.pitch.note }}</span></span>
            </div>
          </div>

          <div v-if="card.kanji.length" class="item">
            <v-icon icon="mdi-book-alphabet" color="primary" />
            <div class="grow">
              <div class="label">{{ t('detail.kanji') }}</div>
              <div class="kanjirow">
                <button v-for="k in card.kanji" :key="k.Literal" type="button" class="ktile" :aria-label="`Kanji ${k.Literal}`" @click.stop="openKanji(k.Literal)">
                  <span class="g jp">{{ k.Literal }}</span>
                  <span class="hvk">{{ k.HanViet ?? '' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- all plain note lines under ONE "Notes" label, all related words under ONE "Related" label -->
          <div v-if="plainNotes.length" class="item">
            <v-icon icon="mdi-note-text-outline" color="secondary" />
            <div class="grow">
              <div class="label">{{ t('detail.notes') }}</div>
              <div v-for="(line, i) in plainNotes" :key="i" class="noteline">{{ line.text }}</div>
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
          <button type="button" class="more" @click.stop="detailOpen = false">
            <v-icon icon="mdi-chevron-down" size="18" /> {{ t('study.back') }}
          </button>
        </div>
        </div>
      </div>
      </Transition>

      <!-- arrows for mouse users only (hidden on touch screens, where you swipe) -->
      <v-btn class="nav nav-prev" icon="mdi-chevron-left" size="small" variant="flat" :disabled="s.total < 2" :aria-label="t('study.prev')" @click="browse('previous')" />
      <v-btn class="nav nav-next" icon="mdi-chevron-right" size="small" variant="flat" :disabled="s.total < 2" :aria-label="t('study.next')" @click="browse('next')" />
    </div>


    <KanjiSheet :kanji="card.kanji" :selected="kanjiSel" @close="kanjiSel = null" @select="(l: string) => (kanjiSel = l)" />
    <RelatedDialog :headword="related?.headword ?? null" :reading="related?.reading ?? null" :fallback-meaning="related?.meaning ?? ''" @close="related = null" />
  </template>
</template>

<style scoped>
.stage {
  position: relative;
  padding: 10px;
  height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
}
.card {
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
    background: rgba(255, 255, 255, 0.85) !important;
    color: var(--forest) !important;
    box-shadow: 0 2px 6px rgba(31, 77, 36, 0.25);
  }
  .nav-prev {
    left: 0;
  }
  .nav-next {
    right: 0;
  }
}
/* The three grading buttons: a row of their own above the card, not inside it. */
.acts {
  display: flex;
  gap: 8px;
  padding: 0 2px 10px;
}
.act {
  flex: 1;
  min-width: 0;
  height: 40px !important;
  padding: 0 6px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 700;
}
/* Again and Skip are pressed-in 3D buttons too, like Learned (darker edge underneath, sinks when pressed). */
.act.v-btn--variant-tonal:not(.v-btn--disabled) {
  box-shadow: 0 4px 0 rgba(31, 77, 36, 0.35);
}
.act.v-btn--variant-tonal:not(.v-btn--disabled):active {
  box-shadow: 0 1px 0 rgba(31, 77, 36, 0.35);
  transform: translateY(3px);
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
  bottom: 4px;
  right: 6px;
  display: flex;
  align-items: center;
}
.word {
  font-size: calc(3.6rem * var(--fs));
  line-height: 1.2;
}
.word.small {
  font-size: calc(2.2rem * var(--fs));
}
.reading {
  font-size: calc(1.05rem * var(--fs));
  margin-top: 2px;
}
.sep {
  width: 34px;
  height: 1px;
  background: var(--gold);
  margin: 16px 0;
}
.meaning {
  font-size: calc(1.35rem * var(--fs));
  font-weight: 500;
  line-height: 1.4;
  white-space: pre-line;
}
.hanviet {
  font-size: calc(0.95rem * var(--fs));
  font-weight: 700;
  letter-spacing: 0.12em;
}
.hanviet.top {
  margin-bottom: 4px;
}
.meaning.big {
  font-family: var(--font-jp);
  font-size: calc(1.8rem * var(--fs));
}
.more,
.more-space {
  flex: 0 0 auto;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-top: 1px solid var(--paper-edge);
  color: var(--forest);
  font-size: 0.85rem;
  font-weight: 700;
}
/* The card turns over like a real one: the front is the word, the back is the details. */
.card {
  perspective: 1400px;
}
.flipper {
  position: relative;
  flex: 1;
  min-height: 0;
  transform-style: preserve-3d;
  transition: transform 0.45s ease;
}
.flipper.back {
  transform: rotateY(180deg);
}
.face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.back-face {
  transform: rotateY(180deg);
}
.detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto; /* the sheet never cuts content: it scrolls only if the card has more than fits */
}
.back-head {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--paper-edge);
}
.bw {
  font-size: 1.7rem;
  line-height: 1.2;
}
.br {
  margin-left: 8px;
  opacity: 0.8;
}
.bm {
  margin-top: 2px;
  font-weight: 600;
  white-space: pre-line;
}
.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
.noteline + .noteline {
  margin-top: 3px;
}
.hv {
  color: var(--hv);
  letter-spacing: 0.06em;
}
.hvpairs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
}
.hvp {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
}
.hvp .k {
  font-size: 1.25rem;
}
.related {
  color: var(--forest);
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--leaf);
}
.kanjirow {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-top: 4px;
}
.ktile {
  flex: 0 0 auto;
  min-width: 60px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
}
.ktile .g {
  font-size: 1.8rem;
  line-height: 1.1;
}
.ktile .hvk {
  font-size: 0.6rem;
  color: var(--hv);
  letter-spacing: 0.05em;
  text-transform: uppercase;
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
