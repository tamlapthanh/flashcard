<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { t } from '../i18n';
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

/* The green border marks the row you picked (while you are still on that card); a list opened without a pick has none. */
const pickedId = ref<string | null>(null);

/* Text can be selected and copied: a click that only ended a text selection must not jump to the word. */
function onRowClick(id: string): void {
  if (window.getSelection()?.toString()) return;
  pickedId.value = id;
  emit('pick', id);
}

/*
 * Lazy rendering: only the first CHUNK rows are drawn when the sheet opens; a marker below the last drawn row loads the next
 * CHUNK as soon as it scrolls near the view. A run of hundreds of words therefore opens at once.
 */
const CHUNK = 40;
const shown = ref(CHUNK);

/*
 * Quick search: typing filters the list by kanji, reading, Hán Việt, meaning or example. Case, Vietnamese accents and
 * hiragana / katakana are ignored (ngan hang finds NGÂN HÀNG, カタカナ finds かたかな). Numbers keep the word's place in the run.
 */
const query = ref<string | null>(''); // the clear (x) button of the box sets it to null

/* With a mouse (web) there is room, so the search box is shown from the start; on a touch screen it stays hidden until the magnifier is tapped. */
const withMouse = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const searchOpen = ref(withMouse);
const searchBox = ref<{ focus: () => void } | null>(null);

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) void nextTick(() => searchBox.value?.focus());
  else query.value = '';
}
const norm = (text: string | null | undefined): string =>
  (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase();
const matches = computed(() => {
  const q = norm((query.value ?? '').trim());
  const all = props.session.cards.map((c, i) => ({ c, n: i + 1 }));
  if (!q) return all;
  return all.filter(({ c }) => norm([c.headword, c.reading, c.hanviet, c.meaning, c.example, c.exampleVi].join(' ')).includes(q));
});
const visibleCards = computed(() => matches.value.slice(0, shown.value));
const hasMore = computed(() => shown.value < matches.value.length);
watch(query, () => {
  shown.value = CHUNK;
  if (rowsEl.value) rowsEl.value.scrollTop = 0;
});
const moreEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function loadMore(): void {
  if (hasMore.value) shown.value = Math.min(shown.value + CHUNK, matches.value.length);
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
  clearTimeout(thumbTimer);
});

/* Every opening starts from the top again with only the first rows drawn. */
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      shown.value = CHUNK;
    } else {
      query.value = ''; // the search box is empty and hidden again next time
      searchOpen.value = withMouse;
    }
  }
);

/* A thin scroll indicator (3px) that appears while the list scrolls and fades out a moment later. */
const thumb = reactive({ top: 0, height: 0, visible: false });
let thumbTimer: ReturnType<typeof setTimeout> | undefined;

function updateThumb(): void {
  const el = rowsEl.value;
  if (!el) return;
  const { scrollTop, scrollHeight, clientHeight } = el;
  if (scrollHeight <= clientHeight + 1) {
    thumb.visible = false;
    return;
  }
  const height = Math.max(28, (clientHeight / scrollHeight) * clientHeight);
  thumb.height = height;
  thumb.top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height);
  thumb.visible = true;
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => (thumb.visible = false), 900);
}

const currentId = computed(() => props.session.current?.id ?? null);
</script>

<!-- Slides up from the study screen: every word of this run; learned ones are tinted, the one on screen has a green edge. Tap a word to jump to it. -->
<template>
  <v-bottom-sheet :model-value="open" @update:model-value="(v: boolean) => !v && emit('close')">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" @touchstart.passive="swipe.onTouchstart" @touchend.passive="swipe.onTouchend" />
      <!-- the magnifier is pinned in the top right corner (next to the grip): it never moves, with the box shown or hidden -->
      <v-btn class="searchbtn" :icon="searchOpen ? 'mdi-magnify-close' : 'mdi-magnify'" variant="text" size="x-small" density="comfortable" :aria-label="t('list.search')" :aria-expanded="searchOpen" @click="toggleSearch" />
      <!-- the search box takes room only while it is shown (no empty space reserved for it) -->
      <div v-if="searchOpen" class="search mx-3 mb-1">
        <v-text-field
          ref="searchBox"
          v-model="query"
          density="compact"
          variant="plain"
          hide-details
          clearable
          single-line
          prepend-inner-icon="mdi-magnify"
          :placeholder="t('list.search')"
          :aria-label="t('list.search')"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="rowswrap">
      <div ref="rowsEl" class="rows px-3 pb-3" @scroll.passive="updateThumb" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend.passive="onTouchEnd" @touchcancel.passive="onTouchEnd" @wheel="onWheel">
        <template v-for="{ c, n } in visibleCards" :key="c.id">
        <div
          role="button"
          tabindex="0"
          :data-tip="t('tip.row')"
          class="row"
          :class="[session.status(c.id), { now: c.id === pickedId && c.id === currentId }]"
          @click="onRowClick(c.id)"
          @keydown.enter.self.prevent="onRowClick(c.id)"
          @keydown.space.self.prevent="onRowClick(c.id)"
        >
          <!-- the number sits inside the row, in a drawn circle (any number fits) -->
          <span class="no">{{ n }}</span>
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
        </div>
        </template>
        <div v-if="matches.length === 0" class="none">{{ t('list.none') }}</div>
        <!-- the marker that loads the next rows when it comes near the view -->
        <span v-if="hasMore" ref="moreEl" class="more-marker" />
      </div>
      <!-- our own thin scroll indicator: the browser's scrollbar is hidden; this one shows only while scrolling -->
      <span class="thumb" :class="{ on: thumb.visible }" :style="{ top: thumb.top + 'px', height: thumb.height + 'px' }" />
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.searchbtn {
  position: absolute;
  top: 4px;
  right: 12px;
  z-index: 2;
  color: #fff;
  background: rgb(var(--v-theme-primary)) !important; /* same green as the other buttons */
  box-shadow: 0 2px 0 #3f8a1f !important; /* small 3D edge underneath */
}
.searchbtn {
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
@media (hover: hover) and (pointer: fine) {
  .searchbtn:hover {
    box-shadow: 0 1px 0 #3f8a1f !important; /* sinks a little under the mouse */
    transform: translateY(1px);
  }
}
.searchbtn:active {
  box-shadow: 0 0 0 #3f8a1f !important;
  transform: translateY(2px);
}
.searchbtn[aria-expanded='true'] {
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 80%, #000) !important; /* a darker green while the box is open (no movement) */
}
.search {
  flex: 0 0 auto;
  padding: 0 10px;
  border: 1.5px solid var(--leaf); /* green border, like the current row */
  border-radius: 999px;
  background: var(--paper);
}
.search :deep(.v-field) {
  /* Vuetify pads the top of the text more than the bottom: zero it so the cursor and text sit in the middle of the box */
  --v-input-control-height: 34px;
  --v-field-padding-top: 0px;
  --v-field-padding-bottom: 0px;
  --v-field-input-padding-top: 0px;
  --v-field-input-padding-bottom: 0px;
}
.search :deep(.v-field__input) {
  min-height: 34px;
  padding-top: 0;
  padding-bottom: 0;
  align-items: center;
}
.search :deep(.v-field__prepend-inner),
.search :deep(.v-field__append-inner),
.search :deep(.v-field__clearable) {
  align-items: center;
  padding-top: 0;
}
.search :deep(.v-field__prepend-inner .v-icon) {
  color: var(--leaf); /* the magnifier inside the box is green (flat, no 3D) */
  opacity: 1;
}
.none {
  grid-column: 1 / -1;
  padding: 18px 0;
  text-align: center;
  opacity: 0.7;
  font-size: 0.9rem;
}
.more-marker {
  grid-column: 1 / -1;
  height: 1px;
}
.sheet {
  position: relative;
  background: var(--paper);
  /* A fixed height: searching (even down to no result) never shrinks the sheet. Vuetify's dialog rules give a sheet
     "flex: 1 1 100%" and "overflow-y: auto" (the card itself scrolls, with a big scrollbar), so both are overridden here; the
     cap is the overlay's own max-height (the screen minus 48px). */
  --sheet-h: min(95dvh, calc(100dvh - 48px));
  height: var(--sheet-h);
  min-height: var(--sheet-h);
  flex: 0 0 var(--sheet-h) !important;
  overflow-y: hidden !important; /* only the list inside scrolls (with its own thin indicator) */
  display: flex;
  flex-direction: column;
}
.grip {
  flex: 0 0 auto;
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 16px; /* the magnifier sits beside it, in the top right corner */
}
.rows {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  touch-action: pan-y; /* a finger moves the list up and down (the sheet itself is closed by the grip) */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain; /* the page behind never scrolls along; the spring effect above takes over at the ends */
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto; /* web: number | word (kanji + reading below) | Hán Việt | meaning | status (the row is columns 2-5) */
  column-gap: 10px;
  row-gap: 2px; /* rows sit close together */
  align-content: start;
}
.rows {
  scrollbar-width: none; /* the browser's scrollbar is hidden (Firefox) ... */
}
.rows::-webkit-scrollbar {
  display: none; /* ... and in Chrome / Edge / Safari; .thumb below is the only indicator */
}
.rowswrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.rowswrap > .rows {
  flex: 1 1 auto;
}
.thumb {
  position: absolute;
  right: 2px;
  width: 3px;
  border-radius: 2px;
  background: var(--leaf);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}
.thumb.on {
  opacity: 0.55;
}
.row {
  display: grid;
  grid-template-columns: subgrid; /* all rows share the columns of .rows, so everything lines up */
  grid-column: 1 / -1;
  align-items: center;
  width: 100%;
  padding: 5px 12px;
  border: 1px solid var(--paper-edge);
  border-radius: 12px;
  background: var(--paper);
  cursor: pointer;
  user-select: text; /* words, readings and meanings can be selected and copied */
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
  user-select: none; /* the row numbers are not copied along with the text */
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  align-self: center; /* vertically centred against its row */
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border: 1px solid color-mix(in srgb, var(--leaf) 55%, transparent); /* quiet: thin, soft green, not meant to catch the eye */
  border-radius: 999px;
  color: color-mix(in srgb, var(--leaf) 70%, transparent);
  font-size: 0.56rem;
  font-weight: 600;
  line-height: 1;
}
.word {
  display: flex; /* the reading sits right under its kanji, word by word, like on LCT's lookup card */
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
}
.w {
  white-space: nowrap; /* a word never breaks across lines */
  font-size: 1.2rem;
  font-weight: 700;
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
  font-weight: 700; /* the Hán Việt reading in bold */
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
.ex .jp {
  color: rgb(var(--v-theme-on-surface)); /* the same black as the text on the deck screen */
}
.exv {
  font-size: 0.74rem;
  color: rgb(var(--v-theme-on-surface)); /* same black as the deck screen; the smaller size keeps it quieter than the Japanese line */
}
.st {
  display: flex;
  align-items: center;
  min-width: 18px;
}
/* Phones: one word card per line, no row numbers. */
@media (max-width: 560px) {
  .rows {
    grid-template-columns: minmax(0, 1fr);
    padding-inline: 4px !important; /* wider cards: a thin margin left and right (overrides px-3) */
    align-items: start;
    row-gap: 3px;
  }
  .no {
    display: none;
  }
  .row {
    grid-column: 1;
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
/* Phones AND very wide screens: each word is a small card of several lines (kanji + reading, Hán Việt, meaning, example). */
@media (max-width: 560px), (min-width: 1200px) {
  .row {
    grid-template-columns: auto minmax(0, 1fr) auto; /* the word keeps its full width; the Hán Việt next to it takes the rest and wraps */
    grid-template-areas:
      'word hv st'
      'm m m'
      'ex ex ex';
    column-gap: 8px;
    row-gap: 2px;
    padding: 6px 7px 6px 10px;
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
    white-space: normal; /* long Hán Việt wraps onto the next line instead of squeezing the kanji */
    overflow-wrap: anywhere;
    text-align: right; /* Hán Việt sits against the right edge */
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
  .st:empty {
    display: none; /* no status icon: its empty column gives the Hán Việt the extra room on the right */
  }
}
/* Very wide screens: two words per line (1 and 2 side by side, then 3 and 4, ...). The kanji, reading, meaning and example all
   start at the same left edge; the number sits small in the bottom right corner of the card. */
@media (min-width: 1200px) {
  .rows {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: stretch;
    column-gap: 8px;
  }
  .row {
    grid-column: auto;
    position: relative;
  }
  .no {
    position: absolute;
    right: 8px;
    bottom: 6px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    font-size: 0.5rem;
  }
  .m,
  .ex {
    padding-right: 22px; /* keeps long text clear of the number */
  }
}
/* Web (a real mouse): every text of a word - kanji, reading, Hán Việt, meaning, example and its translation - is one size larger.
   Phones keep the sizes above; the buttons and the numbers do not change. */
@media (hover: hover) and (pointer: fine) {
  .w {
    font-size: 1.4rem;
  }
  .r {
    font-size: 0.78rem;
  }
  .hvc {
    font-size: 0.9rem;
  }
  .m {
    font-size: 0.98rem;
  }
  .ex {
    font-size: 0.94rem;
  }
  .exv {
    font-size: 0.84rem;
  }
}
</style>
