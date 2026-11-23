<script setup lang="ts">
import { computed } from 'vue';
import type { RubyCell } from '../types';
import PitchLine from './PitchLine.vue';

/* hv: Han-Viet sound by kanji; when given, each cell shows the sounds of its kanji under the word. */
/* noReading: the furigana row is hidden (the reading button is off), the word and the Han-Viet row stay. */
const props = defineProps<{ cells: RubyCell[]; hv?: Record<string, string>; noReading?: boolean }>();

function hvOf(text: string): string {
  if (!props.hv) return '';
  return [...text].map((ch) => props.hv![ch]).filter(Boolean).join(' ');
}

// When the pitch fits the segments, the ruby row shows the FULL reading (kana segments too) with the pitch line on it.
const withPitch = computed(() => props.cells.some((c) => c.morae));
</script>

<template>
  <span class="ruby" :aria-label="cells.map((c) => c.text).join('')">
    <span v-for="(c, i) in cells" :key="i" class="cell">
      <span v-if="!noReading" class="top rd">
        <PitchLine v-if="withPitch && c.morae" :morae="c.morae" />
        <template v-else>{{ c.ruby ?? '' }}</template>
      </span>
      <span class="base jp">{{ c.text }}</span>
      <span v-if="hv" class="hvr">{{ hvOf(c.text) }}</span>
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
  font-size: var(--s-furigana);
  font-style: var(--i-furigana);
  color: var(--c-furigana, var(--rd));
  line-height: 1.15;
  min-height: calc(var(--s-furigana) * 1.3); /* the readings sit close to the word */
  white-space: nowrap;
  position: relative;
  top: -1px; /* the reading 1px higher */
}
.hvr {
  /* same look as the Han-Viet line (.hanviet in StudyView): upper case, bold, spaced, its own size / colour setting */
  font-size: var(--s-hanviet);
  font-style: var(--i-hanviet);
  color: var(--c-hanviet, var(--hv));
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  min-height: calc(var(--s-hanviet) * 1.2);
  line-height: 1.1;
  margin-top: 1px;
  position: relative;
  top: 1px; /* the Han-Viet 1px lower */
  white-space: nowrap;
}
.base {
  font-size: var(--s-wordRuby);
  font-style: var(--i-wordRuby);
  line-height: 1.1;
  margin-top: calc(var(--s-wordRuby) * -0.15 + 3px); /* the glyph has empty space above it: pull the word up under the readings */
  color: var(--c-wordRuby, var(--headword));
  font-weight: 700;
}
</style>
