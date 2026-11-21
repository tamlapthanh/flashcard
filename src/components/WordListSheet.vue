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
 * hiragana / katakana are ignored (ngan hang finds NGÂN HÀNG, カタカナ finds かたかな). Numbers keep the word's place in the dictionary-ordered list.
 */
const query = ref<string | null>(''); // the clear (x) button of the box sets it to null

/* With a mouse (web) there is room, so the search box is shown from the start; on a touch screen it stays hidden until the magnifier is tapped. */
const withMouse = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const searchOpen = ref(withMouse);
const searchBox = ref<{ focus: () => void } | null>(null);

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) void nextTick(() => searchBox.value?.focus());
  else {
    query.value = '';
    selectedTags.value = []; // the tag button is hidden with the box, so its filter must not stay on unseen
    tagsOpen.value = false;
  }
}
const norm = (text: string | null | undefined): string =>
  (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase();
/* Search options (the gear at the right end of the box fans them out, like the eye button on the card; lit = included):
   learned words, skipped words, and the rest (not seen yet / again). */
const inLearned = ref(true);
const inSkipped = ref(true);
const inTodo = ref(true);
const optsOpen = ref(false);
const searchOpts = computed(() => [
  { key: 'learned', glyph: '済', label: t('list.fLearned'), on: inLearned.value, dx: 0, dy: 40, toggle: () => flip(inLearned) },
  { key: 'skipped', glyph: '休', label: t('list.fSkipped'), on: inSkipped.value, dx: 0, dy: 76, toggle: () => flip(inSkipped) },
  { key: 'todo', glyph: '未', label: t('list.fTodo'), on: inTodo.value, dx: 0, dy: 112, toggle: () => flip(inTodo) }
]);
/* Switches one option on or off; every one may be off (then the list is empty). */
function flip(option: { value: boolean }): void {
  option.value = !option.value;
}
const foldOpts = (): void => {
  optsOpen.value = false;
};
watch(optsOpen, (isOpen) => {
  if (isOpen) setTimeout(() => window.addEventListener('click', foldOpts, { once: true }), 0);
  else window.removeEventListener('click', foldOpts);
});
/* Tag filter: the tags to choose from are the ones the run was opened with (or, with none picked, every tag on its cards).
   With fewer than two to choose from there is nothing to filter by, so the button is not shown. Any match (like the server). */
const selectedTags = ref<string[]>([]);
const tagsOpen = ref(false);
const tagChoices = computed(() => {
  const counts = new Map<string, number>();
  const only = props.session.tags.length ? new Set(props.session.tags) : null;
  for (const c of props.session.cards) for (const tg of c.tags) if (!only || only.has(tg)) counts.set(tg, (counts.get(tg) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([tag, count]) => ({ tag, count }));
});
const canFilterTags = computed(() => tagChoices.value.length >= 2);
function toggleTag(tag: string): void {
  selectedTags.value = selectedTags.value.includes(tag) ? selectedTags.value.filter((x) => x !== tag) : [...selectedTags.value, tag];
}
const foldTags = (): void => {
  tagsOpen.value = false;
};
watch(tagsOpen, (isOpen) => {
  if (isOpen) setTimeout(() => window.addEventListener('click', foldTags, { once: true }), 0);
  else window.removeEventListener('click', foldTags);
});
/* The list is in dictionary order (reading in 五十音 order, the headword when there is no reading), however the run is shuffled for study.
   The collator treats hiragana and katakana alike and puts Latin words before kana. */
const collator = new Intl.Collator('ja');
const dictOrder = computed(() =>
  [...props.session.cards].sort((a, b) => collator.compare(a.reading || a.headword, b.reading || b.headword) || collator.compare(a.headword, b.headword))
);
const matches = computed(() => {
  const q = norm((query.value ?? '').trim());
  let all = dictOrder.value.map((c, i) => ({ c, n: i + 1 }));
  if (canFilterTags.value && selectedTags.value.length) {
    const want = selectedTags.value;
    all = all.filter(({ c }) => c.tags.some((tg) => want.includes(tg)));
  }
  if (!(inLearned.value && inSkipped.value && inTodo.value)) {
    all = all.filter(({ c }) => {
      const st = props.session.status(c.id);
      return st === 'learned' ? inLearned.value : st === 'skipped' ? inSkipped.value : inTodo.value;
    });
  }
  if (!q) return all;
  return all.filter(({ c }) => norm([c.headword, c.reading, c.hanviet, c.meaning, c.example, c.exampleVi].join(' ')).includes(q));
});
const visibleCards = computed(() => matches.value.slice(0, shown.value));
const hasMore = computed(() => shown.value < matches.value.length);
watch([query, inLearned, inSkipped, inTodo, selectedTags], () => {
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
      inLearned.value = inSkipped.value = inTodo.value = true;
      optsOpen.value = false;
      selectedTags.value = [];
      tagsOpen.value = false;
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

/* The heading: which deck the list is of, how many of its words are learned (saved progress + this run), and the tags it was opened with. */
const learnedCount = computed(() => props.session.cards.filter((c) => props.session.status(c.id) === 'learned' || c.progress.status === 'learned').length);

/* Wide web (1200px and up): as many columns as fit (each wants about 560px), 2 to 4. Narrower: one column. */
const winW = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);
const onResize = (): void => void (winW.value = window.innerWidth);
window.addEventListener('resize', onResize);
onBeforeUnmount(() => window.removeEventListener('resize', onResize));
const cols = computed(() => (winW.value < 1200 ? 1 : Math.max(2, Math.min(4, Math.floor(winW.value / 560)))));
const altRow = (idx: number): boolean => Math.floor(idx / cols.value) % 2 === 1;

const currentId = computed(() => props.session.current?.id ?? null);
</script>

<!-- Slides up from the study screen: every word of this run; learned ones are tinted, the one on screen has a green edge. Tap a word to jump to it. -->
<template>
  <v-bottom-sheet :model-value="open" @update:model-value="(v: boolean) => !v && emit('close')">
    <v-card class="sheet" rounded="t-xl">
      <div class="grip" @touchstart.passive="swipe.onTouchstart" @touchend.passive="swipe.onTouchend" />
      <!-- which deck this list is of -->
      <div v-if="session.deckName" class="deckhead mx-3">
        <span class="dname">{{ session.deckName }}<span class="dcount"> · {{ t('list.learnedOf', { a: learnedCount, b: session.cards.length }) }}<template v-if="session.tags.length"> · {{ t('list.tagsOf', { tags: session.tags.join(', ') }) }}</template></span></span>
      </div>
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
        <!-- tag filter, just left of the gear: the button fans the tags out downward (lit = kept; none lit = every word) -->
        <div v-if="canFilterTags" class="tagfab" :class="{ open: tagsOpen }">
          <div class="tagfan">
            <button
              v-for="(tg, idx) in tagChoices"
              :key="tg.tag"
              type="button"
              class="tagopt"
              :class="{ on: selectedTags.includes(tg.tag) }"
              :style="{ '--i': idx }"
              :aria-pressed="selectedTags.includes(tg.tag)"
              @click.stop="toggleTag(tg.tag)"
            >{{ tg.tag }}<span class="tn">{{ tg.count }}</span></button>
          </div>
          <v-btn icon="mdi-tag-multiple-outline" variant="text" size="x-small" density="comfortable" class="tagbtn" :class="{ filtered: selectedTags.length }" :aria-label="t('list.tags')" :aria-expanded="tagsOpen" @click.stop="tagsOpen = !tagsOpen" />
          <span v-if="selectedTags.length" class="tcount">{{ selectedTags.length }}</span>
        </div>
        <!-- the options gear, at the far right of the box: tap to fan out the switches (lit = included in the search) -->
        <div class="sfan" :class="{ open: optsOpen }">
          <button
            v-for="(o, idx) in searchOpts"
            :key="o.key"
            type="button"
            class="sopt"
            :class="['k-' + o.key, { on: o.on }]"
            :style="{ '--dx': o.dx + 'px', '--dy': o.dy + 'px', '--i': idx }"
            :title="o.label"
            :aria-label="o.label"
            :aria-pressed="o.on"
            @click.stop="o.toggle()"
          >{{ o.glyph }}</button>
          <v-btn icon="mdi-tune-variant" variant="text" color="primary" size="x-small" density="comfortable" class="gear" :class="{ filtered: !(inLearned && inSkipped && inTodo) }" :aria-label="t('list.options')" :aria-expanded="optsOpen" @click.stop="optsOpen = !optsOpen" />
        </div>
      </div>
      <div class="rowswrap">
      <div ref="rowsEl" class="rows px-3 pb-3" :style="{ '--cols': cols }" @scroll.passive="updateThumb" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend.passive="onTouchEnd" @touchcancel.passive="onTouchEnd" @wheel="onWheel">
        <template v-for="({ c, n }, idx) in visibleCards" :key="c.id">
        <div
          role="button"
          tabindex="0"
          :data-tip="t('tip.row')"
          class="row"
          :class="[session.status(c.id), { now: c.id === pickedId && c.id === currentId, alt: altRow(idx) }]"
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
/* options gear at the right end of the search box */
.search {
  display: flex;
  align-items: center;
}
.search :deep(.v-input) {
  flex: 1;
  min-width: 0;
}
/* tag filter: a round 3D button left of the gear; its tags fan out downward as pills (same look as the card's options) */
.tagfab {
  position: relative;
  flex: 0 0 auto;
  align-self: center;
  top: -1px; /* optical centring, like the gear */
  width: 30px;
  height: 30px;
  margin-left: 4px;
}
.tagbtn.v-btn {
  position: absolute;
  inset: 0;
  margin: 0 !important;
  width: 30px !important;
  height: 30px !important;
  background: #2f80d1 !important; /* blue, so it does not look like the green gear next to it */
  color: #fff !important;
  box-shadow: 0 3px 0 #1f5a99 !important; /* pressed-in 3D edge, like the gear */
  border: 0;
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
}
.tagbtn.v-btn.filtered {
  background: #ef8a17 !important; /* some tag is picked: orange, like the auto play button when not everything is on */
  box-shadow: 0 3px 0 #b8600f !important;
}
.tagbtn.v-btn:active {
  box-shadow: 0 0 0 transparent !important;
  transform: translateY(3px);
}
@media (hover: hover) and (pointer: fine) {
  /* like the gear: lighter and sinking a little under the mouse */
  .tagbtn.v-btn:not(.filtered):hover {
    background: #5b9fe3 !important;
    box-shadow: 0 1px 0 #1f5a99 !important;
    transform: translateY(2px);
  }
  .tagbtn.v-btn.filtered:hover {
    background: #f5a54a !important;
    box-shadow: 0 1px 0 #b8600f !important;
    transform: translateY(2px);
  }
}
.tcount {
  position: absolute;
  top: -5px;
  right: -5px;
  z-index: 1;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #ef8a17;
  color: #b8600f;
  font-size: 0.65rem;
  font-weight: 800;
  line-height: 13px;
  text-align: center;
  pointer-events: none;
}
.tagfan {
  position: absolute;
  top: 38px; /* right under the button, over the list */
  right: 0;
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-height: calc(var(--sheet-h) - 130px); /* the rest of the sheet below the button (header + search box above it); more tags scroll */
  overflow-y: auto; /* many tags scroll inside the fan */
  padding: 3px 3px 5px;
  scrollbar-width: none;
  visibility: hidden;
  transition: visibility 0s linear 0.5s; /* hidden only after the pills have folded */
}
.tagfan::-webkit-scrollbar {
  display: none;
}
.tagfab.open .tagfan {
  visibility: visible;
  pointer-events: auto;
  transition-delay: 0s;
}
.tagopt {
  flex: 0 0 auto;
  max-width: min(70vw, 320px);
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1.5px dashed #2f80d1; /* off: an empty dashed pill, like the card's options */
  border-radius: 16px;
  background: var(--paper);
  color: #2f80d1;
  font-family: var(--font-jp);
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.35);
  opacity: 0;
  transform: translateY(-14px) scale(0.5);
  transform-origin: right top;
  transition: transform 0.4s cubic-bezier(0.45, 0, 0.2, 1), opacity 0.35s ease;
}
.tagfab.open .tagopt {
  opacity: 1;
  transform: none;
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) calc(var(--i) * 55ms), opacity 0.36s ease calc(var(--i) * 55ms);
}
.tagopt.on {
  background: #2f80d1; /* lit = words with this tag stay */
  border-style: solid;
  border-color: transparent;
  color: #fff;
  box-shadow: 0 2px 0 #1f5a99;
}
.tn {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.75;
}
.sfan {
  position: relative;
  flex: 0 0 auto;
  align-self: center; /* vertically in the middle of the search box */
  top: -1px; /* optical centring: a hair up */
  width: 30px;
  height: 30px;
  margin: 0 0 0 4px;
}
.gear {
  position: absolute;
  inset: 0; /* exactly the 30px box of .sfan, so the gear is centred in it */
  margin: 0 !important;
  width: 30px !important;
  height: 30px !important;
  background: rgb(var(--v-theme-primary)) !important; /* the usual leaf green */
  color: #fff !important;
  border: 0;
  box-shadow: 0 3px 0 #3f8a1f !important; /* pressed-in 3D edge, like the other round buttons */
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
}
.gear.filtered {
  background: var(--paper) !important; /* some option is off: the gear turns pale */
  color: var(--leaf) !important;
  border: 1px solid var(--paper-edge);
  box-shadow: 0 3px 0 rgba(31, 77, 36, 0.4) !important;
}
.gear:active {
  box-shadow: 0 0 0 transparent !important;
  transform: translateY(3px);
}
@media (hover: hover) and (pointer: fine) {
  .gear.filtered:hover {
    background: #d4f5c2 !important; /* pale mint under the mouse */
  }
  .gear:not(.filtered):hover {
    background: #9be35f !important; /* the lighter green of the main buttons under the mouse */
    box-shadow: 0 1px 0 #3f8a1f !important;
    transform: translateY(2px);
  }
}
.sopt {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 5;
  width: 30px;
  height: 30px;
  box-sizing: border-box;
  border: 1.5px solid var(--leaf);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-jp);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  background: var(--paper);
  color: var(--leaf);
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.35);
  opacity: 0;
  pointer-events: none;
  transform: translate(0, 0) scale(0.4);
  transition: transform 0.4s cubic-bezier(0.45, 0, 0.2, 1) calc((1 - var(--i)) * 70ms), opacity 0.35s ease calc((1 - var(--i)) * 70ms);
}
.sfan.open .sopt {
  opacity: 1;
  pointer-events: auto;
  transform: translate(var(--dx), var(--dy)) scale(1);
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) calc(var(--i) * 55ms), opacity 0.36s ease calc(var(--i) * 55ms);
}
.sopt.k-skipped {
  border-color: #d99a1c;
  color: #9a6a00;
}
.sopt.k-skipped.on {
  background: #f2b134; /* the same amber as the skipped rows */
  border-color: transparent;
  color: #4e342e;
  box-shadow: 0 3px 0 #b07a12;
}
.sopt.k-todo {
  border-color: var(--paper-edge);
  color: var(--jp);
}
.sopt.k-todo.on {
  background: var(--paper-edge); /* the rest: the plain paper tone of its rows */
  border-color: transparent;
  color: var(--jp);
  box-shadow: 0 3px 0 rgba(31, 77, 36, 0.35);
}
.sopt.on {
  background: rgb(var(--v-theme-primary)); /* lit = included */
  border-color: transparent;
  color: #fff;
  box-shadow: 0 3px 0 #3f8a1f;
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
  position: relative;
  flex: 0 0 auto;
  padding: 0 2px 0 10px; /* the options gear sits close to the right edge of the box */
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
.deckhead {
  /* on the very top line: left of the grip, level with the magnifier in the right corner */
  position: absolute;
  top: 5px;
  left: 0;
  max-width: calc(50% - 26px);
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  z-index: 1;
}
.dname {
  min-width: 0;
  font-weight: 700;
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dcount {
  font-weight: 400;
  font-size: 0.7rem;
  opacity: 0.7;
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
.row.alt {
  background: color-mix(in srgb, var(--jp) 6%, var(--paper)); /* every second line a little darker (a little lighter in dark mode); on wide screens a "line" is one row of columns */
}
.row.learned {
  background: color-mix(in srgb, var(--leaf) 22%, var(--paper)); /* already learned */
}
.row.skipped {
  background: color-mix(in srgb, #f2b134 26%, var(--paper)); /* skipped: warm amber (learned = green, the rest = plain paper) */
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
    grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
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
