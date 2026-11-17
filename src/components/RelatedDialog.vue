<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { canSpeak, speakJapanese } from '../lib/speech';
import type { LookupResult } from '../types';

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
</script>

<template>
  <v-bottom-sheet :model-value="headword !== null" @update:model-value="(v: boolean) => !v && emit('close')">
    <v-card class="pa-4" rounded="t-xl">
      <div class="d-flex align-center">
        <span class="text-h5 jp">{{ result?.headword ?? headword }}</span>
        <span class="rd ml-2">{{ result?.reading ?? reading }}</span>
        <v-spacer />
        <v-btn
          v-if="canSpeak()"
          icon="mdi-volume-high"
          variant="text"
          :aria-label="t('related.read')"
          @click="speakJapanese(result?.reading ?? reading ?? headword ?? '')"
        />
      </div>
      <v-progress-linear v-if="loading" indeterminate class="my-2" />
      <div v-if="result?.hanviet" class="hv text-subtitle-2">{{ result.hanviet.toUpperCase() }}</div>
      <template v-if="result">
        <div v-for="(m, i) in result.meanings.slice(0, 6)" :key="i" class="text-body-1">{{ i + 1 }}. {{ m }}</div>
      </template>
      <div v-else-if="!loading" class="text-body-1">{{ fallbackMeaning }}</div>
      <div v-if="failed" class="text-caption text-error mt-1">{{ t('related.fail') }}</div>
      <v-btn block variant="tonal" class="mt-3" @click="emit('close')">{{ t('related.close') }}</v-btn>
    </v-card>
  </v-bottom-sheet>
</template>
