<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { t } from '../i18n';
import { ANY_DECK, drawPaper, loadPool, wordsWithTags } from '../lib/paper';
import { ALL_KINDS, MAX_QUESTIONS, modeOf, type QuizKind, type QuizQuestion } from '../lib/quiz';
import type { Deck, LightCard } from '../types';

/*
 * The sheet where an admin makes a test (a paper) for everybody: which decks and which lessons (tags), how many questions, which kinds. The
 * questions are drawn here, shown for a look (draw again as often as wanted), and only then published: the paper keeps these exact questions and
 * options, so every user takes the same test.
 */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ created: [] }>();

const ALL = 0; // the value of the "All" choice
const COUNTS = [10, 20, 30, 50, ALL];

const decks = ref<Deck[]>([]);
const decksFailed = ref(false);
const title = ref('');
const anyDeck = ref(false); // random from every deck
const deckIds = ref<string[]>([]);
const tags = ref<string[]>([]);
const count = ref(20);
const kinds = ref<QuizKind[]>([...ALL_KINDS]); // any choice of the three kinds; "All" stands for the three

/* The chips: "All" first, then the three kinds. Tapping "All" picks the three; tapping a kind toggles it, and at least one stays picked. */
const allKinds = computed(() => ALL_KINDS.every((k) => kinds.value.includes(k)));
const kindChips = computed<string[]>({
  get: () => (allKinds.value ? ['all', ...kinds.value] : kinds.value),
  set: (v) => {
    const picked = ALL_KINDS.filter((k) => v.includes(k));
    if (v.includes('all') && !allKinds.value) kinds.value = [...ALL_KINDS];
    else if (picked.length > 0) kinds.value = picked;
  }
});

type Phase = 'form' | 'loading' | 'preview';
const phase = ref<Phase>('form');
const failed = ref<'load' | 'save' | null>(null);
const pool = ref<LightCard[]>([]);
const questions = ref<QuizQuestion[]>([]);
const matching = ref(0);
const saving = ref(false);

/* The decks the paper draws on, and the tags those decks have. */
const chosenDecks = computed(() => (anyDeck.value ? decks.value : decks.value.filter((d) => deckIds.value.includes(d.id))));
const tagOptions = computed(() => {
  const counts = new Map<string, number>();
  for (const d of chosenDecks.value) for (const x of d.tags) counts.set(x.tag, (counts.get(x.tag) ?? 0) + x.count);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja', { numeric: true }));
});
const canBuild = computed(() => title.value.trim().length > 0 && chosenDecks.value.length > 0);

watch(
  () => tagOptions.value.map(([tag]) => tag).join('\n'),
  () => (tags.value = tags.value.filter((x) => tagOptions.value.some(([tag]) => tag === x))) // a tag of a deck that was unticked goes with it
);

async function loadDecks(): Promise<void> {
  decksFailed.value = false;
  try {
    decks.value = await api.decks();
  } catch {
    decksFailed.value = true;
  }
}

watch(open, (on) => {
  if (!on) return;
  phase.value = 'form';
  failed.value = null;
  questions.value = [];
  if (decks.value.length === 0) void loadDecks();
});

function draw(): void {
  const n = count.value === ALL ? MAX_QUESTIONS : count.value;
  matching.value = wordsWithTags(pool.value, tags.value).length;
  questions.value = drawPaper(pool.value, tags.value, n, kinds.value);
}

async function build(): Promise<void> {
  if (!canBuild.value) return;
  phase.value = 'loading';
  failed.value = null;
  try {
    pool.value = await loadPool(anyDeck.value ? [ANY_DECK] : chosenDecks.value.map((d) => d.id));
    draw();
    phase.value = 'preview';
  } catch {
    failed.value = 'load';
    phase.value = 'form';
  }
}

const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

async function publish(): Promise<void> {
  if (questions.value.length === 0 || saving.value) return;
  saving.value = true;
  failed.value = null;
  try {
    await api.createPaper({
      paperId: newId(),
      title: title.value.trim(),
      sources: chosenDecks.value.map((d) => ({ deckId: d.id, tags: [...tags.value] })),
      mode: modeOf(kinds.value),
      questions: questions.value.map((q) => ({ wordId: q.card.id, kind: q.kind, options: q.options.map((o) => o.id) }))
    });
    open.value = false;
    title.value = '';
    emit('created');
  } catch {
    failed.value = 'save';
  } finally {
    saving.value = false;
  }
}

const kindIcon = (kind: string): string => (kind === 'listen' ? 'mdi-volume-high' : kind === 'reading' ? 'mdi-syllabary-hiragana' : 'mdi-translate');
</script>

<template>
  <v-bottom-sheet v-model="open" scrollable>
    <v-card class="msheet" rounded="t-xl">
      <div class="mgrip" />
      <div class="pa-4 pt-1 mbody">
        <div class="label mtitle"><v-icon icon="mdi-school-outline" size="14" />{{ t('maker.title') }}</div>

        <v-alert v-if="failed" type="error" variant="tonal" density="compact" class="mb-2">{{ failed === 'save' ? t('maker.error') : t('maker.loadError') }}</v-alert>

        <template v-if="phase !== 'preview'">
          <v-text-field v-model="title" :label="t('maker.name')" density="compact" variant="outlined" hide-details maxlength="120" class="mb-3" />

          <div class="sub s-deck mb-1"><v-icon icon="mdi-cards-outline" size="16" />{{ t('maker.decks') }}</div>
          <v-alert v-if="decksFailed" type="error" variant="tonal" density="compact" class="ind mb-2">
            {{ t('maker.loadError') }}
            <template #append><v-btn size="small" variant="tonal" @click="loadDecks">{{ t('deck.retry') }}</v-btn></template>
          </v-alert>
          <v-chip-group v-else v-model="deckIds" multiple filter column color="primary" class="ind mb-1" :disabled="anyDeck">
            <v-chip v-for="d in decks" :key="d.id" :value="d.id" size="small" class="jp">{{ d.name }}</v-chip>
          </v-chip-group>
          <v-checkbox v-model="anyDeck" :label="t('maker.anyDeck')" density="compact" hide-details class="ind mb-2" />

          <div class="sub s-tags mb-1"><v-icon icon="mdi-tag-multiple-outline" size="16" />{{ t('maker.tags') }}</div>
          <div v-if="tagOptions.length === 0" class="ind text-caption text-medium-emphasis mb-2">{{ t('test.noTags') }}</div>
          <template v-else>
            <v-chip-group v-model="tags" multiple filter color="primary" class="ind tagbox mb-0">
              <v-chip v-for="[tag, n] in tagOptions" :key="tag" :value="tag" size="small">{{ tag }} ({{ n }})</v-chip>
            </v-chip-group>
            <div class="ind text-caption text-medium-emphasis mb-2">{{ t('maker.tagsHint') }}</div>
          </template>

          <div class="sub s-count mb-1"><v-icon icon="mdi-counter" size="16" />{{ t('test.count') }}</div>
          <v-chip-group v-model="count" mandatory filter color="primary" class="ind mb-2">
            <v-chip v-for="n in COUNTS" :key="n" :value="n" size="small">{{ n === ALL ? t('test.countAll') : n }}</v-chip>
          </v-chip-group>

          <div class="sub s-kind mb-1"><v-icon icon="mdi-shape-outline" size="16" />{{ t('test.kinds') }}</div>
          <v-chip-group v-model="kindChips" multiple filter column color="primary" class="ind mb-3">
            <v-chip value="all" size="small">{{ t('test.kindMixed') }}</v-chip>
            <v-chip value="meaning" size="small" prepend-icon="mdi-translate">{{ t('test.kindMeaning') }}</v-chip>
            <v-chip value="listen" size="small" prepend-icon="mdi-volume-high">{{ t('test.kindListen') }}</v-chip>
            <v-chip value="reading" size="small" prepend-icon="mdi-syllabary-hiragana">{{ t('test.kindReading') }}</v-chip>
          </v-chip-group>

          <div class="actions">
            <v-btn color="primary" prepend-icon="mdi-dice-multiple-outline" :loading="phase === 'loading'" :disabled="!canBuild" @click="build">{{ t('maker.build') }}</v-btn>
            <v-btn variant="tonal" color="info" prepend-icon="mdi-close" @click="open = false">{{ t('test.close') }}</v-btn>
          </div>
        </template>

        <template v-else>
          <div class="text-body-2 mb-2 font-weight-medium">{{ title.trim() }}</div>
          <div v-if="questions.length === 0" class="text-body-2 text-medium-emphasis my-3">{{ t('maker.none') }}</div>
          <div v-else class="text-caption text-medium-emphasis mb-1">{{ t('maker.preview', { n: questions.length, m: matching }) }}</div>
          <div class="qlist">
            <div v-for="q in questions" :key="q.n" class="qrow">
              <v-icon :icon="kindIcon(q.kind)" size="16" class="qicon" />
              <span class="jp qword">{{ q.card.headword }}</span>
              <span class="qmean text-caption text-medium-emphasis">{{ q.card.meaning.split('\n')[0] }}</span>
            </div>
          </div>
          <div class="actions">
            <v-btn color="primary" prepend-icon="mdi-publish" :loading="saving" :disabled="questions.length === 0" @click="publish">{{ t('maker.publish') }}</v-btn>
            <v-btn variant="tonal" prepend-icon="mdi-dice-multiple-outline" :disabled="saving" @click="draw">{{ t('maker.rebuild') }}</v-btn>
            <v-btn variant="tonal" color="info" prepend-icon="mdi-arrow-left" :disabled="saving" @click="phase = 'form'">{{ t('maker.back') }}</v-btn>
          </div>
        </template>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
/* the same look as the sheet that starts a test (TestSheet) */
.msheet {
  background: var(--paper);
  max-height: 92dvh;
}
.mbody {
  overflow-y: auto;
}
.mgrip {
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--paper-edge);
  margin: 8px auto 4px;
}
.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--sc);
}
.s-deck { --sc: #3e9f2f; } /* green */
.s-tags { --sc: #ef8a17; } /* orange, like the tag button of a deck */
.s-count { --sc: #1e88e5; } /* blue */
.s-kind { --sc: #8e4ec6; } /* purple */
.ind {
  margin-left: 22px; /* under the label's text, past its icon (16px + 6px gap) */
}
.tagbox {
  max-height: 140px;
  overflow-y: auto;
}
@media (max-width: 600px) {
  .mtitle {
    justify-content: center;
  }
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
}
.qlist {
  max-height: 46dvh;
  overflow-y: auto;
  margin-bottom: 8px;
}
.qrow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--paper-edge);
}
.qicon {
  flex: 0 0 auto;
  align-self: center;
  color: var(--forest);
}
.qword {
  font-weight: 700;
  color: var(--headword);
  flex: 0 0 auto;
}
.qmean {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
