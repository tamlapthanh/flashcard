<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { t } from '../i18n';

/*
 * The floating context button: a round orange button over a screen. A tap fans its actions out as a column of pills
 * beside it, on the side with more room; dragging moves the button anywhere inside the viewport (the position is not
 * saved, every visit starts at the same place). A phone does not show it: the screen is too small there.
 * The screen decides what the actions are (the grading buttons of a study run, the way to the other screens, ...).
 */
type CtxItem = { key: string; icon: string; label: string; disabled?: boolean; run: () => void };
const props = defineProps<{ items: CtxItem[] }>();
const emit = defineEmits<{ pick: [item: CtxItem]; open: [] }>();

const CTX_SIZE = 40;
const CTX_OPT_W = 116; // one pill
const CTX_OPT_H = 32;
const CTX_OPT_GAP = 6;
const EDGE = 8; // the button keeps this far from the edges of the screen
const BOTTOM = 10; // and this far from the bottom
const PHONE = '(max-width: 560px)';
const START_MARGIN = 12; // it starts this far from the right edge, level with the middle of the screen

const phoneQuery = typeof window !== 'undefined' ? window.matchMedia(PHONE) : null;
const isPhone = ref(phoneQuery?.matches ?? false);
const open = ref(false);
const onPhoneChange = (e: MediaQueryListEvent): void => {
  isPhone.value = e.matches;
  open.value = false;
};
phoneQuery?.addEventListener('change', onPhoneChange);

const pos = reactive({
  x: typeof window === 'undefined' ? 0 : window.innerWidth - CTX_SIZE - START_MARGIN,
  y: typeof window === 'undefined' ? 0 : Math.round((window.innerHeight - CTX_SIZE) / 2)
});
const vp = reactive({ w: typeof window === 'undefined' ? 0 : window.innerWidth, h: typeof window === 'undefined' ? 0 : window.innerHeight });
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/* The pills come out as a column beside the button; near the bottom of the screen the column moves up instead.
   The CSS opens them with the staggered effect of the show / hide fan of the study screen. */
const options = computed(() => {
  const items = props.items;
  const stack = items.length * CTX_OPT_H + (items.length - 1) * CTX_OPT_GAP;
  const cx = pos.x + CTX_SIZE / 2;
  const cy = pos.y + CTX_SIZE / 2;
  const left = clamp(cx < vp.w / 2 ? pos.x + CTX_SIZE + 8 : pos.x - 8 - CTX_OPT_W, EDGE, Math.max(EDGE, vp.w - EDGE - CTX_OPT_W));
  const dx = left + CTX_OPT_W / 2 - cx; // the pill's centre, measured from the button's centre (the CSS starts it there)
  const top = clamp(pos.y + stack <= vp.h - BOTTOM ? pos.y : pos.y + CTX_SIZE - stack, EDGE, Math.max(EDGE, vp.h - BOTTOM - stack));
  return items.map((it, i) => ({ ...it, dx, dy: top + i * (CTX_OPT_H + CTX_OPT_GAP) + CTX_OPT_H / 2 - cy }));
});

let drag: { id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
let swallow = 0; // the click that ends a drag must not also open the fan

function down(e: PointerEvent): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent): void {
  const d = drag;
  if (!d || d.id !== e.pointerId) return;
  const dx = e.clientX - d.sx;
  const dy = e.clientY - d.sy;
  if (!d.moved && Math.hypot(dx, dy) < 5) return; // still a tap: the fan opens on release
  d.moved = true;
  open.value = false;
  pos.x = clamp(d.ox + dx, EDGE, vp.w - CTX_SIZE - EDGE);
  pos.y = clamp(d.oy + dy, EDGE, vp.h - CTX_SIZE - BOTTOM);
}
function up(e: PointerEvent): void {
  const d = drag;
  if (!d || d.id !== e.pointerId) return;
  if (d.moved) swallow = performance.now() + 350;
  drag = null;
}
function click(): void {
  if (performance.now() < swallow) return;
  open.value = !open.value;
  if (open.value) emit('open'); // the screen folds its own fans back
}
function pick(item: CtxItem): void {
  if (item.disabled) return;
  open.value = false;
  emit('pick', item);
}
function close(): void {
  open.value = false;
}
function onResize(): void {
  vp.w = window.innerWidth;
  vp.h = window.innerHeight;
  pos.x = clamp(pos.x, EDGE, vp.w - CTX_SIZE - EDGE);
  pos.y = clamp(pos.y, EDGE, vp.h - CTX_SIZE - BOTTOM);
  open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) setTimeout(() => window.addEventListener('click', close, { once: true }), 0);
  else window.removeEventListener('click', close);
});
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('click', close);
  phoneQuery?.removeEventListener('change', onPhoneChange);
});
defineExpose({ close });
</script>

<template>
  <div v-if="!isPhone" class="ctxfan" :class="{ open }" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <button
      v-for="(o, idx) in options"
      :key="o.key"
      type="button"
      class="ctxopt"
      :class="'o-' + o.key"
      :style="{ '--dx': o.dx + 'px', '--dy': o.dy + 'px', '--i': idx, '--n': options.length }"
      :title="o.label"
      :aria-label="o.label"
      :disabled="o.disabled"
      :aria-hidden="open ? undefined : 'true'"
      :tabindex="open ? undefined : -1"
      @click.stop="pick(o)"
    ><v-icon :icon="o.icon" /><span class="ctxopt-lbl">{{ o.label }}</span></button>
    <v-btn
      class="tool3d ctxbtn"
      icon="mdi-dots-vertical"
      variant="text"
      color="primary"
      :aria-label="t('nav.actions')"
      :aria-expanded="open"
      aria-haspopup="menu"
      :data-tip="t('nav.actions')"
      @pointerdown.stop="down"
      @pointermove.stop="move"
      @pointerup.stop="up"
      @pointercancel.stop="up"
      @click.stop="click"
    />
  </div>
</template>

<style scoped>
/* the button itself: 40 x 40, orange like Skip and the resume button of the top bar, 3D like the other buttons */
.ctxfan {
  position: fixed;
  z-index: 1100;
  width: 40px;
  height: 40px;
}
.ctxbtn.v-btn {
  width: 40px !important;
  height: 40px !important;
  min-width: 0 !important;
  border-radius: 999px !important;
  touch-action: none; /* dragging it must not scroll the page or swipe a card */
  user-select: none;
  cursor: grab;
}
.ctxbtn.v-btn:not(.v-btn--disabled) {
  background: #ef8a17 !important;
  color: #fff !important;
  box-shadow: 0 3px 0 #b8600f;
}
@media (hover: hover) and (pointer: fine) {
  .ctxbtn.v-btn:not(.v-btn--disabled):hover {
    background-color: #f7a94d !important;
    box-shadow: 0 1px 0 #b8600f;
    transform: translateY(2px);
  }
}
.ctxbtn.v-btn:not(.v-btn--disabled):active {
  box-shadow: 0 0 0 #b8600f;
  transform: translateY(3px);
  cursor: grabbing;
}
.ctxbtn.v-btn :deep(.v-icon) {
  font-size: 22px;
}
.ctxfan .tool3d.v-btn {
  position: relative;
  z-index: 2; /* the button stays above the pills while they fold back behind it */
}
/* the actions: a pill with an icon and its name, starting centred on the button and moving out to --dx / --dy */
.ctxfan .ctxopt {
  position: absolute;
  left: calc((40px - 116px) / 2);
  top: calc((40px - 32px) / 2);
  width: 116px;
  height: 32px;
  padding: 0 10px;
  box-sizing: border-box;
  border: 0;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  font-family: inherit; /* an action's name is not Japanese */
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  text-transform: none;
  white-space: nowrap;
  cursor: pointer;
  background: var(--oc, #3f8a1f);
  color: #fff;
  box-shadow: 0 2px 0 var(--od, #2d6a1a);
  opacity: 0;
  pointer-events: none;
  transform: translate(0, 0) scale(0.4);
  /* closing: the outermost pill folds first, one after another (quick, it should be gone at once) */
  transition: transform 0.28s cubic-bezier(0.45, 0, 0.2, 1) calc((var(--n) - 1 - var(--i)) * 35ms), opacity 0.24s ease calc((var(--n) - 1 - var(--i)) * 35ms);
}
.ctxfan.open .ctxopt {
  opacity: 1;
  pointer-events: auto;
  transform: translate(var(--dx), var(--dy)) scale(1);
  /* opening: the nearest pill appears first, the outermost last; the column is out in about a third of a second */
  transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) calc(var(--i) * 26ms), opacity 0.2s ease calc(var(--i) * 26ms);
}
@media (hover: hover) and (pointer: fine) {
  .ctxfan.open .ctxopt:hover {
    box-shadow: 0 1px 0 var(--od, #2d6a1a);
    transform: translate(var(--dx), calc(var(--dy) + 1px)) scale(1);
  }
}
.ctxfan.open .ctxopt:disabled {
  opacity: 0.5; /* the seal is landing: the action cannot be taken right now */
  cursor: default;
}
.ctxfan .ctxopt .v-icon {
  font-size: 17px;
}
.ctxfan .ctxopt-lbl {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* one colour per action, the same as its button in the top bar / its tile in the menu */
.ctxfan .ctxopt.o-again { --oc: #2f80d1; --od: #1f5a99; }
.ctxfan .ctxopt.o-learned { --oc: #5db82f; --od: #3f8a1f; }
.ctxfan .ctxopt.o-skip { --oc: #ef8a17; --od: #b8600f; }
.ctxfan .ctxopt.o-test { --oc: #1e88e5; --od: #1565a8; }
.ctxfan .ctxopt.o-list { --oc: #8e4ec6; --od: #6a3499; }
.ctxfan .ctxopt.o-decks { --oc: #3e9f2f; --od: #2d7a22; } /* green, the Decks tile of the menu */
.ctxfan .ctxopt.o-tests { --oc: #e5533d; --od: #a83a2a; } /* red, the Tests tile */
.ctxfan .ctxopt.o-settings { --oc: #f5a623; --od: #b8790f; } /* gold, the Settings tile */
</style>
