<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/*
 * The tags chosen for a deck, on one line: as many as fit in the room there is, the rest as "+N" (its tooltip names them). A first tag that is
 * longer than the line is cut with "…". The room is measured on a hidden copy of all the chips, again when the width or the tags change.
 */
const props = defineProps<{ tags: string[] }>();

const box = ref<HTMLElement | null>(null);
const ruler = ref<HTMLElement | null>(null);
const shown = ref(props.tags.length); // how many chips are drawn (all of them until the first measure)
const GAP = 4; // px between chips (the same as in the CSS)

function fit(): void {
  const room = box.value?.clientWidth ?? 0;
  const kids = ruler.value ? (Array.from(ruler.value.children) as HTMLElement[]) : [];
  const total = props.tags.length;
  if (room <= 0 || kids.length < total + 1) return;
  const widths = kids.slice(0, total).map((k) => k.offsetWidth);
  const more = kids[total]!.offsetWidth; // the "+N" chip
  let count = 0;
  let used = 0;
  for (let i = 0; i < total; i++) {
    const next = used + (i ? GAP : 0) + widths[i]!;
    const needsMore = total - (i + 1) > 0;
    if (next + (needsMore ? GAP + more : 0) > room) break;
    count = i + 1;
    used = next;
  }
  shown.value = Math.max(1, count); // at least one (a long one is cut with an ellipsis)
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  fit();
  if (typeof ResizeObserver !== 'undefined' && box.value) {
    observer = new ResizeObserver(fit);
    observer.observe(box.value);
  }
  void document.fonts?.ready.then(fit); // the font arrives late: measure again
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => props.tags,
  async () => {
    shown.value = props.tags.length;
    await nextTick();
    fit();
  },
  { deep: true }
);
</script>

<template>
  <div ref="box" class="tc">
    <span v-for="tg in tags.slice(0, shown)" :key="tg" class="tcchip">{{ tg }}</span>
    <span v-if="tags.length > shown" class="tcchip tcmore" :title="tags.slice(shown).join(', ')">+{{ tags.length - shown }}</span>
    <div ref="ruler" class="tcruler" aria-hidden="true">
      <span v-for="tg in tags" :key="tg" class="tcchip">{{ tg }}</span>
      <span class="tcchip">+99</span>
    </div>
  </div>
</template>

<style scoped>
.tc {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  height: 20px;
  overflow: hidden; /* one line: what does not fit is the "+N" */
}
.tcchip {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  height: 20px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 10px;
  font-size: 0.7rem;
  line-height: 1;
  white-space: nowrap;
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 16%, transparent);
  color: rgb(var(--v-theme-primary));
}
.tc > .tcchip:first-child {
  flex: 0 1 auto; /* the first one may be cut with an ellipsis when it is longer than the line */
  min-width: 0;
  display: block;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tcmore {
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: var(--text-secondary, inherit);
}
.tcruler {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: max-content;
  gap: 4px;
  visibility: hidden;
  pointer-events: none;
}
</style>
