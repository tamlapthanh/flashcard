<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import type { KanjiInfo } from '../types';
import StrokePractice from './StrokePractice.vue';

/*
 * The practice screen of one kanji: it takes the place of the kanji sheet's content (like a component opened from the graph) and holds only the
 * QUESTION - Sino-Vietnamese sound, meaning, readings, number of strokes, the parts that make it up - never the kanji itself. The kanji
 * shows up when the writing is finished (or when the faint outline is turned on: it is then in front of the user anyway).
 */
const props = defineProps<{ kanji: KanjiInfo }>();

const revealed = ref(false);
const hintOpen = ref(false); // the parts are a help: folded until the user asks for them
const meaning = computed(() => (props.kanji.MeaningsVi.length ? props.kanji.MeaningsVi : props.kanji.MeaningsEn).slice(0, 3).join('; '));
/* The parts of the kanji (a memory aid); without the server's explanations they still show as bare characters. */
const parts = computed(() => props.kanji.Parts ?? props.kanji.Components.filter((c) => c !== props.kanji.Literal).map((c) => ({ Literal: c, HanViet: null, Meaning: null })));
</script>

<template>
  <div class="kpwrap">
  <div class="kp">
    <div class="cue">
      <div class="label">{{ t('practice.cue') }}</div>
      <div class="top">
        <div class="glyph jp" :class="{ unknown: !revealed }" :aria-hidden="!revealed">{{ revealed ? kanji.Literal : '?' }}</div>
        <div class="info">
          <div v-if="kanji.HanViet" class="hv text-subtitle-2">{{ kanji.HanViet.toUpperCase() }}</div>
          <div v-if="meaning" class="text-body-2">{{ meaning }}</div>
          <div class="text-caption meta">
            <span v-if="kanji.Strokes">{{ t('kanji.strokes', { n: kanji.Strokes }) }}</span>
          </div>
        </div>
      </div>
      <div class="side text-body-2">
        <div v-if="kanji.Onyomi.length"><span class="label">On</span> <span class="rd">{{ kanji.Onyomi.join('、') }}</span></div>
        <div v-if="kanji.Kunyomi.length"><span class="label">Kun</span> <span class="rd">{{ kanji.Kunyomi.join('、') }}</span></div>
      </div>
      <div v-if="parts.length" class="parts">
        <button type="button" class="label hint-toggle" :aria-expanded="hintOpen" @click="hintOpen = !hintOpen">
          <v-icon icon="mdi-lightbulb-on-outline" size="14" />{{ t('kanji.hint') }}<v-icon :icon="hintOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
        </button>
        <template v-if="hintOpen">
          <div v-for="(p, i) in parts" :key="i" class="part">
            <span class="pg jp">{{ p.Literal }}</span>
            <span class="phv hv">{{ p.HanViet ? p.HanViet.toUpperCase() : '' }}</span>
            <span class="pm">{{ p.Meaning }}</span>
          </div>
        </template>
      </div>
    </div>
    <div class="board">
      <StrokePractice :paths="kanji.StrokePaths ?? []" @revealed="(v: boolean) => (revealed = v)" />
    </div>
  </div>
  </div>
</template>

<style scoped>
/* The layout follows the width of the SHEET (a desktop sheet is narrow even on a wide screen), not the width of the window. */
.kpwrap {
  container-type: inline-size;
}
.kp {
  display: grid;
  gap: 12px;
}
.board {
  width: 100%;
  max-width: 420px; /* a big drawing area: nearly the whole width of a phone */
  margin: 0 auto;
}
.top {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 4px;
}
.glyph {
  font-size: 2.6rem;
  line-height: 1;
  min-width: 52px;
  text-align: center;
  color: var(--headword);
}
.glyph.unknown {
  color: var(--shu);
  opacity: 0.6;
  border: 2px dashed currentColor; /* an empty box: the kanji is what has to be written */
  border-radius: 8px;
  padding: 6px 0;
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
.side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}
.parts {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 4px;
  align-items: center;
  margin-top: 8px;
}
.hint-toggle {
  grid-column: 1 / -1;
  font-size: 0.8rem; /* like the Memory hint of the kanji sheet */
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
.part {
  display: contents;
}
.pg {
  font-weight: 700;
  width: 38px;
  padding: 2px 0;
  text-align: center;
  font-size: 1.2rem;
  line-height: 1.2;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
}
.phv {
  font-size: 0.82rem;
  white-space: nowrap;
}
.pm {
  font-size: 0.82rem;
  line-height: 1.3;
}
/* a wide sheet (700px and more): the question on the left, the drawing area on the right */
@container (min-width: 700px) {
  .kp {
    grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
    column-gap: 28px;
    align-items: start;
  }
  .board {
    margin: 0;
  }
}
</style>
