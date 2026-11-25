<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import type { KanjiInfo } from '../types';
import { compoundsOf, hintBesideCompounds, mnemonicOf } from '../lib/kanjiNotes';
import KanjiTree from './KanjiTree.vue';
import RelatedDialog from './RelatedDialog.vue';
import KanjiPopup from './KanjiPopup.vue';
import StrokePlayer from './StrokePlayer.vue';

/* sideBySide: Compounds may sit to the right of the Memory hint, when the block is wide enough (only a lone kanji on a wide sheet asks for it). */
const props = defineProps<{ kanji: KanjiInfo; sideBySide?: boolean }>();
const emit = defineEmits<{ open: [literal: string]; practice: [kanji: KanjiInfo] }>();

/* Memory hint, Compounds (and Components, in KanjiTree) start folded, on the web and on a phone alike: the user opens what they want. */
const hintOpen = ref(false);

const meaning = computed(() => (props.kanji.MeaningsVi.length ? props.kanji.MeaningsVi : props.kanji.MeaningsEn).slice(0, 3).join('; '));
/* English meanings are added after the Vietnamese ones (when there are no Vietnamese ones, `meaning` already is the English). */
const english = computed(() => (props.kanji.MeaningsVi.length ? props.kanji.MeaningsEn.slice(0, 3).join('; ') : ''));
const jlpt = computed(() => (props.kanji.Jlpt ? `N${props.kanji.Jlpt}` : null)); // LCT stores the OLD 1-4 scale
const hasStrokes = computed(() => (props.kanji.StrokePaths?.length ?? 0) > 0);
/* strokes and JLPT level: behind an info icon (a tooltip with the mouse, a tap on the icon on a touch screen) */
const infoText = computed(() => [props.kanji.Strokes ? t('kanji.strokes', { n: props.kanji.Strokes }) : '', jlpt.value ?? ''].filter(Boolean).join(' · '));
const infoOpen = ref(false);
const infoUp = computed(() => !!infoText.value && !english.value && !!(props.kanji.HanViet || meaning.value)); // no English line: the icon sits on line 1
/* Radical, its Han-Viet sound and its meaning, as LCT shows it ("⼟ THỔ — đất"); the meaning is Vietnamese when the radical's own kanji has one, else English. */
const radical = computed(() => {
  const base = [props.kanji.Radical, props.kanji.RadicalHanViet?.toUpperCase()].filter(Boolean).join(' ');
  const m = props.kanji.RadicalMeaning?.trim();
  return base && m ? `${base} — ${m}` : base;
});

/* The parts of the kanji; without the server's explanations (older server) they still show as bare characters. */
const parts = computed(() => props.kanji.Parts ?? props.kanji.Components.filter((c) => c !== props.kanji.Literal).map((c) => ({ Literal: c, HanViet: null, Meaning: null })));
const compounds = computed(() => compoundsOf(props.kanji));
const mnemonic = computed(() => mnemonicOf(props.kanji));
const compOpen = ref(false); // Compounds fold like the Memory hint
const firstMeaning = computed(() => (props.kanji.MeaningsVi[0] ?? props.kanji.MeaningsEn[0] ?? '').trim());

/* Tapping a compound opens the same dictionary popup as a related word on the card. */
const word = ref<{ headword: string; reading: string | null; meaning: string } | null>(null);
function openWord(c: { Word: string; Reading?: string | null; Vi?: string | null }): void {
  word.value = { headword: c.Word, reading: c.Reading || null, meaning: c.Vi ?? '' };
}

/* A part tapped in Components opens its own kanji in a small popup (it appears like the word popup of a compound). */
const partLit = ref<string | null>(null);

function toggleComp(): void {
  compOpen.value = !compOpen.value;
}
function toggleHint(): void {
  hintOpen.value = !hintOpen.value;
}
</script>

<!-- One kanji on one screen: header, then the stroke order on the left and the few facts that matter on the right. -->
<template>
  <div class="kanji" :data-literal="kanji.Literal">
    <!-- line 1: Sino-Vietnamese sound and Vietnamese meaning; line 2: the English meaning and the info icon (strokes, JLPT). The kanji itself is in the tab above. -->
    <div class="top">
      <div class="info">
        <div v-if="kanji.HanViet || meaning" class="kline kline1">
          <span v-if="kanji.HanViet" class="hv khv">{{ kanji.HanViet.toUpperCase() }}</span>
          <span v-if="meaning" class="kmean">{{ meaning }}</span>
          <!-- no English meaning: the info icon moves up to the end of this line -->
          <template v-if="infoUp">
            <button type="button" class="infobtn" :aria-label="infoText" :aria-expanded="infoOpen" :data-tip="infoText" @click="infoOpen = !infoOpen">
              <v-icon icon="mdi-information-outline" size="18" />
            </button>
            <span v-if="infoOpen" class="meta">{{ infoText }}</span>
          </template>
        </div>
        <div v-if="english || (infoText && !infoUp)" class="kline kline2">
          <span v-if="english" class="kmean ken">{{ english }}</span>
          <!-- strokes and JLPT level: a tooltip with the mouse, a tap on the icon on a touch screen -->
          <template v-if="infoText">
            <button type="button" class="infobtn" :aria-label="infoText" :aria-expanded="infoOpen" :data-tip="infoText" @click="infoOpen = !infoOpen">
              <v-icon icon="mdi-information-outline" size="18" />
            </button>
            <span v-if="infoOpen" class="meta">{{ infoText }}</span>
          </template>
        </div>
      </div>
    </div>

    <div class="body" :class="{ single: !hasStrokes }">
      <StrokePlayer v-if="hasStrokes" :literal="kanji.Literal" :paths="kanji.StrokePaths!" @practice="emit('practice', kanji)" />
      <div class="side">
        <!-- "On value" / "Kun value": the values start in the same column -->
        <div v-if="kanji.Onyomi.length || kanji.Kunyomi.length" class="reads">
          <template v-if="kanji.Onyomi.length">
            <span class="label flabel">On</span><span class="rd kread">{{ kanji.Onyomi.join('、') }}</span>
          </template>
          <template v-if="kanji.Kunyomi.length">
            <span class="label flabel">Kun</span><span class="rd kread">{{ kanji.Kunyomi.join('、') }}</span>
          </template>
        </div>
        <div v-if="radical"><div class="label flabel nocaps">{{ t('kanji.radical') }}</div><span class="jp krad">{{ radical }}</span></div>
      </div>
    </div>

    <div class="pair" :class="{ sbs: sideBySide && hintBesideCompounds(kanji) }">
    <!-- Memory hint: the kanji as the sum of its parts. Every part is a same-size tile holding only the character; its sound
         and meaning sit beside it, so the rows line up: whole | = / + | part | what it is. -->
    <div v-if="parts.length || mnemonic.length" class="hint">
      <button type="button" class="label hint-toggle" :aria-expanded="hintOpen" @click="toggleHint">
        <v-icon icon="mdi-lightbulb-on-outline" size="14" />{{ t('kanji.hint') }}<v-icon :icon="hintOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
      </button>
      <div v-if="hintOpen && parts.length" class="formula">
        <span class="whole jp" :style="{ gridRow: `1 / span ${parts.length + (firstMeaning ? 1 : 0)}` }">{{ kanji.Literal }}</span>
        <template v-for="(p, i) in parts" :key="i">
          <!-- a part that is a kanji of its own opens in the same small popup as a part of Components -->
          <button v-if="p.HanViet || p.Meaning" type="button" class="pg jp link" :aria-label="`Kanji ${p.Literal}`" @click.stop="partLit = p.Literal">{{ p.Literal }}</button>
          <span v-else class="pg jp">{{ p.Literal }}</span>
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
          <a class="jp cw cl" href="#" @click.prevent.stop="openWord(c)">{{ c.Word }}</a>
          <span class="jp ctj">{{ c.Reading ?? '' }}</span>
          <span class="chv">{{ c.HanViet ? c.HanViet.toUpperCase() : '' }}</span>
          <span class="ct">{{ c.Vi ?? '' }}</span>
        </li>
      </ul>
    </div>

    </div>

    <RelatedDialog :headword="word?.headword ?? null" :reading="word?.reading ?? null" :fallback-meaning="word?.meaning ?? ''" @close="word = null" />

    <KanjiPopup :literal="partLit" @close="partLit = null" />

    <KanjiTree v-if="kanji.PartEdges?.length" :literal="kanji.Literal" :edges="kanji.PartEdges" :names="kanji.Tree ?? []" :root-hv="kanji.HanViet" @open="(l: string) => (partLit = l)" />
  </div>
</template>

<style scoped>
/* The block is its own container: whether two columns fit depends on ITS width, not the window's. */
.kanji {
  container-type: inline-size;
}
/* Wide enough (and a lone kanji): Memory hint on the left, Compounds on the right, side by side at the same height. Otherwise they stack. */
@container (min-width: 640px) {
  .pair.sbs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 28px;
    align-items: start;
  }
}
.top {
  display: flex;
  gap: 12px;
  align-items: center;
}
.info {
  flex: 1;
  min-width: 0;
}
/* Sino-Vietnamese, Vietnamese and English run on in one line (and wrap when the sheet is narrow) */
.kline {
  line-height: 1.4;
}
.khv {
  font-size: var(--s-kHanviet, 14px);
  font-style: var(--i-kHanviet, normal);
  font-weight: 500;
  color: var(--c-kHanviet, var(--hv));
}
.kmean {
  font-size: var(--s-kMeaning, 14px);
  font-style: var(--i-kMeaning, normal);
  color: var(--c-kMeaning, inherit);
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
  font-size: var(--s-kMeta, 12px);
  font-style: var(--i-kMeta, normal);
  color: var(--c-kMeta, inherit);
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
.reads {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr); /* label | value: the values of On and Kun line up */
  column-gap: 8px;
  align-items: baseline;
  row-gap: 5px;
}
.kread {
  display: block;
  font-size: var(--s-kReading, 14px);
  font-style: var(--i-kReading, normal);
  line-height: 1.4;
  color: var(--c-kReading, var(--rd));
}
.krad {
  display: block;
  margin-left: 18px;
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
  grid-template-columns: auto auto auto minmax(0, 1fr); /* one compound per row, in aligned columns: word | reading | Sino-Viet | meaning */
  gap: 6px 12px;
  margin-left: 18px; /* the content of a section sits a little to the right of its title */
}
.clist li {
  min-width: 0;
  overflow-wrap: anywhere;
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: baseline;
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
/* A tappable compound is framed like the kanji tiles of Sino-Viet (a thin border, rounded corners, no underline that would cross the strokes). */
.cl {
  display: inline-block;
  padding: 1px 6px;
  text-decoration: none;
  cursor: pointer;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
  line-height: 1.3;
}
.cl:hover {
  border-color: var(--leaf);
}
.chv {
  font-size: var(--s-kCompText, 14px);
  color: var(--c-kCompHv, var(--hv));
  letter-spacing: 0.06em;
  white-space: nowrap;
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
.pg.link {
  cursor: pointer;
  padding-inline: 0;
}
.pg.link:hover {
  border-color: var(--leaf);
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
