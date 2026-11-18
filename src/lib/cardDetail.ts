/*
 * The heavy part of each card (furigana, pitch, kanji, note, English) is not sent with the deck: it is fetched for the card
 * being studied and a few cards ahead, then kept here. Reactive, so the card fills in by itself when its detail arrives.
 */
import { reactive } from 'vue';
import { api } from '../api';
import type { CardDetail } from '../types';

const cache = reactive(new Map<string, CardDetail>());
const loading = new Set<string>();
const BATCH = 10;

export const detailOf = (id: string): CardDetail | undefined => cache.get(id);

/* A new run starts clean, so words edited in LCT since the last run show their new data. */
export function clearDetails(): void {
  cache.clear();
  loading.clear();
}

/* Fetch what is not cached yet (silently: a failure just means the card shows its light form, and is retried next time). */
export async function ensureDetails(ids: string[]): Promise<void> {
  const need = [...new Set(ids)].filter((id) => !cache.has(id) && !loading.has(id));
  for (let i = 0; i < need.length; i += BATCH) {
    const batch = need.slice(i, i + BATCH);
    batch.forEach((id) => loading.add(id));
    try {
      for (const d of await api.cardDetails(batch)) cache.set(d.id, d);
    } catch {
      /* offline or server asleep */
    } finally {
      batch.forEach((id) => loading.delete(id));
    }
  }
}
