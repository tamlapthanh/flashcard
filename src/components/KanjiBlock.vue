<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../i18n';
import type { KanjiInfo } from '../types';
import StrokePlayer from './StrokePlayer.vue';

const props = defineProps<{ kanji: KanjiInfo }>();

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

    <!-- memory hint built from the data we have: the kanji as a sum of its parts, each with its sound and meaning -->
    <div v-if="parts.length" class="hint">
      <div class="label"><v-icon icon="mdi-lightbulb-on-outline" size="14" />{{ t('kanji.hint') }}</div>
      <div class="formula">
        <span class="whole jp">{{ kanji.Literal }}</span>
        <span class="op">=</span>
        <template v-for="(p, i) in parts" :key="i">
          <span v-if="i > 0" class="op">+</span>
          <span class="piece">
            <span class="g jp">{{ p.Literal }}</span>
            <span v-if="p.HanViet || p.Meaning" class="cap"><span class="hv">{{ p.HanViet }}</span><template v-if="p.HanViet && p.Meaning"> · </template>{{ p.Meaning }}</span>
          </span>
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
  gap: 14px;
  align-items: start;
  margin-top: 10px;
}
.body.single {
  grid-template-columns: minmax(0, 1fr);
}
.side {
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
.formula {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 6px;
}
.whole {
  font-size: 1.9rem;
  line-height: 1;
}
.op {
  opacity: 0.55;
  font-weight: 700;
}
.piece {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 3px 8px;
  border-radius: 10px;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
}
.piece .g {
  font-size: 1.5rem;
  line-height: 1.1;
}
.piece .cap {
  font-size: 0.62rem;
  line-height: 1.2;
  text-align: center;
  max-width: 96px;
}
.result {
  font-weight: 700;
}
</style>
