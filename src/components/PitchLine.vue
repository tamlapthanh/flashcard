<script setup lang="ts">
import type { PitchMora } from '../types';

defineProps<{ morae: PitchMora[] }>();
</script>

<!-- Pitch line: a dotted line over high morae, under low ones, a dotted vertical stroke where the pitch steps (as in LCT). -->
<template>
  <span class="pitch" aria-hidden="true">
    <span v-for="(m, i) in morae" :key="i" class="mora" :class="{ high: m.high, low: !m.high, step: m.stepAfter }">{{ m.text }}</span>
  </span>
</template>

<style scoped>
.pitch {
  display: inline-flex;
  color: var(--rd);
}
.mora {
  /* dotted 1px lines, like LCT's pitch strip (dash 1 / gap 1); the 2px padding keeps the text clear of the line */
  padding: 2px 1px;
  border-top: 1px dotted transparent;
  border-bottom: 1px dotted transparent;
  line-height: 1.2;
}
.high {
  border-top-color: currentColor;
}
.low {
  border-bottom-color: currentColor;
}
.step {
  border-right: 1px dotted currentColor;
}
</style>
