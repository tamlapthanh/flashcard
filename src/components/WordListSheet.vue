<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { t } from '../i18n';
import { listOrder } from '../lib/cardOrder';
import { swipeDown } from '../lib/swipeDown';
import { markOf } from '../lib/listMark';
import { STATUS_COLOR, STATUS_ICON, STATUS_ORDER } from '../lib/status';
import { tagStyle } from '../lib/tagColor';
import PitchLine from './PitchLine.vue';
import type { StudySession } from '../session';
import type { StudyResult, StudyStatus } from '../types';

import { VBottomSheet } from 'vuetify/components';

/* inline: the list fills its parent (the "Words" tab on a phone) instead of sliding up as a bottom sheet. */
/* kanjiGrid: the list opened from the deck screen, only for looking: every word is a square of graph paper holding just its kanji (no status buttons). */
const props = defineProps<{ open: boolean; session: StudySession; inline?: boolean; kanjiGrid?: boolean; popupOpen?: boolean }>();
/* A word in its square, with big letters: a short word is as big as the square allows (bigger with the square). A longer one goes on 2 to 4 lines, as many as give the biggest
   letters that fit both the width and the height of the square (every character is about one em wide). The letters never get smaller than a readable size: a word that
   still does not fit then keeps the characters that do and ends with "…". `tileGrid.size` is the side of the square in px. */
function tileLayout(word: string): { text: string; size: string; cut: boolean } {
  const chars = [...word];
  const n = Math.max(1, chars.length);
  const room = tileGrid.size - 10; // the border and the padding of the square
  const wanted = ((n >= 4 ? 1 : n === 3 ? 1.35 : n === 2 ? 1.7 : 2.1) * 16 * tileGrid.size) / 78;
  const smallest = Math.max(12, Math.round(tileGrid.size * 0.2));
  let best = { lines: 1, px: 0 };
  for (let lines = 1; lines <= Math.min(4, n); lines++) {
    const px = Math.min(wanted, (room / Math.ceil(n / lines)) * 0.98, room / (lines * 1.15));
    if (px > best.px + 0.5) best = { lines, px }; // another line only when it makes the letters clearly bigger
  }
  const chunk = (list: string[], per: number): string => {
    const rows: string[] = [];
    for (let i = 0; i < list.length; i += per) rows.push(list.slice(i, i + per).join(''));
    return rows.join('\n');
  };
  if (best.px >= smallest) {
    const per = Math.ceil(n / best.lines);
    return { text: best.lines === 1 ? word : chunk(chars, per), size: `${Math.floor(best.px)}px`, cut: false };
  }
  // too long even for the smallest letters: as many lines and characters as fit, then "…"
  const per = Math.max(1, Math.floor((room / smallest) * 0.98));
  const lines = Math.max(1, Math.floor(room / (smallest * 1.15)));
  const kept = per * lines;
  return { text: chunk(n > kept ? [...chars.slice(0, kept - 1), '…'] : chars, per), size: `${smallest}px`, cut: n > kept };
}
const wrapper = computed(() => (props.inline ? 'div' : VBottomSheet));
const wrapperProps = computed(() =>
  props.inline ? { class: 'inline-wrap' } : { modelValue: props.open, 'onUpdate:modelValue': (v: boolean) => !v && emit('close') }
);
const emit = defineEmits<{ close: []; pick: [id: string, el?: HTMLElement]; dismiss: []; mark: [id: string, result: StudyResult] }>();

/* Three small buttons at the bottom right of every row (beside its number) set that word's status without leaving the list. */
const statusBtns: { result: StudyResult; status: 'again' | 'learned' | 'skipped'; label: () => string; icon: string; color: string }[] = [
  { result: 'again', status: 'again', label: () => t('btn.again'), icon: STATUS_ICON.learning, color: STATUS_COLOR.learning },
  { result: 'learned', status: 'learned', label: () => t('btn.learned'), icon: STATUS_ICON.learned, color: STATUS_COLOR.learned },
  { result: 'skip', status: 'skipped', label: () => t('btn.skip'), icon: STATUS_ICON.skipped, color: STATUS_COLOR.skipped }
];
function setStatus(id: string, b: (typeof statusBtns)[number]): void {
  /* the first tap sets the status, a second tap on the lit button takes it off (the word is New again) */
  emit('mark', id, props.session.status(id) === b.status ? 'new' : b.result);
}

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

let touching = false;
function onTouchStart(e: TouchEvent): void {
  touching = true;
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
  touching = false;
  shift(0, true);
  scheduleSnap(); // a drag that ends without momentum sends no more scroll events
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
  const before = el.scrollTop;
  const diff = glideTarget - before;
  if (Math.abs(diff) <= 1) {
    el.scrollTop = glideTarget;
    return stopGlide();
  }
  // 12% of what is left, but at least 1px a step: the browser rounds the scroll position to whole pixels, and a smaller step would not move the list (it would stay a few pixels short of the target for ever)
  el.scrollTop = before + (Math.abs(diff * 0.12) < 1 ? Math.sign(diff) : diff * 0.12);
  if (el.scrollTop === before) {
    el.scrollTop = glideTarget; // it did not move (an end of the list was hit): go straight there and finish
    return stopGlide();
  }
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

/* Text can be selected and copied: a click that only ended a text selection, or that only cleared one (the browser clears it already on
   press, before the click), must not jump to the word. */
let hadSelection = false;
function onRowsDown(): void {
  hadSelection = !!window.getSelection()?.toString();
}
function onRowClick(id: string, el?: HTMLElement): void {
  const before = hadSelection;
  hadSelection = false;
  if (before) {
    window.getSelection()?.removeAllRanges(); // there was a selection when pressed: this click only drops it
    return;
  }
  if (window.getSelection()?.toString()) return; // a selection made by this very press (a drag over the text): keep it
  pickedId.value = id;
  emit('pick', id, el);
}

/*
 * Lazy rendering: only the first CHUNK rows are drawn when the sheet opens; a marker below the last drawn row loads the next
 * CHUNK as soon as it scrolls near the view. A run of hundreds of words therefore opens at once.
 */
/* The square grid has tiny tiles, so 40 of them do not even fill the screen and the marker would never leave the view (no more rows would load): it draws everything at once (one plain box per word). */
const chunk = (): number => (props.kanjiGrid ? 100000 : 40);
const shown = ref(chunk());

/*
 * Quick search: typing filters the list by kanji, reading, Hán Việt, meaning or example. Case, Vietnamese accents and
 * hiragana / katakana are ignored (ngan hang finds NGÂN HÀNG, カタカナ finds かたかな). Numbers keep the word's place in the LCT-ordered list.
 */
const query = ref<string | null>(''); // the clear (x) button of the box sets it to null

const withMouse = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
/* The search box is hidden from the start (web and phone alike); the magnifier in the corner shows it. */
const searchOpen = ref(false);
/* Square grid: with a mouse the Sino-Vietnamese label shows on hover and a click picks the word (its detail popup). On a touch screen the first tap
   shows the label of that word and a second tap on the same word picks it. */
const labelId = ref<string | null>(null);
/* the square clicked last has another background (a way to see where you got to); it stays through search, filters and closing and opening the list (see lib/listMark.ts) */
const seenId = computed<string | null>({
  get: () => markOf(props.session).value,
  set: (id) => {
    markOf(props.session).value = id;
  }
});
/* With a mouse: moving over another square while a word's popup is open closes the popup and clears the mark. */
/* The label hangs under its square; when the room below (inside the list box) is too small for it, it goes above the square instead. */
const upId = ref<string | null>(null);
function placeLabel(id: string, el: HTMLElement | null): void {
  const box = rowsEl.value?.getBoundingClientRect();
  if (!box || !el) return;
  const r = el.getBoundingClientRect();
  const need = 66; // about the height of the label (two lines) plus its gap
  upId.value = box.bottom - r.bottom < need && r.top - box.top > need ? id : null;
}
function onTileEnter(id: string, e: Event): void {
  if (withMouse) placeLabel(id, e.currentTarget as HTMLElement);
}
/* The mark is let go when the mouse really MOVES (a pointer that rests still does not count: the list opened again under it, the squares sliding under it):
   - while the word's popup is open: as soon as the mouse leaves that square and its popup, in any direction (up towards the search icon too), and the popup closes with it;
   - without a popup (the list was closed and opened again, or the popup was closed): only when the mouse goes over another square, so the search box, the filters and
     the other controls can be used with the mark still there.
   A short grace lets the mouse cross the 1px gap between the square and its popup. */
let dismissTimer: ReturnType<typeof setTimeout> | undefined;
const cancelDismiss = (): void => {
  clearTimeout(dismissTimer);
  dismissTimer = undefined;
};
function onDocMove(e: MouseEvent): void {
  const mark = seenId.value;
  const root = rowsEl.value;
  if (mark === null || !root || optsOpen.value || tagsOpen.value) return cancelDismiss();
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return cancelDismiss();
  if (el.closest('.relpop') || el.closest(`[data-wid="${CSS.escape(mark)}"]`)) return cancelDismiss(); // on the square itself or on its popup
  const tile = el.closest('.ktile');
  const overOtherTile = !!tile && root.contains(tile);
  if (!props.popupOpen && !overOtherTile) return cancelDismiss();
  dismissTimer ??= setTimeout(() => {
    dismissTimer = undefined;
    seenId.value = null;
    emit('dismiss');
  }, 180);
}
watch(
  () => withMouse && seenId.value !== null,
  (on) => {
    if (on) document.addEventListener('mousemove', onDocMove);
    else {
      document.removeEventListener('mousemove', onDocMove);
      cancelDismiss();
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDocMove);
  cancelDismiss();
});
function onTileClick(id: string, e?: Event): void {
  seenId.value = id;
  if (withMouse || labelId.value === id) onRowClick(id, (e?.currentTarget as HTMLElement | null) ?? undefined);
  else {
    labelId.value = id;
    placeLabel(id, (e?.currentTarget as HTMLElement | null) ?? null);
  }
}
const searchBox = ref<{ focus: () => void } | null>(null);

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) void nextTick(() => searchBox.value?.focus());
  else {
    query.value = '';
    tagsOpen.value = false; // only the box closes: the picked tags and the status switches stay as they are
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
/* The list is in the same order as LCT's dictionary manager (see lib/cardOrder.ts), however the run is ordered for study. */
const dictOrder = computed(() => listOrder(props.session.cards));
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
/* Square grid: the tiles stretch to the room there is. Few words: fewer, bigger squares that fill the box (as many columns as give the biggest square
   that still shows every word without scrolling); many words: squares of at least 76px, and the list scrolls. */
const MIN_TILE = 76;
const MAX_TILE = 200;
const TILE_GAP = 1; // keep equal to the gap of .rows.kgrid in the CSS
const tileGrid = reactive({ cols: 0, size: MIN_TILE });
function fitTiles(): void {
  const el = rowsEl.value;
  if (!props.kanjiGrid || !el) return;
  const cs = getComputedStyle(el);
  const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const n = matches.value.length;
  if (w <= 0 || h <= 0 || n === 0) return;
  const maxCols = Math.max(1, Math.floor((w + TILE_GAP) / (MIN_TILE + TILE_GAP)));
  let best = { cols: maxCols, size: (w - (maxCols - 1) * TILE_GAP) / maxCols }; // too many to fit: the narrowest squares allowed, and it scrolls
  let found = 0;
  for (let cols = 1; cols <= maxCols; cols++) {
    const size = (w - (cols - 1) * TILE_GAP) / cols;
    if (size > MAX_TILE) continue;
    const rows = Math.ceil(n / cols);
    if (rows * (size + TILE_GAP) - TILE_GAP <= h && size > found) {
      found = size;
      best = { cols, size };
    }
  }
  tileGrid.cols = best.cols;
  tileGrid.size = Math.floor(best.size * 100) / 100;
}
let tileObserver: ResizeObserver | null = null;
watch(rowsEl, (el) => {
  tileObserver?.disconnect();
  tileObserver = null;
  if (!el || !props.kanjiGrid || typeof ResizeObserver === 'undefined') return;
  tileObserver = new ResizeObserver(() => fitTiles());
  tileObserver.observe(el);
  fitTiles();
});
watch(() => [matches.value.length, props.kanjiGrid, props.open], () => void nextTick(fitTiles));
onBeforeUnmount(() => tileObserver?.disconnect());
const gridStyle = computed(() => (props.kanjiGrid ? { '--kcols': String(tileGrid.cols || 1), '--kts': `${tileGrid.size}px`, '--kf': String(tileGrid.size / 78) } : {}));

const hasMore = computed(() => shown.value < matches.value.length);
watch([query, inLearned, inSkipped, inTodo, selectedTags], () => {
  shown.value = chunk();
  if (rowsEl.value) rowsEl.value.scrollTop = 0;
});
const moreEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function loadMore(): void {
  if (hasMore.value) shown.value = Math.min(shown.value + chunk(), matches.value.length);
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
      shown.value = chunk();
    } else {
      query.value = ''; // the search box is empty and hidden again next time
      labelId.value = null;
      inLearned.value = inSkipped.value = inTodo.value = true;
      optsOpen.value = false;
      selectedTags.value = [];
      tagsOpen.value = false;
      searchOpen.value = false;
    }
  }
);

/* A thin scroll indicator (3px) that appears while the list scrolls and fades out a moment later. */
const thumb = reactive({ top: 0, height: 0, visible: false });
let thumbTimer: ReturnType<typeof setTimeout> | undefined;
/* The square grid always comes to rest with a whole row at the top edge: a row cut by the edge has no top border and looks broken. A short moment after the scrolling
   stops (the wheel glide, a finger lifted, the momentum of a trackpad or a phone is over) the list glides to the nearest row. The squares are `pitch` apart. */
let snapTimer: ReturnType<typeof setTimeout> | undefined;
function snapToRow(): void {
  const el = rowsEl.value;
  if (!el || !props.kanjiGrid || touching || glideRaf) return;
  const pitch = tileGrid.size + TILE_GAP;
  const max = el.scrollHeight - el.clientHeight;
  if (pitch <= 0 || el.scrollTop <= 0.5 || el.scrollTop >= max - 1) return; // at the very top or bottom there is nothing to settle
  const target = Math.min(max, Math.round(el.scrollTop / pitch) * pitch);
  if (Math.abs(target - el.scrollTop) < 1) return;
  glideTarget = target;
  glideRaf = requestAnimationFrame(glide);
}
function scheduleSnap(): void {
  clearTimeout(snapTimer);
  if (props.kanjiGrid) snapTimer = setTimeout(snapToRow, 140);
}
onBeforeUnmount(() => clearTimeout(snapTimer));

function updateThumb(): void {
  const el = rowsEl.value;
  if (!el) return;
  const { scrollTop, scrollHeight, clientHeight } = el;
  scheduleSnap();
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

/* The heading: which deck the list is of, how many words are in each status (what was saved, with what this run changed on top), and the tags it was opened with. */
const statusCounts = computed(() => {
  const n: Record<StudyStatus, number> = { new: 0, learning: 0, learned: 0, skipped: 0 };
  for (const c of props.session.cards) {
    const s = props.session.status(c.id);
    n[s === 'learned' ? 'learned' : s === 'again' ? 'learning' : s === 'skipped' ? 'skipped' : c.progress.status]++;
  }
  return STATUS_ORDER.filter((s) => n[s] > 0).map((s) => ({ s, n: n[s] }));
});

/* Wide web (1200px and up): as many columns as fit (each wants about 560px), 2 to 4. Narrower: one column. */
const winW = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);
const onResize = (): void => void (winW.value = window.innerWidth);
window.addEventListener('resize', onResize);
onBeforeUnmount(() => window.removeEventListener('resize', onResize));
const cols = computed(() => (winW.value < 1200 ? 1 : Math.max(2, Math.min(4, Math.floor(winW.value / 560)))));

const currentId = computed(() => props.session.current?.id ?? null);
</script>

<!-- Slides up from the study screen: every word of this run; learned ones are tinted, the one on screen has a green edge. Tap a word to jump to it. -->
<template>
  <component :is="wrapper" v-bind="wrapperProps">
    <v-card class="sheet" :class="{ inline }" :rounded="inline ? 0 : 't-xl'">
      <div class="grip" @touchstart.passive="swipe.onTouchstart" @touchend.passive="swipe.onTouchend" />
      <!-- which deck this list is of -->
      <!-- the same line as a deck card: its name, the number of cards, and how many are in each status (only the statuses that have any) -->
      <div v-if="session.deckName" class="deckhead mx-3">
        <span class="dname">{{ session.deckName }}</span>
        <span class="dcount">{{ t('deck.total', { total: session.cards.length }) }}</span>
        <span v-for="p in statusCounts" :key="p.s" class="stn" :style="{ '--stc': STATUS_COLOR[p.s] }" :title="t(`status.${p.s}`)"><v-icon :icon="STATUS_ICON[p.s]" size="13" />{{ p.n }}<span class="stl">{{ t(`status.${p.s}`) }}</span></span>
        <span v-if="session.tags.length" class="dcount">{{ t('list.tagsOf', { tags: session.tags.join(', ') }) }}</span>
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
            <!-- first in the fan, always there (faded while no tag is picked): drops every picked tag at once -->
            <button type="button" class="tagopt tagclear" :disabled="!selectedTags.length" :style="{ '--i': 0 }" :title="t('list.clearTags')" :aria-label="t('list.clearTags')" @click.stop="selectedTags = []"><v-icon icon="mdi-close" size="18" /></button>
            <button
              v-for="(tg, idx) in tagChoices"
              :key="tg.tag"
              type="button"
              class="tagopt tagtint"
              :class="{ on: selectedTags.includes(tg.tag) }"
              :style="{ '--i': idx + 1, ...tagStyle(tg.tag) }"
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
      <div ref="rowsEl" class="rows px-3 pb-3" :class="{ kgrid: kanjiGrid, fanopen: optsOpen || tagsOpen }" @pointerdown.capture="onRowsDown" :style="{ '--cols': cols, ...gridStyle }" @scroll.passive="updateThumb" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend.passive="onTouchEnd" @touchcancel.passive="onTouchEnd" @wheel="onWheel">
        <template v-for="{ c, n } in visibleCards" :key="c.id">
        <div
          v-if="kanjiGrid"
          role="button"
          tabindex="0"
          class="ktile jp"
          :class="[session.status(c.id), { show: labelId === c.id, seen: seenId === c.id, up: upId === c.id }]"
          :style="{ fontSize: tileLayout(c.headword).size }"
          :data-wid="c.id"
          @mouseenter="onTileEnter(c.id, $event)"
          @click="onTileClick(c.id, $event)"
          @keydown.enter.self.prevent="onTileClick(c.id, $event)"
          @keydown.space.self.prevent="onTileClick(c.id, $event)"
        >{{ tileLayout(c.headword).text }}<span v-if="c.hanviet || c.meaning || tileLayout(c.headword).cut" class="khv"><span v-if="tileLayout(c.headword).cut" class="khw jp">{{ c.headword }}</span><b v-if="c.hanviet">{{ c.hanviet.toUpperCase() }}</b><span v-if="c.meaning" class="khm">{{ c.meaning }}</span></span></div>
        <div
          v-else
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
            <button
              v-for="b in statusBtns"
              :key="b.result"
              type="button"
              class="stb"
              :class="{ on: session.status(c.id) === b.status }"
              :style="{ '--sc': b.color }"
              :title="b.label()"
              :aria-label="b.label()"
              :aria-pressed="session.status(c.id) === b.status"
              @click.stop="setStatus(c.id, b)"
              @keydown.stop
            ><v-icon :icon="b.icon" size="16" /><span class="stl">{{ b.label() }}</span></button>
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
  </component>
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
  top: 30px; /* right under the button, over the list; its top padding below is the gap, so the box (an invisible frame the mouse can cross) touches the button */
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-height: calc(var(--sheet-h) - 130px); /* the rest of the sheet below the button (header + search box above it); more tags scroll */
  overflow-y: auto; /* many tags scroll inside the fan */
  padding: 11px 3px 5px;
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
  border: 1.5px dashed var(--tfg); /* off: an empty dashed pill, like the card's options (each tag in its own colour) */
  border-radius: 16px;
  background: var(--tbg);
  color: var(--tfg);
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
/* off: no colour of its own (plain paper, soft green text and dashes); only a picked tag shows its colour */
.tagopt:not(.on) {
  background: var(--paper);
  border-color: color-mix(in srgb, var(--leaf) 60%, transparent);
  color: var(--leaf);
}
/* the "drop every tag" button: a round pill with a cross, plain like the unpicked tags */
.tagopt.tagclear {
  width: 32px;
  padding: 0;
  justify-content: center;
  border-color: color-mix(in srgb, var(--leaf) 60%, transparent);
  background: var(--paper);
  color: var(--leaf);
}
.tagopt.tagclear:disabled {
  opacity: 0.45;
  cursor: default;
}
.tagopt.on {
  background: var(--ton); /* lit = words with this tag stay */
  border-style: solid;
  border-color: var(--tfg);
  color: var(--tonfg);
  box-shadow: 0 2px 0 var(--tfg);
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
/* An invisible frame under the three switches, from the gear down to the last one: the mouse can cross the gaps between them without touching the squares below (which would raise and light up). */
.sfan.open::before {
  content: '';
  position: absolute;
  top: 0;
  left: -8px;
  right: -8px;
  height: 154px;
  z-index: 9;
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
  z-index: 10; /* above the squares: a hovered square is raised (z-index 5) and would cover the options fanned out over the list */
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
  border-color: #ef8a17;
  color: #b8600f;
}
.sopt.k-skipped.on {
  background: #ef8a17; /* the same orange as the skipped rows and the Skipped chip of the deck screen */
  border-color: transparent;
  color: #fff;
  box-shadow: 0 3px 0 #b8600f;
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
  background: #fff; /* white like the list; dark mode keeps the paper colour */
}
.v-theme--dark .search {
  background: var(--paper);
}
/* the hint text ("Search a word") is the same black as the kanji on the squares, not a faded grey */
.search :deep(input::placeholder) {
  color: rgb(var(--v-theme-on-surface)) !important;
  opacity: 1 !important;
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
  background: #fff; /* white (the cards and squares keep their cream, so they stand out); dark mode keeps the paper colour below */
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
/* the "Words" tab: fills the space between the top bar and the tab bar; the grip stays as an invisible spacer so the header lines up as in the sheet */
.inline-wrap {
  height: 100%;
}
.sheet.inline {
  --sheet-h: 100%;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto !important;
  box-shadow: none;
}
.sheet.inline .grip {
  display: none; /* the tab is not a sheet: nothing to drag down */
}
.sheet.inline .deckhead {
  margin-top: 6px;
}
.v-theme--dark .sheet {
  background: var(--paper);
}
.grip {
  flex: 0 0 auto;
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 6px; /* the magnifier sits beside it, in the top right corner */
}
/* The heading, like the line of a deck card: name, number of cards, then the count of each status. It takes the row under the grip
   and leaves room on the right for the magnifier. */
.deckhead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  min-width: 0;
  margin-bottom: 4px;
  padding-right: 44px;
}
.dname {
  min-width: 0;
  font-weight: 700;
  font-size: 0.78rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dcount {
  font-weight: 400;
  font-size: 0.72rem;
  opacity: 0.7;
}
.stn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--stc);
  font-size: 0.72rem;
  font-weight: 600;
}
.stl {
  display: none; /* the status name: from a tablet up */
  margin-left: 3px;
  font-weight: 500;
}
@media (min-width: 601px) {
  .stl {
    display: inline;
  }
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
/* the deck screen's list: squares of graph paper (a faint dashed cross in each, like the writing grid), one kanji word per square */
.rows.kgrid {
  grid-template-columns: repeat(var(--kcols, 1), minmax(0, 1fr)) !important;
  grid-auto-rows: var(--kts, 78px); /* a fixed row height keeps the squares square however many there are (aspect-ratio alone gets squeezed once the list is longer than the screen) */
  gap: 1px !important;
  padding-top: 1px !important; /* room for the top border of the first row (the list box clips what sticks out) */
}
.ktile {
  height: var(--kts, 78px);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 2px;
  position: relative;
  border: 1px solid var(--grid);
  border-radius: 6px;
  background-color: #fff; /* white like the list behind it (the border and the cross show the square); learned / skipped / clicked squares are tinted below */
  background-image:
    linear-gradient(to right, transparent calc(50% - 0.5px), var(--grid-soft) calc(50% - 0.5px), var(--grid-soft) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
    linear-gradient(to bottom, transparent calc(50% - 0.5px), var(--grid-soft) calc(50% - 0.5px), var(--grid-soft) calc(50% + 0.5px), transparent calc(50% + 0.5px));
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.1;
  text-align: center;
  white-space: pre-line; /* the long words are split into lines on purpose (tileLayout) */
  cursor: pointer;
  user-select: none;
}
.v-theme--dark .ktile {
  background-color: var(--paper);
}
.ktile.learned {
  background-color: color-mix(in srgb, var(--leaf) 22%, var(--paper));
}
/* While a filter is fanned out over the list, the squares under it do not react to the mouse (no raise, no label, no popup dismiss), wherever the pointer strays; a click on the list still folds the filter. */
.rows.fanopen .ktile {
  pointer-events: none;
}
.ktile.again {
  background-color: color-mix(in srgb, #2f80d1 20%, var(--paper)); /* Again (Learning): blue, like its button */
}
.ktile.skipped {
  background-color: color-mix(in srgb, #ef8a17 20%, var(--paper));
}
/* the Sino-Vietnamese reading, under the tile, only while the mouse is over it */
.khv {
  display: none;
  position: absolute;
  top: calc(100% + 3px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  width: max-content;
  max-width: min(480px, 92vw); /* wide enough for a long word on ONE line: it only wraps when even this is not enough */
  padding: 3px 9px;
  border-radius: 8px;
  background: var(--forest);
  color: #fff;
  font-size: 0.72rem;
  line-height: 1.3;
  text-align: center;
  font-family: var(--font-body, inherit);
  white-space: normal;
  pointer-events: none;
}
.khw {
  display: block;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.25;
  color: #fff;
  overflow-wrap: anywhere; /* the whole word on one line while it fits; broken only where there is no more room */
}
.khv b {
  display: block;
  letter-spacing: 0.02em;
  color: #7fe3b0; /* Sino-Vietnamese: mint (the word above it is white, the meaning below is gold: three colours) */
}
.khm {
  display: block;
  font-weight: 400;
  color: #ffd77a; /* ... the Vietnamese meaning: soft gold */
}
.ktile.up .khv {
  top: auto;
  bottom: calc(100% + 3px); /* not enough room below the square: above it */
}
.ktile.seen {
  background-color: color-mix(in srgb, #8e4ec6 17%, var(--paper)); /* clicked already: a soft purple (learned = green, skipped = blue) */
  border-color: color-mix(in srgb, #8e4ec6 45%, var(--grid));
}
.ktile.show {
  border-color: var(--leaf);
  z-index: 5; /* its label is above the tiles of the next row */
}
.ktile.show .khv {
  display: block; /* a tap on a touch screen */
}
@media (hover: hover) and (pointer: fine) {
  .ktile:hover {
    border-color: var(--leaf);
    z-index: 5;
  }
  .ktile:hover .khv {
    display: block;
  }
}
.row.learned {
  background: color-mix(in srgb, var(--leaf) 22%, var(--paper)); /* already learned */
}
.row.skipped {
  background: color-mix(in srgb, #ef8a17 20%, var(--paper)); /* skipped: orange like the deck screen's Skipped chip (learned = green, the rest = plain paper) */
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
  display: flex; /* the reading sits right above its kanji, word by word */
  flex-direction: column-reverse; /* (the markup has the kanji first) */
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
  flex-direction: column-reverse; /* the reading above its kanji */
  align-items: center; /* the reading is centred over its kanji; the column is as wide as the wider of the two */
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
  justify-content: flex-end;
  gap: 4px;
}
/* three round status buttons (Again / Learned / Skip); the word's own status is filled, the others are outlined */
.stb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  min-height: 24px;
  align-self: stretch; /* as tall as the line they sit on */
  padding: 0;
  border: 1.5px solid color-mix(in srgb, var(--sc) 55%, transparent);
  border-radius: 999px;
  background: none;
  color: var(--sc);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.stl {
  display: none; /* icons only on touch screens */
}
.stb.on {
  background: var(--sc);
  border-color: var(--sc);
  color: #fff;
}
.stb:not(.on):active {
  background: color-mix(in srgb, var(--sc) 30%, transparent);
}
@media (hover: hover) and (pointer: fine) {
  /* web: the buttons carry their names */
  .stb {
    width: auto;
    gap: 4px;
    padding: 0 9px 0 6px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .stl {
    display: inline;
  }
  .stb:not(.on):hover {
    background: color-mix(in srgb, var(--sc) 8%, transparent); /* only a hint (the chosen button is solid, so the two never look alike) */
    border-color: var(--sc);
  }
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
    grid-template-columns: auto minmax(0, 1fr) auto; /* the word keeps its full width; the Hán Việt and the meaning under it take the rest and wrap */
    grid-template-areas:
      'word hv hv'
      'word m m'
      'ex ex st'; /* the meaning sits right under the Hán Việt, beside the kanji; the example fills the bottom line up to the status buttons at its right end */
    column-gap: 8px;
    row-gap: 2px;
    padding: 6px 7px 6px 10px;
  }
  .word {
    grid-area: word;
    align-self: start; /* the kanji stays at the top while the Hán Việt and the meaning stack beside it */
    display: flex;
    flex-direction: column-reverse; /* the reading above the kanji */
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
  .hvc:empty {
    display: none; /* no Hán Việt: no empty line */
  }
  .m {
    grid-area: m;
    font-size: 0.88rem;
    text-align: right; /* right under the Hán Việt, against the right edge */
    align-self: start;
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
    align-self: stretch;
    margin-top: 2px;
    position: relative;
    z-index: 2; /* above a long example, which can run under the buttons */
  }
  /* the example never wraps: a line that does not fit is cut with ... (the card keeps its height and nothing runs under the buttons) */
  .ex .jp,
  .ex .exv {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row:has(.ex:not(.empty)) .st {
    padding-top: 3px;
    border-top: 1px dashed var(--paper-edge); /* continues the dashed line of the example */
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
  /* the number is the last cell of the bottom line, centred against the (tall) status buttons beside it */
  .row {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas:
      'word hv hv hv'
      'word m m m'
      'ex ex st no';
  }
  .st {
    justify-self: end;
  }
  .row .no {
    grid-area: no;
    align-self: center;
    margin-top: 2px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    font-size: 0.5rem;
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
