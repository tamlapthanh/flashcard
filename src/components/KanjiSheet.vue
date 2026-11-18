<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { swipeDown } from '../lib/swipeDown';
import type { KanjiInfo } from '../types';
import KanjiBlock from './KanjiBlock.vue';

const props = defineProps<{ kanji: KanjiInfo[]; selected: string | null }>();
const emit = defineEmits<{ close: []; select: [literal: string] }>();

const open = computed(() => props.selected !== null);
const current = computed(() => props.kanji.find((k) => k.Literal === props.selected) ?? null);

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
    <v-card class="sheet" rounded="t-xl" @touchstart.passive="swipe.onTouchstart" @touchend.passive="swipe.onTouchend">
      <div class="grip" />
      <div class="px-4 pb-4">
        <v-chip-group v-if="kanji.length > 1" :model-value="selected" mandatory color="primary" class="mb-1" @update:model-value="(v: string | null) => v && emit('select', v)">
          <v-chip v-for="k in kanji" :key="k.Literal" :value="k.Literal"><span class="jp">{{ k.Literal }}</span></v-chip>
        </v-chip-group>
        <KanjiBlock v-if="shown" :key="`${shown.Literal}-${opened}`" :kanji="shown" />
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
.grip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 8px;
}
</style>
