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
const emit = defineEmits<{ back: [] }>();

const revealed = ref(false);
const infoOpen = ref(false); // the number of strokes, behind the info icon (tooltip with the mouse, a tap on a touch screen)
const hintOpen = ref(false); // the parts are a help: folded until the user asks for them
const meaning = computed(() => (props.kanji.MeaningsVi.length ? props.kanji.MeaningsVi : props.kanji.MeaningsEn).slice(0, 3).join('; '));
/* English meanings after the Vietnamese ones (with no Vietnamese ones `meaning` already is the English). */
const english = computed(() => (props.kanji.MeaningsVi.length ? props.kanji.MeaningsEn.slice(0, 3).join('; ') : ''));
const infoUp = computed(() => !!infoText.value && !english.value && !!(props.kanji.HanViet || meaning.value)); // no English line: the icon sits on line 1
const infoText = computed(() => (props.kanji.Strokes ? t('kanji.strokes', { n: props.kanji.Strokes }) : ''));
/* The parts of the kanji (a memory aid); without the server's explanations they still show as bare characters. */
const parts = computed(() => props.kanji.Parts ?? props.kanji.Components.filter((c) => c !== props.kanji.Literal).map((c) => ({ Literal: c, HanViet: null, Meaning: null })));
</script>

<template>
  <div class="kpwrap">
  <div class="kp" :data-revealed="revealed">
    <div class="cue">
      <!-- the way back and the title share one row -->
      <div class="cuehead">
        <v-btn variant="tonal" color="primary" size="x-small" icon="mdi-arrow-left" class="back" :aria-label="t('practice.back')" :data-tip="t('practice.back')" @click="emit('back')" />
        <div class="label cuetitle">{{ t('practice.cue') }}</div>
      </div>
      <!-- line 1: Sino-Vietnamese sound and Vietnamese meaning; line 2: the English meaning and the info icon (strokes). No kanji here: it is what has to be written. -->
      <div class="top">
        <div class="info">
          <div v-if="kanji.HanViet || meaning" class="kline kline1">
            <span v-if="kanji.HanViet" class="hv text-subtitle-2">{{ kanji.HanViet.toUpperCase() }}</span>
            <span v-if="meaning" class="text-body-2">{{ meaning }}</span>
            <!-- no English meaning: the info icon moves up to the end of this line -->
            <template v-if="infoUp">
              <button type="button" class="infobtn" :aria-label="infoText" :aria-expanded="infoOpen" :data-tip="infoText" @click="infoOpen = !infoOpen">
                <v-icon icon="mdi-information-outline" size="18" />
              </button>
              <span v-if="infoOpen" class="text-caption meta">{{ infoText }}</span>
            </template>
          </div>
          <div v-if="english || (infoText && !infoUp)" class="kline kline2">
            <span v-if="english" class="text-body-2 ken">{{ english }}</span>
            <template v-if="infoText">
              <button type="button" class="infobtn" :aria-label="infoText" :aria-expanded="infoOpen" :data-tip="infoText" @click="infoOpen = !infoOpen">
                <v-icon icon="mdi-information-outline" size="18" />
              </button>
              <span v-if="infoOpen" class="text-caption meta">{{ infoText }}</span>
            </template>
          </div>
          <div class="side text-body-2">
            <div v-if="kanji.Onyomi.length"><span class="label">On</span> <span class="rd">{{ kanji.Onyomi.join('、') }}</span></div>
            <div v-if="kanji.Kunyomi.length"><span class="label">Kun</span> <span class="rd">{{ kanji.Kunyomi.join('、') }}</span></div>
          </div>
        </div>
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
.info {
  flex: 1;
  min-width: 0;
}
.kline {
  line-height: 1.4;
}
.kline1 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
}
.kline2 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
}
.ken {
  opacity: 0.75;
}
.infobtn {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: none;
  color: var(--leaf);
  cursor: pointer;
}
.meta {
  opacity: 0.7;
}
/* a phone or tablet (touch): the title row keeps only the way back; the screen says what to do without a title */
@media (hover: none), (pointer: coarse) {
  .cuetitle {
    display: none;
  }
}
.side {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 18px; /* On and Kun on one line, evenly spaced (they wrap only when too long) */
  margin-top: 6px;
}
.cuehead {
  display: flex;
  align-items: center;
  gap: 10px;
}
.back {
  flex: none;
  font-weight: 700;
  position: relative;
  top: -3px; /* a little higher */
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
