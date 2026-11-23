/*
 * Where the word being read came from, for the read-aloud button (study and test screens):
 *   badge - the source while the word is spoken: the button takes the colour of `src-<source>`; its text is the tooltip;
 *   note  - the same text, shown for a moment each time a word starts and then gone.
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { t } from '../i18n';
import { voiceSource, type VoiceOrigin, type VoiceSource } from './speech';

const NOTE_MS = 2500;

export function useVoiceBadge(speaking: Ref<boolean>) {
  const badge = ref<{ source: VoiceSource; origin?: VoiceOrigin } | null>(null);
  const note = ref('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const text = computed(() => {
    const b = badge.value;
    return b ? t(`voice.${b.source}`) + (b.origin ? ` · ${t(`voice.${b.origin}`)}` : '') : ''; // "Browser cache · Saved file": it was fetched ahead from a saved file
  });

  watch(voiceSource, (heard) => {
    if (!heard) return;
    badge.value = { source: heard.source, origin: heard.origin };
    note.value = text.value;
    clearTimeout(timer);
    timer = setTimeout(() => (note.value = ''), NOTE_MS);
  });
  watch(speaking, (on) => !on && (badge.value = null)); // the word is finished: the button turns back to its usual colour
  onBeforeUnmount(() => clearTimeout(timer));

  return { badge, text, note };
}
