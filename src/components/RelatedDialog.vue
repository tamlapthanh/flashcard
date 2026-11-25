<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { canSpeak, speakJapanese } from '../lib/speech';
import { STATUS_ICON, statusStyle } from '../lib/status';
import { cardTextVars } from '../cardText';
import { settings } from '../settings';
import type { LookupResult, StudyStatus } from '../types';
import PitchLine from './PitchLine.vue';
import RubyWord from './RubyWord.vue';

/* The popup is an overlay outside the study screen: it carries the card's text styles itself (furigana, Han-Viet, kanji block). */
const textVars = computed(() => cardTextVars(settings.cardText));

const statusLabel = (s: StudyStatus): string => t(`status.${s}`);

const props = defineProps<{ headword: string | null; reading: string | null; fallbackMeaning: string }>();
const emit = defineEmits<{ close: [] }>();

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
  <v-bottom-sheet :model-value="headword !== null" @update:model-value="(v: boolean) => !v && emit('close')">
    <!-- the sheet is full width but the card is narrower: a click on the empty sides (the wrapper itself) closes it -->
    <div class="side" @click.self="emit('close')">
    <v-card class="pa-4 rel" rounded="t-xl" :style="textVars">
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
          <span v-else class="rd ml-2">{{ result?.reading ?? reading }}</span>
        </template>
        <!-- the pitch label ([0] bằng ...): behind an info icon, like the strokes and JLPT level -->
        <template v-if="pitchInfo">
          <button type="button" class="infobtn pitchbtn ml-1" :aria-label="pitchInfo" :aria-expanded="pitchOpen" :data-tip="pitchInfo" @click="pitchOpen = !pitchOpen">
            <v-icon icon="mdi-information-outline" size="18" />
          </button>
          <span v-if="pitchOpen" class="ml-1 text-medium-emphasis pitchv">{{ pitchInfo }}</span>
        </template>
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
      </div>

      <div v-if="result" class="meta">
        <v-chip v-if="result.status" size="small" class="stchip" :style="statusStyle(result.status)" :prepend-icon="STATUS_ICON[result.status]">{{ statusLabel(result.status) }}</v-chip>
        <span class="text-caption text-medium-emphasis">{{ result.source === 'user' ? t('related.mine') : t('related.dict') }}</span>
      </div>

      <div v-if="failed" class="text-caption text-error mt-1">{{ t('related.fail') }}</div>
      <v-btn block variant="tonal" prepend-icon="mdi-close" class="mt-3" :data-tip="t('related.close')" @click="emit('close')">{{ t('related.close') }}</v-btn>
    </v-card>
    </div>
  </v-bottom-sheet>
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
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
</style>
