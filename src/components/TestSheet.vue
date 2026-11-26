<script setup lang="ts">
/* The sheet that starts a test of one deck: how many questions, which kinds, and (optionally) only the words of some statuses.
   Shared by the deck list (Test button of a deck) and the study screen. The tags are the ones the caller is working with. */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import TagChips from './TagChips.vue';
import { t } from '../i18n';
import { ALL_KINDS, MAX_QUESTIONS, modeOf, type QuizKind } from '../lib/quiz';
import { STATUS_ICON, STATUS_ORDER, statusStyle } from '../lib/status';
import { pendingTest } from '../store';
import type { Deck, StudyStatus } from '../types';

const ALL = 0; // the value of the "All" choice
const props = defineProps<{ deck: Deck | null; tags: string[] }>();
const open = defineModel<boolean>({ required: true });
const router = useRouter();

const count = ref(ALL); // the default: every word that matches (up to MAX_QUESTIONS)
const kinds = ref<QuizKind[]>([...ALL_KINDS]); // any choice of the three kinds
/* Tapping a kind toggles it; at least one stays picked. */
const kindChips = computed<string[]>({
  get: () => kinds.value,
  set: (v) => {
    const picked = ALL_KINDS.filter((k) => v.includes(k));
    if (picked.length > 0) kinds.value = picked;
  }
});
const statuses = ref<StudyStatus[]>([]); // none ticked: every word of the deck
const COUNTS = [10, 20, 50, ALL];
const statusLabel = (s: StudyStatus): string => t(`status.${s}`);

/* The words per status: for the whole deck these are in the deck; with tags chosen they are counted among the words of those tags
   (fetched when the sheet opens), so the numbers - and the test - always match what is on the screen. */
const tagCounts = ref<Record<StudyStatus, number> | null>(null);
const countsLoading = ref(false);
watch(
  () => [open.value, props.deck?.id, props.tags.join('')] as const,
  async ([isOpen]) => {
    tagCounts.value = null;
    const d = props.deck;
    if (!isOpen || !d || props.tags.length === 0) return;
    const wanted = props.tags.join('');
    countsLoading.value = true;
    try {
      const { cards } = await api.cards({ deck: d.id, tags: [...props.tags], status: STATUS_ORDER });
      if (wanted !== props.tags.join('')) return; // the sheet moved on to other tags while this was loading
      const counted: Record<StudyStatus, number> = { new: 0, learning: 0, learned: 0, skipped: 0 };
      for (const c of cards) counted[c.progress.status]++;
      tagCounts.value = counted;
    } catch {
      tagCounts.value = null; // offline: the numbers show "?" instead of the numbers of the whole deck
    } finally {
      countsLoading.value = false;
    }
  },
  { immediate: true }
);
const counts = computed<Record<StudyStatus, number> | null>(() => (props.tags.length ? tagCounts.value : (props.deck?.counts ?? null)));
const countText = (s: StudyStatus): string => (counts.value ? String(counts.value[s]) : countsLoading.value ? '…' : '?');
/** How many words the test is made from: the ticked statuses (none ticked: all of them), among the chosen tags. */
const matching = computed<number | null>(() => {
  const c = counts.value;
  if (!c) return null;
  return (statuses.value.length ? statuses.value : STATUS_ORDER).reduce((n, s) => n + c[s], 0);
});

function start(): void {
  const d = props.deck;
  if (!d) return;
  open.value = false;
  pendingTest.value = { deckId: d.id, deckName: d.name, tags: [...props.tags], statuses: [...statuses.value], count: count.value === ALL ? Math.min(matching.value ?? MAX_QUESTIONS, MAX_QUESTIONS) : count.value, kinds: modeOf(kinds.value), kindList: [...kinds.value] };
  void router.push('/test');
}
</script>

<template>
  <v-bottom-sheet v-model="open">
    <v-card class="tsheet" rounded="t-xl">
      <div class="tgrip" />
      <div class="pa-4 pt-1">
        <div class="label ttitle"><v-icon icon="mdi-school-outline" size="14" />{{ t('test.sheet', { name: deck?.name ?? '' }) }}</div>
        <div class="sub s-tags mb-1"><v-icon icon="mdi-tag-multiple-outline" size="16" />{{ t('filter.tags') }}</div>
        <TagChips v-if="tags.length" :tags="tags" class="ind mb-2" />
        <div v-else class="ind text-caption text-medium-emphasis mb-2">{{ t('test.noTags') }}</div>
        <div class="sub s-count mb-1"><v-icon icon="mdi-counter" size="16" />{{ t('test.count') }}</div>
        <v-chip-group v-model="count" mandatory filter color="primary" class="ind mb-2">
          <v-chip v-for="n in COUNTS" :key="n" :value="n" size="small">{{ n === ALL ? t('test.countAll') : n }}</v-chip>
        </v-chip-group>
        <div class="sub s-kind mb-1"><v-icon icon="mdi-shape-outline" size="16" />{{ t('test.kinds') }}</div>
        <v-chip-group v-model="kindChips" multiple filter color="primary" class="ind mb-2">
          <v-chip value="meaning" size="small" prepend-icon="mdi-translate">{{ t('test.kindMeaning') }}</v-chip>
          <v-chip value="listen" size="small" prepend-icon="mdi-volume-high">{{ t('test.kindListen') }}</v-chip>
          <v-chip value="reading" size="small" prepend-icon="mdi-syllabary-hiragana">{{ t('test.kindReading') }}</v-chip>
        </v-chip-group>
        <div class="sub s-words mb-1"><v-icon icon="mdi-filter-variant" size="16" />{{ t('test.source') }}</div>
        <v-chip-group v-model="statuses" multiple color="primary" class="ind mb-1">
          <v-chip v-for="s in STATUS_ORDER" :key="s" :value="s" size="small" class="stchip" :style="statusStyle(s)" :prepend-icon="STATUS_ICON[s]">{{ statusLabel(s) }} ({{ countText(s) }})</v-chip>
        </v-chip-group>
        <div v-if="statuses.length === 0" class="ind text-caption text-medium-emphasis">{{ t('test.allWords') }}</div>
        <div v-if="matching !== null" class="ind matching text-body-2"><v-icon icon="mdi-text-box-check-outline" size="16" /> {{ t('test.matching', { n: matching, q: count === ALL ? Math.min(matching, MAX_QUESTIONS) : Math.min(count, matching) }) }}</div>
        <v-btn block color="primary" size="large" class="mt-3" prepend-icon="mdi-play" :data-tip="t('tip.testStart')" @click="start">{{ t('test.start') }}</v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.tsheet {
  background: var(--paper);
}
.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--sc); /* each title has its own colour (icon and text) */
}
.s-tags { --sc: #ef8a17; } /* orange, like the tag button of a deck */
.s-count { --sc: #1e88e5; } /* blue */
.s-kind { --sc: #8e4ec6; } /* purple */
.s-words { --sc: #1a9c9c; } /* teal */
.ind {
  margin-left: 22px; /* under the label's text, past its icon (16px + 6px gap) */
}
/* phone: the title is centred; wider screens keep it on the left */
@media (max-width: 600px) {
  .ttitle {
    justify-content: center;
  }
}
.matching {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
.tgrip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 4px;
}
</style>
