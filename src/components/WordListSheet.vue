<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { swipeDown } from '../lib/swipeDown';
import PitchLine from './PitchLine.vue';
import type { StudySession } from '../session';

const props = defineProps<{ open: boolean; session: StudySession }>();
const emit = defineEmits<{ close: []; pick: [id: string] }>();

const swipe = swipeDown(() => emit('close')); // drag the sheet down to close it
/*
 * Rubber-band at the ends of the list: pulling past the top or bottom (finger or mouse wheel) stretches the list a little and
 * it springs back, instead of stopping dead.
 */
const rowsEl = ref<HTMLElement | null>(null);
let touchY = 0;
let wheelTimer: ReturnType<typeof setTimeout> | undefined;

function shift(px: number, animate: boolean): void {
  const el = rowsEl.value;
  if (!el) return;
  el.style.transition = animate ? 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3)' : 'none';
  el.style.transform = px === 0 ? '' : `translateY(${px}px)`;
}

const atTop = (el: HTMLElement): boolean => el.scrollTop <= 0;
const atBottom = (el: HTMLElement): boolean => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

function onTouchStart(e: TouchEvent): void {
  touchY = e.touches[0]?.clientY ?? 0;
}

function onTouchMove(e: TouchEvent): void {
  const el = rowsEl.value;
  if (!el) return;
  const dy = (e.touches[0]?.clientY ?? 0) - touchY;
  if ((dy > 0 && atTop(el)) || (dy < 0 && atBottom(el))) shift(Math.max(-70, Math.min(70, dy * 0.35)), false);
  else shift(0, false);
}

function onTouchEnd(): void {
  shift(0, true);
}

/*
 * A mouse wheel jumps in big notches (about 100px per click). To feel like a phone, the notches are collected into a target
 * position and the list glides to it (ease-out) instead of jumping. Trackpads already send fine, smooth deltas, so they
 * are left alone.
 */
let glideTarget = 0;
let glideRaf = 0;

function stopGlide(): void {
  cancelAnimationFrame(glideRaf);
  glideRaf = 0;
}

function glide(): void {
  const el = rowsEl.value;
  if (!el) return stopGlide();
  const diff = glideTarget - el.scrollTop;
  if (Math.abs(diff) < 0.5) {
    el.scrollTop = glideTarget;
    return stopGlide();
  }
  el.scrollTop += diff * 0.12;
  glideRaf = requestAnimationFrame(glide);
}

function onWheel(e: WheelEvent): void {
  const el = rowsEl.value;
  if (!el || e.ctrlKey || Math.abs(e.deltaY) < 1) return;
  const toward = e.deltaY < 0 ? atTop(el) : atBottom(el);
  if (toward) {
    stopGlide();
    shift(e.deltaY < 0 ? 14 : -14, true);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => shift(0, true), 120);
    return;
  }
  const notch = e.deltaMode === 1 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40); // a wheel, not a trackpad
  if (!notch) return;
  e.preventDefault();
  const pixels = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  const max = el.scrollHeight - el.clientHeight;
  glideTarget = Math.max(0, Math.min(max, (glideRaf ? glideTarget : el.scrollTop) + pixels));
  if (!glideRaf) glideRaf = requestAnimationFrame(glide);
}

/* Mouse: besides the wheel, the list can be dragged up and down with the left button (like a finger on a phone). */
let dragFrom = -1;
let dragScroll = 0;
let dragged = false;

function onMouseDown(e: MouseEvent): void {
  const el = rowsEl.value;
  if (!el || e.button !== 0) return;
  stopGlide();
  dragFrom = e.clientY;
  dragScroll = el.scrollTop;
  dragged = false;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent): void {
  const el = rowsEl.value;
  if (!el || dragFrom < 0) return;
  const dy = e.clientY - dragFrom;
  if (Math.abs(dy) > 5) dragged = true;
  if (dragged) el.scrollTop = dragScroll - dy;
}

function onMouseUp(): void {
  dragFrom = -1;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  setTimeout(() => (dragged = false), 0); // the click that ends a drag must not pick a word
}

function onRowClick(id: string): void {
  if (!dragged) emit('pick', id);
}

/*
 * Lazy rendering: only the first CHUNK rows are drawn when the sheet opens; a marker below the last drawn row loads the next
 * CHUNK as soon as it scrolls near the view. A run of hundreds of words therefore opens at once.
 */
const CHUNK = 40;
const shown = ref(CHUNK);
const visibleCards = computed(() => props.session.cards.slice(0, shown.value));
const hasMore = computed(() => shown.value < props.session.cards.length);
const moreEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function loadMore(): void {
  if (hasMore.value) shown.value = Math.min(shown.value + CHUNK, props.session.cards.length);
}

/* (Re)attach the observer to the marker; it only exists while there is more to show. */
watch([moreEl, rowsEl], ([marker, root]) => {
  observer?.disconnect();
  observer = null;
  if (!marker || !root) return;
  observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { root, rootMargin: '300px 0px' });
  observer.observe(marker);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  stopGlide();
});

/* Every opening starts from the top again with only the first rows drawn. */
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) shown.value = CHUNK;
  }
);

const currentId = computed(() => props.session.current?.id ?? null);
</script>

<!-- Slides up from the study screen: every word of this run; learned ones are tinted, the one on screen has a green edge. Tap a word to jump to it. -->
<template>
  <v-bottom-sheet :model-value="open" @update:model-value="(v: boolean) => !v && emit('close')">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" @touchstart.passive="swipe.onTouchstart" @touchend.passive="swipe.onTouchend" />
      <div ref="rowsEl" class="rows px-3 pb-3" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend.passive="onTouchEnd" @touchcancel.passive="onTouchEnd" @wheel="onWheel" @mousedown="onMouseDown">
        <template v-for="(c, i) in visibleCards" :key="c.id">
        <!-- the number sits OUTSIDE the row, in a drawn circle (any number fits) -->
        <span class="no">{{ i + 1 }}</span>
        <button
          type="button"
          class="row"
          :class="[session.status(c.id), { now: c.id === currentId }]"
          @click="onRowClick(c.id)"
        >
          <span class="word">
            <!-- furigana known: each kanji piece with its reading right under it, spread out so the two line up -->
            <span v-if="c.furigana" class="jline">
              <span v-for="(seg, k) in c.furigana" :key="k" class="seg">
                <span class="jp w">{{ seg.text }}</span>
                <span class="rd r"><PitchLine v-if="seg.morae" :morae="seg.morae" /><template v-else>{{ seg.ruby ?? '' }}</template></span>
              </span>
            </span>
            <template v-else>
              <span class="jp w">{{ c.headword }}</span>
              <span class="rd r"><PitchLine v-if="c.pitchMorae" :morae="c.pitchMorae" /><template v-else>{{ c.reading ?? '' }}</template></span>
            </template>
          </span>
          <span class="hv hvc">{{ c.hanviet ? c.hanviet.toUpperCase() : '' }}</span>
          <span class="m">{{ c.meaning }}</span>
          <!-- only on wide screens (see the media query); always rendered so the columns stay aligned -->
          <span class="ex" :class="{ empty: !c.example }">
            <span class="jp">{{ c.example ?? '' }}</span>
            <span v-if="c.exampleVi" class="exv">{{ c.exampleVi }}</span>
          </span>
          <span class="st">
            <v-icon v-if="session.status(c.id) === 'learned'" icon="mdi-check-circle" size="18" color="primary" />
            <v-icon v-else-if="session.status(c.id) === 'again'" icon="mdi-help-circle-outline" size="18" color="secondary" />
          </span>
        </button>
        </template>
        <!-- the marker that loads the next rows when it comes near the view -->
        <span v-if="hasMore" ref="moreEl" class="more-marker" />
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.more-marker {
  grid-column: 1 / -1;
  height: 1px;
}
.sheet {
  background: var(--paper);
  max-height: 92dvh; /* tall: many words show at once */
  display: flex;
  flex-direction: column;
}
.grip {
  flex: 0 0 auto;
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 8px;
}
.rows {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  touch-action: pan-y; /* a finger moves the list up and down (the sheet itself is closed by the grip) */
  -webkit-overflow-scrolling: touch;
  user-select: none; /* dragging with the mouse must not select text */
  overscroll-behavior: contain; /* the page behind never scrolls along; the spring effect above takes over at the ends */
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto; /* web: number | word (kanji + reading below) | Hán Việt | meaning | status (the row is columns 2-5) */
  column-gap: 10px;
  row-gap: 2px; /* rows sit close together */
  align-content: start;
}
/* As thin as a scrollbar can be: a 2px line, no track. (Chrome / Edge / Safari; Firefox gets its thinnest built-in one.) */
.rows::-webkit-scrollbar {
  width: 2px;
  height: 2px;
}
.rows::-webkit-scrollbar-track {
  background: transparent;
}
.rows::-webkit-scrollbar-thumb {
  background: var(--paper-edge);
  border-radius: 1px;
}
@supports (-moz-appearance: none) {
  .rows {
    scrollbar-width: thin;
    scrollbar-color: var(--paper-edge) transparent;
  }
}
.row {
  display: grid;
  grid-template-columns: subgrid; /* all rows share the columns of .rows, so everything lines up */
  grid-column: 2 / -1;
  align-items: center;
  width: 100%;
  padding: 5px 12px;
  border: 1px solid var(--paper-edge);
  border-radius: 12px;
  background: var(--paper);
  color: var(--jp); /* the app's ink colour (dark in light mode, light in dark mode), never the browser's button / white text */
  text-align: start;
}
.row.learned {
  background: color-mix(in srgb, var(--leaf) 22%, var(--paper)); /* already learned */
}
.row.skipped {
  opacity: 0.55;
}
.row.now {
  border-color: var(--leaf);
  box-shadow: 0 0 0 1px var(--leaf);
}
.no {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  align-self: center; /* vertically centred against its row */
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border: 1.5px solid var(--leaf);
  border-radius: 999px;
  color: var(--leaf);
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1;
}
.word {
  display: flex; /* the reading sits right under its kanji, word by word, like on LCT's lookup card */
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
}
.w {
  font-size: 1.2rem;
  font-weight: 500;
  color: var(--headword); /* same red as the headword on LCT's lookup card */
}
.jline {
  display: flex;
  align-items: flex-start;
}
.seg {
  display: flex;
  flex-direction: column;
  align-items: center; /* the reading is centred under its kanji; the column is as wide as the wider of the two */
}
.seg .r {
  min-height: 1em; /* okurigana (no reading) still keep the line height, so every piece sits on the same baseline */
}
.r {
  font-size: 0.68rem;
  color: var(--reading); /* deeper blue, full strength */
  white-space: nowrap;
}
.hvc {
  font-size: 0.78rem;
  white-space: nowrap;
}
.m {
  min-width: 0;
  font-size: 0.82rem;
  line-height: 1.3;
}
.ex {
  display: none; /* shown only when there is room */
  min-width: 0;
  flex-direction: column;
  font-size: 0.82rem;
  line-height: 1.3;
}
.exv {
  font-size: 0.74rem;
  color: var(--gloss); /* the Vietnamese of the example: grey, quieter than the Japanese line above */
}
.st {
  display: flex;
  align-items: center;
  min-width: 18px;
}
/* Phones: each word is a small card of several lines (kanji + reading, Hán Việt, meaning, example) instead of one wide row. */
@media (max-width: 560px) {
  .rows {
    grid-template-columns: minmax(0, 1fr); /* just the word cards, no row numbers */
    padding-inline: 4px !important; /* wider cards: a thin margin left and right (overrides px-3) */
    align-items: start;
    row-gap: 3px;
  }
  .no {
    display: none;
  }
  .row {
    grid-column: 1;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'word hv st'
      'm m m'
      'ex ex ex';
    column-gap: 8px;
    row-gap: 2px;
    padding: 6px 10px;
  }
  .word {
    grid-area: word;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.15;
  }
  .r {
    font-size: 0.65rem;
  }
  .hvc {
    grid-area: hv;
  }
  .m {
    grid-area: m;
    font-size: 0.88rem;
  }
  .ex {
    grid-area: ex;
    display: flex;
    margin-top: 2px;
    padding-top: 3px;
    border-top: 1px dashed var(--paper-edge);
  }
  .ex.empty {
    display: none; /* no example: no empty line */
  }
  .st {
    grid-area: st;
  }
}
/* Wide screens: there is room for the example sentence (and its Vietnamese) as one more column. */
@media (min-width: 900px) {
  .rows {
    grid-template-columns: auto auto auto minmax(0, 1fr) minmax(0, 1.4fr) auto;
  }
  .ex {
    display: flex;
  }
}
</style>
