<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { swipeDown } from '../lib/swipeDown';
import type { KanjiInfo } from '../types';
import KanjiBlock from './KanjiBlock.vue';

const props = defineProps<{ kanji: KanjiInfo[]; selected: string | null }>();
const emit = defineEmits<{ close: []; select: [literal: string] }>();

const open = computed(() => props.selected !== null);
const current = computed(() => props.kanji.find((k) => k.Literal === props.selected) ?? null);

/* With a mouse there is room: a word with several kanji shows all of them side by side (no chips), in at most 2 rows.
   Touch screens keep one kanji at a time with the chips. */
const mouse = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
/* As many columns as fit the window (each wants ~400px, at most 4); only when they do not all fit does it wrap into more rows. */
const winW = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);
const onResize = (): void => void (winW.value = window.innerWidth);
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));
/* Only with a mouse AND a window wide enough for two columns; a phone (or a very narrow window) keeps one kanji at a time. */
const multi = computed(() => mouse && winW.value >= 800 && props.kanji.length > 1);
const cols = computed(() => {
  const fit = Math.max(1, Math.min(4, Math.floor(winW.value / 400)));
  const rows = Math.ceil(props.kanji.length / fit);
  return Math.ceil(props.kanji.length / rows);
});

/* Side by side: when the content is taller than the screen it is shrunk (as little as possible) instead of scrolling. */
const sheetRef = ref<{ $el: HTMLElement } | null>(null);
const multiRef = ref<HTMLElement | null>(null);
const zoom = ref(1);
let fitTimer = 0;
async function fitZoom(): Promise<void> {
  zoom.value = 1;
  await nextTick();
  const sheet = sheetRef.value?.$el;
  const block = multiRef.value;
  if (!multi.value || !sheet || !block) return;
  const over = sheet.scrollHeight - sheet.clientHeight;
  if (over <= 1) return;
  const h = block.offsetHeight;
  zoom.value = Math.max(0.4, Math.floor(((h - over) / h) * 100) / 100 - 0.01);
}
function scheduleFit(): void {
  cancelAnimationFrame(fitTimer);
  fitTimer = requestAnimationFrame(() => void fitZoom());
}

watch([open, multi, cols, winW, () => props.kanji], () => open.value && scheduleFit(), { flush: 'post' });

const swipe = swipeDown(() => emit('close')); // drag the sheet down to close it

// Remember the last shown kanji so the sheet does not go blank while it slides away.
const shown = ref<KanjiInfo | null>(null);
watch(current, (k) => k && (shown.value = k), { immediate: true });

// Each time the sheet opens its content is rebuilt, so the stroke order plays from the start again.
const opened = ref(0);
watch(open, (isOpen) => isOpen && opened.value++, { immediate: true });
</script>

<!-- Slides up from the card: one kanji with its stroke order, sized to fit without scrolling. Swipe down to close. -->
<template>
  <v-bottom-sheet :model-value="open" @update:model-value="(v: boolean) => !v && emit('close')">
    <v-card ref="sheetRef" class="sheet" rounded="t-xl" @touchstart.passive="swipe.onTouchstart" @touchend.passive="swipe.onTouchend">
      <div class="grip" />
      <div class="px-4 pb-4">
        <div v-if="multi" ref="multiRef" :key="opened" class="multi" :style="{ zoom, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 520}px` }">
          <KanjiBlock v-for="(k, i) in kanji" :key="k.Literal" :kanji="k" class="cell" :class="{ divided: i % cols !== 0 }" />
        </div>
        <template v-else>
        <v-chip-group v-if="kanji.length > 1" :model-value="selected" mandatory color="primary" class="mb-1" @update:model-value="(v: string | null) => v && emit('select', v)">
          <v-chip v-for="k in kanji" :key="k.Literal" :value="k.Literal"><span class="jp">{{ k.Literal }}</span></v-chip>
        </v-chip-group>
        <KanjiBlock v-if="shown" :key="`${shown.Literal}-${opened}`" :kanji="shown" />
        </template>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.sheet {
  background: var(--paper);
  max-height: 90dvh; /* never taller than the screen: it scrolls instead (KanjiBlock measures this to decide whether the hint fits) */
  overflow-y: auto;
}
.multi {
  display: grid;
  gap: 18px 0;
}
.cell {
  padding: 0 16px 0 0;
}
.cell.divided {
  padding-left: 16px;
  border-left: 1px solid var(--paper-edge);
}
.grip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 8px;
}
</style>
