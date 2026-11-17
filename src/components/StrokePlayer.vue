<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { t } from '../i18n';
import { strokeStart } from '../lib/strokes';

const props = defineProps<{ literal: string; paths: string[] }>();

const step = ref(props.paths.length); // how many strokes are drawn (all = finished character)
const playing = ref(false);
const animating = ref(false); // the newest stroke draws itself
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

onUnmounted(stop);
</script>

<template>
  <div class="player">
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
          :class="{ current: i === step - 1, anim: i === step - 1 && animating }"
        />
      </template>
      <template v-for="(p, i) in starts" :key="'n' + i">
        <text v-if="p && i < step" :x="p.x - 3" :y="p.y - 2" class="num">{{ i + 1 }}</text>
      </template>
    </svg>
    </div>

    <div class="controls">
      <v-btn icon="mdi-skip-previous" variant="text" size="small" :aria-label="t('strokes.prev')" @click="go(-1)" />
      <v-btn :icon="playing ? 'mdi-pause' : 'mdi-play'" variant="tonal" size="small" :aria-label="playing ? t('strokes.pause') : t('strokes.play')" @click="play" />
      <v-btn icon="mdi-skip-next" variant="text" size="small" :aria-label="t('strokes.next')" @click="go(1)" />
    </div>
    <!-- the stroke counter sits under the buttons, on its own line, so it can never run into the text beside the player -->
    <div class="count">{{ step }} / {{ paths.length }}</div>
  </div>
</template>

<style scoped>
.player {
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
  stroke: rgb(var(--v-theme-on-surface));
  stroke-width: 3.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ghost {
  stroke: rgba(var(--v-border-color), 0.35);
}
.current {
  stroke: var(--shu);
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
.count {
  text-align: center;
  font-size: 0.72rem;
  opacity: 0.7;
  margin-top: 2px;
}
</style>
