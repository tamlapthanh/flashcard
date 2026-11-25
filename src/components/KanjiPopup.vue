<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { api } from '../api';
import { cardTextVars } from '../cardText';
import { settings } from '../settings';
import { t } from '../i18n';
import type { KanjiInfo } from '../types';
import KanjiPractice from './KanjiPractice.vue';
/* KanjiBlock opens this popup for its own parts: load it lazily so the two do not import each other. */
const KanjiBlock = defineAsyncComponent(() => import('./KanjiBlock.vue'));

/* A kanji (a part tapped in Components) shown in a small popup over whatever is open, appearing like the word popup. */
const props = defineProps<{ literal: string | null }>();
const emit = defineEmits<{ close: [] }>();

const kanji = ref<KanjiInfo | null>(null);
const practicing = ref<KanjiInfo | null>(null);
const textVars = computed(() => cardTextVars(settings.cardText));

watch(
  () => props.literal,
  async (literal) => {
    kanji.value = null;
    practicing.value = null;
    if (!literal) return;
    try {
      const [k] = await api.kanji(literal);
      if (k && props.literal === literal) kanji.value = k;
      else if (!k) emit('close'); // no record of this part: nothing to show
    } catch {
      emit('close'); // offline or unknown
    }
  },
  { immediate: true }
);
</script>

<template>
  <v-bottom-sheet :model-value="literal !== null && kanji !== null" @update:model-value="(v: boolean) => !v && emit('close')">
    <!-- the sheet is full width but the card is narrower: a click on the empty sides (the wrapper itself) closes it -->
    <div class="side" @click.self="emit('close')">
      <v-card class="pa-4 kp" rounded="t-xl" :style="textVars">
        <KanjiPractice v-if="practicing" :key="practicing.Literal" :kanji="practicing" @back="practicing = null" />
        <KanjiBlock v-else-if="kanji" :key="kanji.Literal" :kanji="kanji" @practice="(k: KanjiInfo) => (practicing = k)" />
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
.kp {
  width: min(520px, 96vw);
  max-height: 90dvh;
  overflow-y: auto;
  background: var(--paper);
}
</style>
