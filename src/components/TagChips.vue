<script setup lang="ts">
import { tagStyle } from '../lib/tagColor';
/* The tags chosen for a deck: all of them, wrapping onto as many lines as they need (the card grows with them). */
defineProps<{ tags: string[] }>();
</script>

<template>
  <div class="tc">
    <span v-for="tg in tags" :key="tg" class="tcchip tagtint" :style="tagStyle(tg)">{{ tg }}</span>
  </div>
</template>

<style scoped>
.tc {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tcchip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  height: 20px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 10px;
  font-size: 0.7rem;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* a tag longer than the whole line is cut */
  background: var(--tbg);
  color: var(--tfg);
}
</style>
