<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { VBottomSheet, VMenu } from 'vuetify/components';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { parseNote } from '../lib/note';
import { canSpeak, speakJapanese } from '../lib/speech';
import { STATUS_COLOR, STATUS_ICON, statusStyle } from '../lib/status';
import { cardTextVars } from '../cardText';
import { settings } from '../settings';
import type { LookupResult, StudyResult, StudyStatus } from '../types';
import PitchLine from './PitchLine.vue';
import ReadingText from './ReadingText.vue';
import RubyWord from './RubyWord.vue';

/* The popup is an overlay outside the study screen: it carries the card's text styles itself (furigana, Han-Viet, kanji block). */
const textVars = computed(() => cardTextVars(settings.cardText));

const statusLabel = (s: StudyStatus): string => t(`status.${s}`);

/* anchor: with a mouse the popup sits right under that element instead (centred on it, above it when there is no room below); without it, a sheet from the bottom. */
/* statusOf: given (the word list of the study screen) the popup also carries the Again / Learned / Skip buttons of the word (a tap on the lit one takes it off)
   and, with canGo, a button that opens the word's card. */
const props = defineProps<{ headword: string | null; reading: string | null; fallbackMeaning: string; anchor?: HTMLElement | null; statusOf?: 'again' | 'learned' | 'skipped' | 'todo'; canGo?: boolean; wordId?: string | null }>();
const emit = defineEmits<{ close: []; mark: [result: StudyResult]; go: [] }>();
const statusBtns: { result: StudyResult; status: 'again' | 'learned' | 'skipped'; label: () => string; icon: string; color: string }[] = [
  { result: 'again', status: 'again', label: () => t('btn.again'), icon: STATUS_ICON.learning, color: STATUS_COLOR.learning },
  { result: 'learned', status: 'learned', label: () => t('btn.learned'), icon: STATUS_ICON.learned, color: STATUS_COLOR.learned },
  { result: 'skip', status: 'skipped', label: () => t('btn.skip'), icon: STATUS_ICON.skipped, color: STATUS_COLOR.skipped }
];

const wrapper = computed(() => (props.anchor ? VMenu : VBottomSheet));
const wrapperProps = computed(() => {
  const base = { modelValue: props.headword !== null, 'onUpdate:modelValue': (v: boolean) => !v && emit('close') };
  return props.anchor ? { ...base, target: props.anchor, location: 'bottom center' as const, offset: 1, closeOnContentClick: false } : base;
});
/* The card's own note (compound words, related words, a memory hint), only for a word of the user's cards (wordId): the dictionary lookup does not carry it. */
const note = ref<string | null>(null);
watch(
  () => [props.headword, props.wordId] as const,
  async ([headword, id]) => {
    note.value = null;
    if (!headword || !id) return;
    try {
      const [d] = await api.cardDetails([id]);
      if (props.wordId === id) note.value = d?.note ?? null;
    } catch {
      /* no note: the popup is complete without it */
    }
  },
  { immediate: true }
);
const noteLines = computed(() => parseNote(note.value));
const noteOpen = ref(false); // Notes start folded, for every word
watch(() => props.headword, () => (noteOpen.value = false));
const result = ref<LookupResult | null>(null);
const failed = ref(false);
const loading = ref(false);

watch(
  () => props.headword,
  async (headword) => {
    result.value = null;
    failed.value = false;
    if (!headword) return;
    loading.value = true;
    try {
      result.value = await api.lookup(headword, props.reading);
    } catch (e) {
      // 404 = not in either dictionary: fall back to the meaning written in the note.
      failed.value = !(e instanceof ApiError) || e.status !== 404;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

const pitchOpen = ref(false);

/* Han-Viet sound of each kanji, shown under it in the title. */
const hvMap = computed<Record<string, string>>(() => Object.fromEntries((result.value?.kanji ?? []).filter((k) => k.hanviet).map((k) => [k.literal, k.hanviet as string])));
const pitchInfo = computed(() => {
  const p = result.value?.pitch;
  return p?.morae?.length ? [p.label, p.note].filter(Boolean).join(' · ') : '';
});
watch(() => props.headword, () => {
  pitchOpen.value = false;
});

/* The meanings (each with its part of speech); older cached answers only have `meanings`. */
const senses = computed(() => {
  const r = result.value;
  if (!r) return [];
  return (r.senses?.length ? r.senses : r.meanings.map((m) => ({ pos: null, meaning: m, english: null }))).slice(0, 6);
});
const englishText = computed(() => {
  const r = result.value;
  if (!r) return '';
  return [r.english, ...senses.value.map((s) => s.english)].filter((x): x is string => !!x).join('; ').replace(/\n/g, '; ');
});
const posText = computed(() => [...new Set(senses.value.map((s) => s.pos).filter((p): p is string => !!p))].join(', '));
</script>

<template>
  <component :is="wrapper" v-bind="wrapperProps">
    <!-- the sheet is full width but the card is narrower: a click on the empty sides (the wrapper itself) closes it -->
    <div class="side" @click.self="emit('close')">
    <v-card class="pa-4 rel relpop" :class="statusOf ? `st-${statusOf}` : ''" :rounded="anchor ? 'lg' : 't-xl'" :style="textVars">
      <div class="d-flex align-center hdr">
        <v-btn
          v-if="canSpeak()"
          icon="mdi-volume-high"
          variant="text"
          class="tool3d mr-2"
          :aria-label="t('related.read')"
          @click="speakJapanese(result?.reading ?? reading ?? headword ?? '')"
        />
        <!-- furigana (with the pitch line) over each kanji piece, its Sino-Vietnamese sound under it: as on the card -->
        <RubyWord v-if="result?.ruby" class="hdrword" :cells="result.ruby" :hv="hvMap" />
        <template v-else>
          <div class="hw">
            <span class="text-h5 jp">{{ result?.headword ?? headword }}</span>
            <div v-if="result?.hanviet" class="hv hwv">{{ result.hanviet.toUpperCase() }}</div>
          </div>
          <PitchLine v-if="result?.pitch?.morae?.length" :morae="result.pitch.morae" class="ml-2 rd" />
          <!-- "On: … / Kun: …" is broken into two lines (On over Kun), like on the card; any other reading stays as it is -->
          <span v-else class="rd ml-2"><ReadingText :reading="result?.reading ?? reading ?? ''" /></span>
        </template>
        <!-- the pitch label ([0] bằng ...): behind an info icon, like the strokes and JLPT level -->
        <template v-if="pitchInfo">
          <button type="button" class="infobtn pitchbtn ml-1" :aria-label="pitchInfo" :aria-expanded="pitchOpen" :data-tip="pitchInfo" @click="pitchOpen = !pitchOpen">
            <v-icon icon="mdi-information-outline" size="18" />
          </button>
          <span v-if="pitchOpen" class="ml-1 text-medium-emphasis pitchv">{{ pitchInfo }}</span>
        </template>
        <!-- word list of the study screen: the way to this word's card, at the top right level with the word -->
        <v-btn v-if="canGo" size="small" variant="tonal" color="primary" prepend-icon="mdi-cards-outline" class="ml-auto gobtn" @click="emit('go')">{{ t('related.go') }}</v-btn>
      </div>
      <v-progress-linear v-if="loading" indeterminate class="my-2" />

      <div class="items">
        <!-- same rows as the back of the card: icon | label + value -->
        <div v-if="senses.length || (!result && !loading && fallbackMeaning)" class="item">
          <v-icon icon="mdi-translate" color="success" />
          <div class="grow">
            <div class="label">{{ t('detail.vietnamese') }}</div>
            <template v-if="senses.length">
              <div v-for="(s, i) in senses" :key="i" class="bm">{{ senses.length > 1 ? `${i + 1}. ` : '' }}{{ s.meaning }}</div>
            </template>
            <span v-else class="bm">{{ fallbackMeaning }}</span>
          </div>
        </div>

        <div v-if="englishText" class="item">
          <v-icon icon="mdi-alphabetical-variant" color="info" />
          <div><div class="label">English</div><i class="den">{{ englishText }}</i></div>
        </div>

        <div v-if="posText" class="item">
          <v-icon icon="mdi-tag-outline" color="warning" />
          <div><div class="label">{{ t('detail.pos') }}</div><span class="posv">{{ posText }}</span></div>
        </div>

        <div v-if="result?.example" class="item">
          <v-icon icon="mdi-format-quote-open-outline" color="secondary" />
          <div class="grow">
            <div class="label">{{ t('detail.example') }}</div>
            <div class="jp example">{{ result.example }}</div>
            <div v-if="result.exampleVi" class="exvi">{{ result.exampleVi }}</div>
          </div>
        </div>

        <!-- the card's note, as on its back: compound / related words in three aligned columns (word | reading | meaning), other lines across the width -->
        <!-- Notes: folded at first (the icon beside the title shows / hides it); the status and where the word comes from are part of it -->
        <div v-if="result" class="item">
          <v-icon icon="mdi-note-text-outline" color="secondary" />
          <div class="grow">
            <button type="button" class="label notes-toggle" :aria-expanded="noteOpen" @click.stop="noteOpen = !noteOpen">
              {{ t('detail.notes') }}<v-icon :icon="noteOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
            </button>
            <template v-if="noteOpen">
              <div v-if="noteLines.length" class="notegrid">
                <div v-for="(line, i) in noteLines" :key="i" class="noteline" :class="{ cmp: !!(line.compound ?? line.related) }">
                  <template v-if="line.compound ?? line.related">
                    <span class="related jp">{{ (line.compound ?? line.related)!.headword }}</span>
                    <span class="nrd jp">{{ (line.compound ?? line.related)!.reading ?? '' }}</span>
                    <span>{{ (line.compound ?? line.related)!.meaning }}</span>
                  </template>
                  <template v-else>{{ line.text }}</template>
                </div>
              </div>
              <div class="meta">
                <v-chip v-if="result.status" size="small" class="stchip" :style="statusStyle(result.status)" :prepend-icon="STATUS_ICON[result.status]">{{ statusLabel(result.status) }}</v-chip>
                <span class="text-caption text-medium-emphasis">{{ result.source === 'user' ? t('related.mine') : t('related.dict') }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="failed" class="text-caption text-error mt-1">{{ t('related.fail') }}</div>
      <div v-if="statusOf" class="stbar">
        <button v-for="b in statusBtns" :key="b.result" type="button" class="stb2" :class="{ on: statusOf === b.status }" :style="{ '--sc': b.color }" :aria-pressed="statusOf === b.status" @click="emit('mark', statusOf === b.status ? 'new' : b.result)">
          <v-icon :icon="b.icon" size="16" />{{ b.label() }}
        </button>
      </div>
      <div class="d-flex justify-end ga-2 mt-3">
        <v-btn size="small" variant="tonal" color="error" prepend-icon="mdi-close" :data-tip="t('related.close')" @click="emit('close')">{{ t('related.close') }}</v-btn>
      </div>
    </v-card>
    </div>
  </component>
</template>

<style scoped>
.side {
  display: flex;
  justify-content: center;
}
.rel {
  /* as wide as its content (not the whole screen), with a floor and a ceiling */
  width: max-content;
  min-width: min(320px, 92vw);
  max-width: min(860px, 96vw);
  max-height: 85vh;
  overflow-y: auto;
}
/* the word's current status tints the popup (same colours as its tile in the list) */
.rel.st-learned {
  background: color-mix(in srgb, #3f9b1f 20%, var(--paper));
}
.rel.st-again {
  background: color-mix(in srgb, #2f80d1 20%, var(--paper));
}
.rel.st-skipped {
  background: color-mix(in srgb, #ef8a17 22%, var(--paper));
}
.notegrid {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr); /* word | reading | meaning */
  column-gap: 12px;
  row-gap: 6px;
  margin-left: 10px;
}
.notegrid > .noteline {
  grid-column: 1 / -1;
}
.notegrid > .noteline.cmp {
  display: grid;
  grid-template-columns: subgrid;
  align-items: baseline;
}
.notegrid .related {
  display: block; /* the frame fills its column, like the Compounds of the kanji sheet */
  padding: 1px 6px;
  font-weight: 700;
  line-height: 1.3;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
}
.nrd {
  white-space: nowrap;
}
.notes-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
.items {
  display: grid;
  gap: 12px;
  margin-top: 8px;
}
.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.92rem;
  min-width: 0;
}
.item .grow {
  flex: 1;
  min-width: 0;
}
/* what sits under a label is indented a little, so the label stands out */
.bm,
.den,
.posv,
.example,
.exvi {
  display: block;
  margin-left: 10px;
}
.bm {
  font-weight: 600;
}
.exvi {
  opacity: 0.8;
}
.example {
  color: var(--jp);
  line-height: 1.5;
}
.hv {
  color: var(--hv);
  letter-spacing: 0.06em;
}
.pitchv {
  font-size: 0.85rem;
}
.hdr {
  --s-wordRuby: 28px;
  --s-furigana: 12px;
  --s-hanviet: 11px;
}
/* the pitch icon belongs to the furigana: it sits on the furigana row (top of the title), not beside the middle of the kanji */
.pitchbtn {
  align-self: flex-start;
  margin-top: 1px;
}
.hw {
  line-height: 1.15;
}
.hwv {
  font-size: 0.8rem;
}
.infobtn {
  display: inline-flex;
  vertical-align: middle;
  padding: 0;
  border: 0;
  background: none;
  color: var(--leaf);
  cursor: pointer;
}
/* the three status buttons of the word (the lit one is the word's status), same colours as the deck screen */
.gobtn {
  flex: none;
}
.stbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.stb2 {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 11px 0 8px;
  border: 1.5px solid color-mix(in srgb, var(--sc) 55%, transparent);
  border-radius: 999px;
  background: none;
  color: var(--sc);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.stb2.on {
  background: var(--sc);
  border-color: var(--sc);
  color: #fff;
}
.stb2:not(.on):active {
  background: color-mix(in srgb, var(--sc) 30%, transparent);
}
@media (hover: hover) and (pointer: fine) {
  .stb2:not(.on):hover {
    background: color-mix(in srgb, var(--sc) 8%, transparent);
    border-color: var(--sc);
  }
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
</style>
