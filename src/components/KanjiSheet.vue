<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { swipeDown } from '../lib/swipeDown';
import { api } from '../api';
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
  return Math.min(fit, props.kanji.length); // fill each row up to 4 before starting the next
});

/* Side by side at normal size: a tall sheet scrolls, nothing is shrunk. */
const sheetRef = ref<{ $el: HTMLElement } | null>(null);
const multiRef = ref<HTMLElement | null>(null);

/* A component opened from the graph: shown alone (with a way back) on top of the card's own kanji. */
const trail = ref<KanjiInfo[]>([]);
const drilled = computed(() => trail.value[trail.value.length - 1] ?? null);
async function openPart(literal: string): Promise<void> {
  try {
    const [k] = await api.kanji(literal);
    if (k) trail.value = [...trail.value, k];
  } catch {
    /* offline or unknown: stay where we are */
  }
}
const back = (): void => void (trail.value = trail.value.slice(0, -1));
watch([open, () => props.selected, () => props.kanji], () => void (trail.value = []));

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
        <div v-if="drilled" class="stage">
          <v-btn variant="tonal" color="primary" size="large" prepend-icon="mdi-arrow-left" class="back mb-2" @click="back">
            <span class="jp back-ch">{{ trail.length > 1 ? trail[trail.length - 2]?.Literal : (selected ?? '') }}</span>
          </v-btn>
          <KanjiBlock :key="drilled.Literal" :kanji="drilled" @open="openPart" />
        </div>
        <div v-else-if="multi" ref="multiRef" :key="opened" class="multi" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 700}px`, margin: '0 auto' }">
          <KanjiBlock v-for="(k, i) in kanji" :key="k.Literal" :kanji="k" class="cell" :class="{ divided: i % cols !== 0, rowdiv: i >= cols }" @open="openPart" />
        </div>
        <div v-else class="stage">
        <v-chip-group v-if="kanji.length > 1" :model-value="selected" mandatory color="primary" class="mb-1" @update:model-value="(v: string | null) => v && emit('select', v)">
          <v-chip v-for="k in kanji" :key="k.Literal" :value="k.Literal"><span class="jp">{{ k.Literal }}</span></v-chip>
        </v-chip-group>
        <KanjiBlock v-if="shown" :key="`${shown.Literal}-${opened}`" :kanji="shown" @open="openPart" />
        </div>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.sheet {
  background: var(--paper);
  max-height: 95dvh; /* never taller than the screen: it scrolls instead (KanjiBlock measures this to decide whether the hint fits) */
  overflow-y: auto;
  scrollbar-width: thin; /* a slim scrollbar, as small as the browser allows */
  scrollbar-color: var(--paper-edge) transparent;
}
.sheet::-webkit-scrollbar {
  width: 4px;
}
.sheet::-webkit-scrollbar-thumb {
  background: var(--paper-edge);
  border-radius: 2px;
}
.sheet::-webkit-scrollbar-track {
  background: transparent;
}
.multi {
  display: grid;
  gap: 0;
}
.cell {
  padding: 0 16px 0 0;
}
.cell.rowdiv {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--paper-edge); /* the same line as the vertical dividers, between the rows */
}
.cell.divided {
  padding-left: 16px;
  border-left: 1px solid var(--paper-edge);
}
.stage {
  max-width: 520px;
  margin: 0 auto; /* one kanji sits in the middle of the sheet, whether it is the card's own or a component opened from the graph */
}
.back {
  font-weight: 700;
}
.back-ch {
  font-size: 1.25rem;
}
.grip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 8px;
}
</style>
