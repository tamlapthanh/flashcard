<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { t, type TextKey } from '../i18n';
import Hanko from './Hanko.vue';
import { brushOutline, type InkPt } from '../lib/brushStroke';
import { judgeStroke, parsePath, type Pt } from '../lib/strokeMatch';
import { addSample, thin } from '../lib/strokeSamples';
import { strokeStart } from '../lib/strokes';
import { settings, STROKE_TOLERANCE } from '../settings';

/*
 * Handwriting practice: the user writes the kanji stroke by stroke on the drawing area. Each stroke is checked as soon as the finger
 * (or mouse) lifts: right = it is replaced by the clean stroke and the next one is expected (the frame flashes green); wrong = the
 * frame shakes and flashes red, the refused stroke stays red for a moment with a red dot where it began, and the right stroke is drawn
 * in green with its number, a dot where it begins and an arrow where it ends, so the two can be compared at a glance. With the faint
 * outline on that happens at once; writing from memory, from the second wrong try on a stroke. A short text names the reason.
 * Finishing is shown by a red seal on the kanji (合 = no wrong stroke, 済 = done) and by icons, not by a sentence.
 * It feels like writing with a brush: with a mouse the pointer is a brush (its tip is where the ink goes), and the stroke being written
 * is thick where the hand is slow, thin where it is fast, and swells at the start (lib/brushStroke.ts). If the check refuses a stroke that
 * was right, "my stroke was right" accepts it and keeps it on this device (lib/strokeSamples.ts) to tune the check with.
 * The check is lib/strokeMatch.ts; how strict it is comes from Settings.
 */
const props = defineProps<{ paths: string[] }>();
/* `revealed`: the kanji may be shown now (the writing is finished, or the faint outline - the kanji itself - is on). */
const emit = defineEmits<{ revealed: [value: boolean] }>();

const BOX = 109; // the KanjiVG box
const HINT_AFTER_FROM_MEMORY = 2; // wrong tries on one stroke, with the outline off, before the right stroke is shown (with it on: at once)
const REJECT_MS = 650; // how long a refused stroke stays on the screen
const FLASH_MS = 450; // the frame's red / green flash and shake

/* Why a stroke was refused -> its text (the matcher's reasons, plus `order`: a good stroke that comes later). */
const WHY: Record<'direction' | 'shape' | 'position' | 'short' | 'long' | 'order', TextKey> = {
  direction: 'practice.direction',
  shape: 'practice.shape',
  position: 'practice.position',
  short: 'practice.short',
  long: 'practice.long',
  order: 'practice.order'
};

const refs = computed(() => props.paths.map(parsePath));
const starts = computed(() => props.paths.map(strokeStart));
const step = ref(0); // strokes already written right
const mistakes = ref(0); // wrong tries in all
const tries = ref(0); // wrong tries on the current stroke
const guide = ref(false); // the faint outline of the whole kanji is shown (trace it); off (the start) = write from memory
const peeked = ref(false); // the outline or the hint button was used: the writing is not entirely from memory any more
const hint = ref(false); // the next stroke is shown
const message = ref('');
const lastReason = ref(''); // why the last stroke was refused
const feedback = ref<'' | 'bad' | 'ok'>(''); // the frame flashes red (and shakes) or green for a moment
const live = ref<InkPt[]>([]); // the stroke being drawn
const rejected = ref<InkPt[]>([]); // the refused stroke, red for a moment
const refused = ref<{ pts: InkPt[]; reason: string; step: number } | null>(null); // the last refused stroke, until the next one is started
const brush = ref<Pt | null>(null); // where the brush is: a mouse (or a pen) is over the drawing
const inking = ref(false); // the brush is down
const finished = computed(() => step.value >= props.paths.length);
const svg = ref<SVGSVGElement | null>(null);
let drawing = false;
let rejectTimer: ReturnType<typeof setTimeout> | undefined;
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

function flash(kind: 'bad' | 'ok'): void {
  feedback.value = '';
  clearTimeout(feedbackTimer);
  // one frame later, so the same flash can play again on the next stroke
  feedbackTimer = setTimeout(() => {
    feedback.value = kind;
    feedbackTimer = setTimeout(() => (feedback.value = ''), FLASH_MS);
  }, 16);
  if (kind === 'bad') buzz(50);
}

/* A short buzz on a phone that can; anywhere else the flash is enough. */
function buzz(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* not allowed here */
  }
}

function reset(): void {
  clearTimeout(rejectTimer);
  clearTimeout(feedbackTimer);
  feedback.value = '';
  lastReason.value = '';
  step.value = 0;
  guide.value = false;
  peeked.value = false;
  mistakes.value = 0;
  tries.value = 0;
  hint.value = false;
  message.value = '';
  live.value = [];
  rejected.value = [];
  refused.value = null;
  inking.value = false;
  drawing = false;
}
watch(() => props.paths, reset);
onBeforeUnmount(() => {
  clearTimeout(rejectTimer);
  clearTimeout(feedbackTimer);
});

/* The arrow at the end of the stroke that is expected: which way it goes (none for a dot). */
const arrow = computed(() => {
  const pts = refs.value[step.value];
  if (!pts || pts.length < 2) return null;
  const end = pts[pts.length - 1]!;
  let from = pts[0]!;
  let walked = 0;
  for (let i = pts.length - 1; i > 0 && walked < 6; i--) {
    walked += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    from = pts[i - 1]!;
  }
  if (walked < 3) return null;
  return { x: end.x, y: end.y, angle: (Math.atan2(end.y - from.y, end.x - from.x) * 180) / Math.PI };
});

/* Pointer position in the 109 x 109 box of the drawing. */
function toBox(e: PointerEvent): Pt {
  const r = svg.value!.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * BOX, y: ((e.clientY - r.top) / r.height) * BOX };
}

/* The brush follows a mouse (or a pen) over the drawing; a finger has no pointer to show. */
function showBrush(e: PointerEvent): void {
  brush.value = e.pointerType === 'touch' ? null : toBox(e);
}

function down(e: PointerEvent): void {
  if (finished.value || e.button > 0) return;
  svg.value?.setPointerCapture(e.pointerId);
  clearTimeout(rejectTimer);
  rejected.value = [];
  refused.value = null;
  drawing = true;
  inking.value = true;
  showBrush(e);
  live.value = [{ ...toBox(e), t: performance.now() }];
}

function move(e: PointerEvent): void {
  showBrush(e);
  if (!drawing) return;
  const p = toBox(e);
  const last = live.value[live.value.length - 1]!;
  if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.8) live.value.push({ ...p, t: performance.now() }); // ignore tiny jitter
}

function up(e: PointerEvent): void {
  if (e.pointerType === 'touch') brush.value = null;
  if (!drawing) return;
  drawing = false;
  inking.value = false;
  const pts = live.value;
  live.value = [];
  if (pts.length > 0) judge(pts.length === 1 ? [pts[0]!, { ...pts[0]! }] : pts); // a tap is a stroke of no length (a dot)
}

function cancel(): void {
  drawing = false;
  inking.value = false;
  brush.value = null;
  live.value = [];
}

function leave(): void {
  if (!drawing) brush.value = null; // while the brush is down the pointer is captured: it can leave the box without lifting
}

/* The stroke was right: the next one is expected. */
function accept(): void {
  step.value++;
  tries.value = 0;
  hint.value = false;
  message.value = '';
  refused.value = null;
  flash('ok');
  if (finished.value) buzz([30, 60, 30]); // the last stroke: a double buzz
}

function judge(pts: InkPt[]): void {
  const verdict = judgeStroke(pts, refs.value, step.value, STROKE_TOLERANCE[settings.strokeStrictness]);
  if (verdict.ok) return accept();
  mistakes.value++;
  tries.value++;
  lastReason.value = verdict.reason;
  message.value = t(WHY[verdict.reason]);
  refused.value = { pts, reason: verdict.reason, step: step.value };
  flash('bad');
  rejected.value = pts;
  clearTimeout(rejectTimer);
  rejectTimer = setTimeout(() => (rejected.value = []), REJECT_MS);
  if (guide.value || tries.value >= HINT_AFTER_FROM_MEMORY) hint.value = true;
}

/* "My stroke was right": the check was wrong. The stroke is accepted and kept (on this device only) with why it was refused. */
function acceptRefused(): void {
  const r = refused.value;
  if (!r) return;
  addSample({
    at: new Date().toISOString(),
    reason: r.reason,
    strokeIndex: r.step,
    strokes: props.paths.length,
    reference: props.paths[r.step] ?? '',
    strictness: settings.strokeStrictness,
    points: thin(r.pts)
  });
  mistakes.value = Math.max(0, mistakes.value - 1); // it was not a mistake
  clearTimeout(rejectTimer);
  rejected.value = [];
  accept();
}
function toggleGuide(): void {
  guide.value = !guide.value;
  if (guide.value) peeked.value = true;
}
function showHint(): void {
  hint.value = true;
  peeked.value = true;
}
const revealed = computed(() => finished.value || guide.value);
watch(revealed, (value) => emit('revealed', value), { immediate: true });

/* The text of the counter: shown on screen while writing; after the last stroke it is only read aloud (the screen shows the seal and icons). */
const prompt = computed(() => (finished.value ? (mistakes.value === 0 ? t('practice.doneClean') : t('practice.done', { n: mistakes.value })) : t('practice.prompt', { n: step.value + 1, total: props.paths.length })));
</script>

<template>
  <div class="practice">
    <div class="canvas">
      <!-- touch-action none keeps the page from scrolling under the finger; the touch events must not reach the sheet (a stroke downwards would close it) -->
      <svg
        ref="svg"
        :viewBox="`0 0 ${BOX} ${BOX}`"
        class="big"
        :class="[feedback, { nocursor: brush }]"
        role="img"
        :aria-label="t('practice.label')"
        @pointerdown.prevent="down"
        @pointermove="move"
        @pointerup="up"
        @pointerenter="showBrush"
        @pointerleave="leave"
        @pointercancel="cancel"
        @touchstart.stop
        @touchend.stop
        @contextmenu.prevent
      >
        <path d="M54.5 0V109M0 54.5H109" class="grid" />
        <path d="M0 0L109 109M109 0L0 109" class="grid soft" />
        <template v-if="guide">
          <path v-for="(d, i) in paths" :key="'g' + i" :d="d" class="stroke ghost" />
        </template>
        <path v-for="(d, i) in paths.slice(0, step)" :key="'s' + i" :d="d" class="stroke" />
        <g v-if="hint && !finished">
          <path :key="'h' + step + '-' + tries" :d="paths[step]" pathLength="1" class="stroke hintp" :class="{ pulse: lastReason === 'order' }" />
          <circle v-if="starts[step]" :cx="starts[step]!.x" :cy="starts[step]!.y" r="3" class="startdot" />
          <text v-if="starts[step]" :x="starts[step]!.x - 3" :y="starts[step]!.y - 5" class="num">{{ step + 1 }}</text>
          <polygon v-if="arrow" points="-4,-3.2 3.4,0 -4,3.2" class="arrow" :transform="`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`" />
        </g>
        <path v-if="rejected.length" :d="brushOutline(rejected)" class="ink bad" />
        <circle v-if="rejected.length" :cx="rejected[0]!.x" :cy="rejected[0]!.y" r="2.6" class="baddot" />
        <path v-if="live.length" :d="brushOutline(live)" class="ink" />
        <!-- the brush (a mouse or a pen): its tip is the pointer; it is a little spread while it is down -->
        <g v-if="brush" class="brush" :class="{ down: inking }" :transform="`translate(${brush.x} ${brush.y}) rotate(24)`" aria-hidden="true">
          <path class="bristle" d="M0 0C-1.7-2.2-2.2-6-1.9-9.5L1.9-9.5C2.2-6 1.7-2.2 0 0Z" />
          <rect class="binding" x="-2" y="-12.6" width="4" height="3.2" rx="0.6" />
          <path class="handle" d="M-1.9-12.6L1.9-12.6L1.25-33L-1.25-33Z" />
          <ellipse class="knob" cx="0" cy="-33" rx="1.4" ry="0.9" />
        </g>
      </svg>
      <!-- finished: a red seal is pressed on the kanji (合 = no wrong stroke, 済 = done) -->
      <Hanko v-if="finished" :char="mistakes === 0 && !peeked ? '合' : '済'" :size="38" stamping class="seal" />
    </div>

    <div class="controls">
      <v-btn class="ctl" :icon="guide ? 'mdi-eye-outline' : 'mdi-eye-off-outline'" :variant="guide ? 'tonal' : 'text'" size="small" :aria-pressed="guide" :aria-label="t('practice.guide')" :title="t('practice.guide')" @click="toggleGuide" />
      <v-btn class="ctl" icon="mdi-lightbulb-on-outline" variant="text" size="small" :disabled="finished" :aria-label="t('practice.hint')" :title="t('practice.hint')" @click="showHint" />
      <v-btn class="ctl" icon="mdi-refresh" variant="text" size="small" :aria-label="t('practice.reset')" :title="t('practice.reset')" @click="reset" />
    </div>
    <div class="count">
      <template v-if="finished">
        <span class="sr">{{ prompt }}</span>
        <span class="total" aria-hidden="true"><v-icon icon="mdi-check-circle" size="16" color="primary" /> {{ paths.length }} / {{ paths.length }}</span>
        <span v-if="mistakes" class="total wrong" aria-hidden="true"><v-icon icon="mdi-close-circle" size="16" color="error" /> {{ mistakes }}</span>
      </template>
      <template v-else>{{ prompt }}</template>
    </div>
    <div class="why" role="status" aria-live="polite">
      <span>{{ message }}</span>
      <!-- the check was wrong: accept the stroke (and keep it on this device to tune the check with) -->
      <button v-if="refused" type="button" class="agree" @click="acceptRefused"><v-icon icon="mdi-check" size="14" /> {{ t('practice.agree') }}</button>
    </div>
  </div>
</template>

<style scoped>
.practice {
  width: 100%;
}
.canvas {
  position: relative;
}
.seal {
  position: absolute;
  right: 8px;
  bottom: 8px;
  pointer-events: none; /* never in the way of the pen */
}
.sr {
  position: absolute; /* read aloud, not shown */
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.total {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 0 6px;
}
.big {
  display: block;
  width: 100%;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
  touch-action: none; /* a finger draws, it does not scroll */
  user-select: none;
  -webkit-user-select: none;
  cursor: crosshair;
  transition: border-color 0.2s;
}
.big.nocursor {
  cursor: none; /* the brush drawn in the picture is the pointer */
}
.big.bad {
  border-color: #d33;
  animation: shake 0.4s;
}
.big.ok {
  border-color: rgb(var(--v-theme-primary));
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20%,
  60% {
    transform: translateX(-4px);
  }
  40%,
  80% {
    transform: translateX(4px);
  }
}
.grid {
  stroke: var(--grid);
  stroke-width: 0.7;
  stroke-dasharray: 3 3;
  fill: none;
}
.grid.soft {
  stroke: var(--grid-soft);
}
.stroke {
  fill: none;
  stroke: var(--headword); /* strokes written right: the same red as the kanji on the card */
  stroke-width: 3.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.stroke.ghost {
  stroke: rgba(var(--v-border-color), 0.35);
}
.ink {
  fill: rgb(var(--v-theme-on-surface)); /* what is being written: black ink */
  stroke: rgb(var(--v-theme-on-surface));
  stroke-width: 0.25;
  stroke-linejoin: round;
}
.ink.bad {
  fill: #d33; /* a refused stroke */
  stroke: #d33;
  opacity: 0.75;
}
.brush {
  pointer-events: none;
}
.brush path,
.brush rect,
.brush ellipse {
  stroke: rgba(255, 255, 255, 0.75); /* a pale edge so the brush shows on the paper in both themes */
  stroke-width: 0.45;
  paint-order: stroke;
}
.bristle {
  fill: #1b1410;
  transform-box: fill-box;
  transform-origin: 50% 100%;
  transition: transform 0.1s;
}
.brush.down .bristle {
  transform: scaleX(1.35); /* pressed on the paper, the bristles spread */
}
.binding {
  fill: #c9a24a;
}
.handle {
  fill: #8b5a2b;
}
.knob {
  fill: #5e3a1a;
}
.hintp {
  stroke: rgb(var(--v-theme-primary));
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: hintdraw 1s ease forwards;
}
@keyframes hintdraw {
  to {
    stroke-dashoffset: 0;
  }
}
.startdot,
.arrow {
  fill: rgb(var(--v-theme-primary));
}
.baddot {
  fill: #d33; /* where the refused stroke began: compare with the green dot */
}
.num {
  font-size: 7px;
  font-weight: 700;
  fill: rgb(var(--v-theme-primary));
}
.hintp.pulse {
  animation: hintdraw 1s ease forwards, pulse 0.6s ease 1s 3; /* "not this stroke yet": the expected one pulses */
}
@keyframes pulse {
  50% {
    stroke-width: 6.5;
  }
}
@media (prefers-reduced-motion: reduce) {
  .big.bad,
  .hintp,
  .hintp.pulse {
    animation: none;
  }
  .hintp {
    stroke-dashoffset: 0;
  }
}
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
  padding-bottom: 3px; /* room for the buttons' edge */
}
/* pressed-in 3D buttons like the player's */
.ctl {
  background: var(--paper) !important;
  border: 1px solid var(--paper-edge);
  box-shadow: 0 3px 0 rgba(31, 77, 36, 0.35);
}
.ctl:active {
  box-shadow: 0 1px 0 rgba(31, 77, 36, 0.35);
  transform: translateY(2px);
}
.count {
  text-align: center;
  font-size: 0.72rem;
  opacity: 0.7;
  margin-top: 2px;
}
.why {
  min-height: 3.8em; /* room for the reason and the button under it, so the layout does not jump when they appear */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  text-align: center;
  font-size: 0.78rem;
  line-height: 1.2;
  color: #d33;
}
.agree {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 10px;
  border: 1px dashed var(--leaf);
  border-radius: 999px;
  background: var(--paper);
  color: var(--leaf);
  font: inherit;
  cursor: pointer;
}
.agree:hover {
  background: color-mix(in srgb, var(--leaf) 12%, var(--paper));
}
</style>
