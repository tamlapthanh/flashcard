/*
 * Starting an attempt at a paper (a test an admin made) and the one-line description of where its words come from. Kept apart from paper.ts
 * because it reaches the app store, which the pure helpers there (and their tests) do not need.
 */
import { api } from '../api';
import { t } from '../i18n';
import { pendingTest } from '../store';
import type { PaperInfo } from '../types';
import { ANY_DECK } from './paper';

export const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** A new attempt is made on the server (the paper is copied into a test of this user); the test screen then continues it from its first question. */
export async function startPaperTest(p: Pick<PaperInfo, 'paperId' | 'title' | 'deckId' | 'total' | 'mode'>): Promise<void> {
  const { sessionId } = await api.startPaper(p.paperId, newId());
  pendingTest.value = { deckId: p.deckId, deckName: p.title, tags: [], statuses: [], count: p.total, kinds: p.mode, resumeId: sessionId };
}

/** "Deck, Deck · tag, tag": where the words of a paper come from. */
export function paperSourceText(p: Pick<PaperInfo, 'deckId' | 'sources'>): string {
  if (p.deckId === ANY_DECK && p.sources.length > 3) return t('papers.allDecks');
  const names = p.sources.map((s) => s.deckName).filter(Boolean);
  const tags = [...new Set(p.sources.flatMap((s) => s.tags))];
  return names.join(', ') + (tags.length ? ` · ${tags.join(', ')}` : '');
}
