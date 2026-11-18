<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import type { KanjiInfo } from '../types';
import StrokePlayer from './StrokePlayer.vue';

const props = defineProps<{ kanji: KanjiInfo }>();

/* On a touch screen (phone, tablet) the Memory hint stays folded until tapped; with a mouse there is room, so it always shows. */
const touchOnly = typeof window !== 'undefined' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const hintOpen = ref(false);

const meaning = computed(() => (props.kanji.MeaningsVi.length ? props.kanji.MeaningsVi : props.kanji.MeaningsEn).slice(0, 3).join('; '));
const jlpt = computed(() => (props.kanji.Jlpt ? `N${props.kanji.Jlpt}` : null)); // LCT stores the OLD 1-4 scale
const hasStrokes = computed(() => (props.kanji.StrokePaths?.length ?? 0) > 0);
const radical = computed(() => [props.kanji.Radical, props.kanji.RadicalHanViet].filter(Boolean).join(' '));

/* The parts of the kanji; without the server's explanations (older server) they still show as bare characters. */
const parts = computed(() => props.kanji.Parts ?? props.kanji.Components.filter((c) => c !== props.kanji.Literal).map((c) => ({ Literal: c, HanViet: null, Meaning: null })));
const firstMeaning = computed(() => (props.kanji.MeaningsVi[0] ?? props.kanji.MeaningsEn[0] ?? '').trim());
</script>

<!-- One kanji on one screen: header, then the stroke order on the left and the few facts that matter on the right. -->
<template>
  <div class="kanji">
    <div class="top">
      <div class="glyph jp">{{ kanji.Literal }}</div>
      <div class="info">
        <div v-if="kanji.HanViet" class="hv text-subtitle-2">{{ kanji.HanViet.toUpperCase() }}</div>
        <div v-if="meaning" class="text-body-2">{{ meaning }}</div>
        <div class="text-caption meta">
          <span v-if="kanji.Strokes">{{ t('kanji.strokes', { n: kanji.Strokes }) }}</span>
          <span v-if="jlpt">{{ jlpt }}</span>
        </div>
      </div>
    </div>

    <div class="body" :class="{ single: !hasStrokes }">
      <StrokePlayer v-if="hasStrokes" :literal="kanji.Literal" :paths="kanji.StrokePaths!" />
      <div class="side text-body-2">
        <div v-if="kanji.Onyomi.length"><div class="label">On</div><span class="rd">{{ kanji.Onyomi.join('、') }}</span></div>
        <div v-if="kanji.Kunyomi.length"><div class="label">Kun</div><span class="rd">{{ kanji.Kunyomi.join('、') }}</span></div>
        <div v-if="radical"><div class="label">{{ t('kanji.radical') }}</div><span class="jp">{{ radical }}</span></div>
      </div>
    </div>

    <!-- Memory hint: the kanji as the sum of its parts. Every part is a same-size tile holding only the character; its sound
         and meaning sit beside it, so the rows line up: whole | = / + | part | what it is. -->
    <div v-if="parts.length" class="hint">
      <button v-if="touchOnly" type="button" class="label hint-toggle" :aria-expanded="hintOpen" @click="hintOpen = !hintOpen">
        <v-icon icon="mdi-lightbulb-on-outline" size="14" />{{ t('kanji.hint') }}<v-icon :icon="hintOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
      </button>
      <div v-else class="label"><v-icon icon="mdi-lightbulb-on-outline" size="14" />{{ t('kanji.hint') }}</div>
      <div v-if="!touchOnly || hintOpen" class="formula">
        <span class="whole jp" :style="{ gridRow: `1 / span ${parts.length + (firstMeaning ? 1 : 0)}` }">{{ kanji.Literal }}</span>
        <template v-for="(p, i) in parts" :key="i">
          <span class="op">{{ i === 0 ? '=' : '+' }}</span>
          <span class="pg jp">{{ p.Literal }}</span>
          <span class="pc"><span v-if="p.HanViet" class="hv">{{ p.HanViet }}</span><template v-if="p.HanViet && p.Meaning"> · </template>{{ p.Meaning }}</span>
        </template>
        <template v-if="firstMeaning">
          <span class="op">→</span>
          <span class="result">{{ firstMeaning }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.top {
  display: flex;
  gap: 12px;
  align-items: center;
}
.glyph {
  font-size: 2.6rem;
  line-height: 1;
  min-width: 52px;
  text-align: center;
}
.info {
  flex: 1;
  min-width: 0;
}
.meta {
  display: flex;
  gap: 10px;
  opacity: 0.7;
}
.body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas: 'main side';
  gap: 14px;
  align-items: start;
  margin-top: 10px;
}
.body.single {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'side';
}
/* A wide sheet (desktop, tablet, phone held sideways): the readings sit right beside the drawing instead of drifting to
   the far edge. Narrow phones keep the two equal columns. */
@media (min-width: 600px) {
  .body:not(.single) {
    grid-template-columns: 210px minmax(0, 1fr);
    column-gap: 28px;
  }
}
/* Mouse only: a second row for the stroke thumbnails, spanning the full width. (No empty row on touch screens.) */
@media (hover: hover) and (pointer: fine) {
  .body:not(.single) {
    grid-template-areas:
      'main side'
      'strip strip';
  }
}
.side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hint {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--grid-soft);
}
.hint-toggle {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
.formula {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 6px;
  align-items: center;
  margin-top: 8px;
}
.whole {
  grid-column: 1;
  align-self: center;
  padding-right: 6px;
  font-size: 3rem;
  line-height: 1;
}
.op {
  grid-column: 2;
  text-align: center;
  opacity: 0.55;
  font-weight: 700;
}
/* every part is the same size, whatever the character */
.pg {
  grid-column: 3;
  width: 42px;
  padding: 2px 0;
  text-align: center;
  font-size: 1.3rem;
  line-height: 1.2;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
}
.pc {
  grid-column: 4;
  font-size: 0.82rem;
  line-height: 1.3;
}
.result {
  grid-column: 3 / -1;
  font-weight: 700;
}
</style>
