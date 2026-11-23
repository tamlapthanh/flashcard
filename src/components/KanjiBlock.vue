<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { t } from '../i18n';
import type { KanjiInfo } from '../types';
import { compoundsOf, mnemonicOf } from '../lib/kanjiNotes';
import KanjiTree from './KanjiTree.vue';
import StrokePlayer from './StrokePlayer.vue';

const props = defineProps<{ kanji: KanjiInfo }>();
const emit = defineEmits<{ open: [literal: string]; practice: [kanji: KanjiInfo] }>();

/* On a touch screen (phone, tablet) the Memory hint stays folded until tapped; with a mouse there is room, so it always shows. */
const touchOnly = typeof window !== 'undefined' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const hintOpen = ref(!touchOnly); // with a mouse it starts open; both can be folded with the toggle

const meaning = computed(() => (props.kanji.MeaningsVi.length ? props.kanji.MeaningsVi : props.kanji.MeaningsEn).slice(0, 3).join('; '));
const jlpt = computed(() => (props.kanji.Jlpt ? `N${props.kanji.Jlpt}` : null)); // LCT stores the OLD 1-4 scale
const hasStrokes = computed(() => (props.kanji.StrokePaths?.length ?? 0) > 0);
const radical = computed(() => [props.kanji.Radical, props.kanji.RadicalHanViet].filter(Boolean).join(' '));

/* The parts of the kanji; without the server's explanations (older server) they still show as bare characters. */
const parts = computed(() => props.kanji.Parts ?? props.kanji.Components.filter((c) => c !== props.kanji.Literal).map((c) => ({ Literal: c, HanViet: null, Meaning: null })));
const compounds = computed(() => compoundsOf(props.kanji));
const mnemonic = computed(() => mnemonicOf(props.kanji));
const compOpen = ref(!touchOnly); // Compounds fold like the Memory hint
const firstMeaning = computed(() => (props.kanji.MeaningsVi[0] ?? props.kanji.MeaningsEn[0] ?? '').trim());

/* On a touch screen the hint opens by itself when the sheet still fits on the screen: open it, let the layout settle
   (before anything is painted) and fold it again if the sheet now has to scroll. A tap on the toggle wins. */
const root = ref<HTMLElement | null>(null);
let hintTouched = false;
async function fitHint(): Promise<void> {
  if (!touchOnly) return;
  const sheet = root.value?.closest<HTMLElement>('.sheet'); // the scrolling card of KanjiSheet
  const overflows = () => !!sheet && sheet.scrollHeight > sheet.clientHeight + 1;
  if (!hintTouched && (parts.value.length || mnemonic.value.length)) {
    hintOpen.value = true;
    await nextTick();
    if (overflows()) hintOpen.value = false;
  }
  if (!compTouched && compounds.value.length) {
    compOpen.value = true;
    await nextTick();
    if (overflows()) compOpen.value = false;
  }
}
let compTouched = false;
function toggleComp(): void {
  compTouched = true;
  compOpen.value = !compOpen.value;
}
function toggleHint(): void {
  hintTouched = true;
  hintOpen.value = !hintOpen.value;
}
onMounted(() => void fitHint());
</script>

<!-- One kanji on one screen: header, then the stroke order on the left and the few facts that matter on the right. -->
<template>
  <div ref="root" class="kanji">
    <div class="top">
      <div class="glyph jp">{{ kanji.Literal }}</div>
      <div class="info">
        <div v-if="kanji.HanViet" class="hv khv">{{ kanji.HanViet.toUpperCase() }}</div>
        <div v-if="meaning" class="kmean">{{ meaning }}</div>
        <div class="meta">
          <span v-if="kanji.Strokes">{{ t('kanji.strokes', { n: kanji.Strokes }) }}</span>
          <span v-if="jlpt">{{ jlpt }}</span>
        </div>
      </div>
    </div>

    <div class="body" :class="{ single: !hasStrokes }">
      <StrokePlayer v-if="hasStrokes" :literal="kanji.Literal" :paths="kanji.StrokePaths!" @practice="emit('practice', kanji)" />
      <div class="side">
        <div v-if="kanji.Onyomi.length"><div class="label flabel">On</div><span class="rd kread">{{ kanji.Onyomi.join('、') }}</span></div>
        <div v-if="kanji.Kunyomi.length"><div class="label flabel">Kun</div><span class="rd kread">{{ kanji.Kunyomi.join('、') }}</span></div>
        <div v-if="radical"><div class="label flabel nocaps">{{ t('kanji.radical') }}</div><span class="jp krad">{{ radical }}</span></div>
      </div>
    </div>

    <!-- Memory hint: the kanji as the sum of its parts. Every part is a same-size tile holding only the character; its sound
         and meaning sit beside it, so the rows line up: whole | = / + | part | what it is. -->
    <div v-if="parts.length || mnemonic.length" class="hint">
      <button type="button" class="label hint-toggle" :aria-expanded="hintOpen" @click="toggleHint">
        <v-icon icon="mdi-lightbulb-on-outline" size="14" />{{ t('kanji.hint') }}<v-icon :icon="hintOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
      </button>
      <div v-if="hintOpen && parts.length" class="formula">
        <span class="whole jp" :style="{ gridRow: `1 / span ${parts.length + (firstMeaning ? 1 : 0)}` }">{{ kanji.Literal }}</span>
        <template v-for="(p, i) in parts" :key="i">
          <span class="pg jp">{{ p.Literal }}</span>
          <span class="phv hv">{{ p.HanViet ? p.HanViet.toUpperCase() : '' }}</span>
          <span class="pm">{{ p.Meaning }}</span>
        </template>
        <template v-if="firstMeaning">
          <span class="op">→</span>
          <span class="result">{{ firstMeaning }}</span>
        </template>
      </div>
      <div v-if="hintOpen && mnemonic.length" class="notes">
        <p v-for="m in mnemonic" :key="m.lang" class="kmn" :class="{ jp: m.lang === 'Ja' }">{{ m.text }}</p>
      </div>
    </div>

    <!-- Compounds: one word per row, "word (reading) meaning". -->
    <div v-if="compounds.length" class="hint compounds">
      <button type="button" class="label hint-toggle" :aria-expanded="compOpen" @click="toggleComp">
        <v-icon icon="mdi-format-list-bulleted" size="14" />{{ t('kanji.compounds') }}<v-icon :icon="compOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
      </button>
      <ul v-if="compOpen" class="clist">
        <li v-for="(c, i) in compounds" :key="i">
          <span class="jp cw">{{ c.Word }}</span>
          <span v-if="c.Reading" class="jp ctj"> ({{ c.Reading }})</span>
          <span v-if="c.Vi" class="ct"> {{ c.Vi }}</span>
        </li>
      </ul>
    </div>

    <KanjiTree v-if="kanji.PartEdges?.length" :literal="kanji.Literal" :edges="kanji.PartEdges" :names="kanji.Tree ?? []" :root-hv="kanji.HanViet" @open="(l: string) => emit('open', l)" />
  </div>
</template>

<style scoped>
.top {
  display: flex;
  gap: 12px;
  align-items: center;
}
.glyph {
  font-size: var(--s-kGlyph, 41.6px);
  font-style: var(--i-kGlyph, normal);
  line-height: 1;
  min-width: 52px;
  text-align: center;
  color: var(--c-kGlyph, var(--headword)); /* the same red as the word on the card */
}
.info {
  flex: 1;
  min-width: 0;
}
.khv {
  font-size: var(--s-kHanviet, 14px);
  font-style: var(--i-kHanviet, normal);
  line-height: 1.4;
  font-weight: 500;
  color: var(--c-kHanviet, var(--hv));
}
.kmean {
  font-size: var(--s-kMeaning, 14px);
  font-style: var(--i-kMeaning, normal);
  line-height: 1.4;
  color: var(--c-kMeaning, inherit);
}
.meta {
  font-size: var(--s-kMeta, 12px);
  font-style: var(--i-kMeta, normal);
  color: var(--c-kMeta, inherit);
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
    /* the stroke-by-stroke row sits in the right column, right under Radical, beside the drawing */
    grid-template-areas:
      'main side'
      'main strip';
    grid-template-rows: auto 1fr;
    row-gap: 0; /* Stroke follows Radical closely: no gap between the two rows */
  }
  .body:not(.single) :deep(.stripwrap) {
    margin-top: 8px;
  }
}
.flabel {
  font-size: var(--s-kFieldLabel, 0.66rem);
  font-style: var(--i-kFieldLabel, normal);
  color: var(--c-kFieldLabel, var(--leaf));
}
.nocaps {
  text-transform: none; /* "Radical", not "RADICAL" */
}
.kread {
  font-size: var(--s-kReading, 14px);
  font-style: var(--i-kReading, normal);
  line-height: 1.4;
  color: var(--c-kReading, var(--rd));
}
.krad {
  font-size: var(--s-kRadical, 16px);
  font-style: var(--i-kRadical, normal);
  color: var(--c-kRadical, var(--jp));
}
.side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 5px; /* On, Kun and Radical sit a little closer, each one a bit higher */
  margin-top: -3px;
}
.hint {
  margin-top: 6px;
  padding: 6px 0;
}
.hint-toggle {
  font-size: var(--s-kSection, 0.8rem);
  font-style: var(--i-kSection, normal);
  color: var(--c-kSection, var(--leaf));
  text-transform: none; /* only the first letter is a capital */ /* the section titles (Stroke, Memory hint, Components) share this size */
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
.clist {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)); /* two columns: a kanji can have many compounds */
  gap: 4px 16px;
  margin-left: 18px; /* the content of a section sits a little to the right of its title */
}
.clist li {
  min-width: 0;
  overflow-wrap: anywhere;
}
.clist li {
  line-height: 1.4;
}
.cw {
  font-weight: 700;
  font-size: var(--s-kCompWord, 14px);
  font-style: var(--i-kCompWord, normal);
  color: var(--c-kCompWord, var(--headword));
}
.ctj {
  font-size: var(--s-kCompText, 14px);
  font-style: var(--i-kCompText, normal);
  color: var(--c-kCompText, var(--jp));
}
.ct {
  font-size: var(--s-kCompText, 14px);
  font-style: var(--i-kCompText, normal);
  color: var(--c-kCompText, inherit);
}
.kmn {
  font-size: var(--s-kMnemonic, 14px);
  font-style: var(--i-kMnemonic, normal);
  line-height: 1.4;
  color: var(--c-kMnemonic, inherit);
}
.notes {
  margin-top: 6px;
  margin-left: 18px; /* the content of a section sits a little to the right of its title */
}
.notes p {
  margin: 0 0 6px;
}
.formula {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr); /* character | box | Hán Việt | meaning */
  column-gap: 10px;
  row-gap: 6px;
  align-items: center;
  margin-top: 8px;
  margin-left: 18px; /* the content of a section sits a little to the right of its title */
}
.whole {
  grid-column: 1;
  align-self: center;
  padding-right: 6px;
  font-size: var(--s-kWhole, 48px);
  font-style: var(--i-kWhole, normal);
  line-height: 1;
  color: var(--c-kWhole, var(--headword));
}
.op {
  grid-column: 2;
  text-align: center;
  opacity: 0.55;
  font-weight: 700;
}
/* every part is the same size, whatever the character */
.pg {
  grid-column: 2;
  font-weight: 700;
  width: 42px;
  padding: 2px 0;
  text-align: center;
  font-size: var(--s-kPart, 20.8px);
  font-style: var(--i-kPart, normal);
  color: var(--c-kPart, var(--jp));
  line-height: 1.2;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
}
.phv {
  grid-column: 3;
  font-size: var(--s-kPartHv, 13.12px);
  font-style: var(--i-kPartHv, normal);
  color: var(--c-kPartHv, var(--hv));
  line-height: 1.3;
  white-space: nowrap;
}
.pm {
  grid-column: 4;
  font-size: var(--s-kPartMeaning, 13.12px);
  font-style: var(--i-kPartMeaning, normal);
  color: var(--c-kPartMeaning, inherit);
  line-height: 1.3;
}
.result {
  grid-column: 3 / -1; /* free text right after the arrow, not tied to the meaning column */
  font-weight: 700;
  font-size: var(--s-kResult, 16px);
  font-style: var(--i-kResult, normal);
  color: var(--c-kResult, inherit);
}
</style>
