<script setup lang="ts">
import { computed } from 'vue';
import type { RubyCell } from '../types';
import PitchLine from './PitchLine.vue';

const props = defineProps<{ cells: RubyCell[]; scale: number }>();

// When the pitch fits the segments, the ruby row shows the FULL reading (kana segments too) with the pitch line on it.
const withPitch = computed(() => props.cells.some((c) => c.morae));
</script>

<template>
  <span class="ruby" :style="{ '--fs': scale }" :aria-label="cells.map((c) => c.text).join('')">
    <span v-for="(c, i) in cells" :key="i" class="cell">
      <span class="top rd">
        <PitchLine v-if="withPitch && c.morae" :morae="c.morae" />
        <template v-else>{{ c.ruby ?? '' }}</template>
      </span>
      <span class="base jp">{{ c.text }}</span>
    </span>
  </span>
</template>

<style scoped>
.ruby {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
}
.cell {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.top {
  font-size: calc(0.9rem * var(--fs));
  min-height: calc(1.5rem * var(--fs));
  white-space: nowrap;
}
.base {
  font-size: calc(2.6rem * var(--fs));
  line-height: 1.1;
  color: var(--headword);
  font-weight: 700;
}
</style>
