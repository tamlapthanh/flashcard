<script setup lang="ts">
import type { PitchMora } from '../types';

defineProps<{ morae: PitchMora[] }>();
</script>

<!-- Pitch line: a bar over high morae, under low ones, a vertical stroke where the pitch steps. -->
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
  padding: 0 1px;
  border-top: 2px solid transparent;
  border-bottom: 2px solid transparent;
  line-height: 1.2;
}
.high {
  border-top-color: currentColor;
}
.low {
  border-bottom-color: currentColor;
}
.step {
  border-right: 2px solid currentColor;
}
</style>
