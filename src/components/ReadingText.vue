<script setup lang="ts">
import { computed } from 'vue';
import { readingRows } from '../lib/readingLines';

const props = defineProps<{ reading: string }>();
const rows = computed(() => readingRows(props.reading));
</script>

<template>
  <!-- On / Kun: the labels line up on the right, the readings on the left -->
  <span v-if="rows" class="onkun">
    <template v-for="[label, value] in rows" :key="label">
      <span class="ok-l">{{ label }}</span>
      <span class="ok-v">{{ value }}</span>
    </template>
  </span>
  <template v-else>{{ reading }}</template>
</template>

<style scoped>
.onkun {
  display: inline-grid;
  grid-template-columns: auto auto;
  column-gap: 0.35em;
  align-items: baseline;
}
.ok-l {
  text-align: right;
}
.ok-v {
  text-align: left;
}
</style>
