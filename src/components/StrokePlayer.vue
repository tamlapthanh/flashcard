<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { t } from '../i18n';
import { strokeStart } from '../lib/strokes';

const props = defineProps<{ literal: string; paths: string[] }>();

const stripOpen = ref(true); // the stroke-by-stroke row can be folded away
const step = ref(props.paths.length); // how many strokes are drawn (all = finished character)
const playing = ref(false);
const animating = ref(false); // the newest stroke draws itself
const done = ref(false); // the last stroke has finished drawing: it turns black like the rest (the newest stroke is red only while it is the "current" one)
let timer: ReturnType<typeof setInterval> | null = null;

// The stroke order plays by itself as soon as the player appears (and again when the kanji changes).
onMounted(play);
watch(
  () => props.paths,
  () => {
    stop();
    play();
  }
);

watch(step, () => (done.value = false));

const starts = computed(() => props.paths.map(strokeStart));

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  playing.value = false;
}

function play(): void {
  if (playing.value) return stop();
  if (props.paths.length === 0) return;
  step.value = 1; // the first stroke starts drawing at once
  animating.value = true;
  if (props.paths.length === 1) return;
  playing.value = true;
  timer = setInterval(() => {
    step.value++;
    animating.value = true;
    if (step.value >= props.paths.length) stop();
  }, 800);
}

function go(delta: number): void {
  stop();
  step.value = Math.max(0, Math.min(props.paths.length, step.value + delta));
  animating.value = delta > 0;
}

function jump(n: number): void {
  stop();
  step.value = n + 1;
  animating.value = true; // the chosen stroke draws itself again
}

onUnmounted(stop);
</script>

<template>
  <!-- The root has no box of its own (display: contents): KanjiBlock lays out its two parts, "main" (drawing + buttons) and
       "strip" (one thumbnail per stroke), together with the readings. -->
  <div class="player">
    <div class="pmain">
    <div class="canvas">
    <svg viewBox="0 0 109 109" class="big" role="img" :aria-label="t('strokes.label', { c: literal })">
      <path d="M54.5 0V109M0 54.5H109" class="grid" />
      <path d="M0 0L109 109M109 0L0 109" class="grid soft" />
      <path v-for="(d, i) in paths" :key="'g' + i" :d="d" pathLength="1" class="stroke ghost" />
      <template v-for="(d, i) in paths" :key="'s' + i">
        <path
          v-if="i < step"
          :d="d"
          pathLength="1"
          class="stroke"
          :class="{ current: i === step - 1 && !(done && i === paths.length - 1), anim: i === step - 1 && animating }"
          @animationend="i === paths.length - 1 && (done = true)"
        />
      </template>
      <template v-for="(p, i) in starts" :key="'n' + i">
        <text v-if="p && i < step" :x="p.x - 3" :y="p.y - 2" class="num">{{ i + 1 }}</text>
      </template>
    </svg>
    </div>

    <div class="controls">
      <v-btn class="ctl" icon="mdi-skip-previous" variant="text" size="small" :aria-label="t('strokes.prev')" @click="go(-1)" />
      <v-btn class="ctl" :icon="playing ? 'mdi-pause' : 'mdi-play'" variant="tonal" size="small" :aria-label="playing ? t('strokes.pause') : t('strokes.play')" @click="play" />
      <v-btn class="ctl" icon="mdi-skip-next" variant="text" size="small" :aria-label="t('strokes.next')" @click="go(1)" />
    </div>
    <!-- the stroke counter sits under the buttons, on its own line, so it can never run into the text beside the player -->
    <div class="count">{{ step }} / {{ paths.length }}</div>
    </div>

    <!-- stroke by stroke: one small picture per stroke, click to jump there. Desktop only (hidden on touch screens). -->
    <div class="stripwrap">
    <button type="button" class="label strip-toggle" :aria-expanded="stripOpen" @click="stripOpen = !stripOpen">
      <v-icon icon="mdi-draw" size="14" />{{ t('kanji.stroke') }}<v-icon :icon="stripOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
    </button>
    <div v-if="stripOpen" class="strip" role="list">
      <button
        v-for="(_, n) in paths"
        :key="n"
        type="button"
        role="listitem"
        class="thumb"
        :class="{ on: n === step - 1 }"
        :aria-label="t('strokes.jump', { n: n + 1 })"
        @click="jump(n)"
      >
        <svg viewBox="0 0 109 109" aria-hidden="true">
          <path v-for="(d, i) in paths" :key="i" :d="d" class="ts" :class="{ ghost: i > n, now: i === n }" />
        </svg>
        <span class="n">{{ n + 1 }}</span>
      </button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.player {
  display: contents;
}
.pmain {
  grid-area: main;
  width: 100%;
  max-width: 210px;
  min-width: 0;
}
.canvas {
  position: relative;
}
.big {
  display: block;
  width: 100%;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
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
  stroke: var(--headword); /* drawn strokes in the same red as the kanji on the card */
  stroke-width: 3.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ghost {
  stroke: rgba(var(--v-border-color), 0.35);
}
.current {
  stroke: rgb(var(--v-theme-primary));
}
.anim {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 0.6s ease forwards;
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
.num {
  font-size: 7px;
  fill: var(--shu);
}
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
}
/* The three player buttons are pressed-in 3D like the rest of the app. */
.ctl {
  background: var(--paper) !important;
  border: 1px solid var(--paper-edge);
  box-shadow: 0 3px 0 rgba(31, 77, 36, 0.35);
}
.ctl:active {
  box-shadow: 0 1px 0 rgba(31, 77, 36, 0.35);
  transform: translateY(2px);
}
.controls {
  padding-bottom: 3px; /* room for the buttons' edge */
}
.count {
  text-align: center;
  font-size: 0.72rem;
  opacity: 0.7;
  margin-top: 2px;
}
.stripwrap {
  display: none;
  grid-area: strip;
}
.strip-toggle {
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .stripwrap {
    display: block;
    margin-top: 5px;
  }
  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .thumb {
    position: relative;
    width: 38px;
    padding: 0;
    border: 1px solid var(--paper-edge);
    border-radius: 6px;
    background: var(--paper);
    box-shadow: 0 2px 0 rgba(31, 77, 36, 0.3);
    cursor: pointer;
  }
  .thumb:active {
    box-shadow: 0 0 0 rgba(31, 77, 36, 0.3);
    transform: translateY(2px);
  }
  .thumb:hover {
    border-color: var(--shu);
  }
  .thumb.on {
    border-color: var(--shu);
    box-shadow: 0 0 0 1px var(--shu);
  }
  .thumb svg {
    display: block;
    width: 100%;
  }
  .ts {
    fill: none;
    stroke: var(--headword);
    stroke-width: 6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ts.ghost {
    stroke: rgba(var(--v-border-color), 0.25);
  }
  .ts.now {
    stroke: rgb(var(--v-theme-primary));
  }
  .thumb .n {
    position: absolute;
    left: 2px;
    top: 0;
    font-size: 0.6rem;
    color: var(--shu);
  }
}
</style>
