/*
 * Helpers for the tests an admin makes (papers): the cards of one or several decks, the words a choice of tags picks out, and the questions drawn from them.
 */
import { api } from '../api';
import type { LightCard, StudyStatus } from '../types';
import { buildQuiz, kindsOf, type QuizKind, type QuizMode, type QuizQuestion } from './quiz';

const ALL_STATUSES: StudyStatus[] = ['new', 'learning', 'learned', 'skipped'];

/** The deck id of a test or paper that draws on several decks. */
export const ANY_DECK = '*';

/** Every card of the given decks (ANY_DECK: of every deck). One deck after the other: a deck is one call and the server allows about 240 a minute. */
export async function loadPool(deckIds: string[]): Promise<LightCard[]> {
  const ids = deckIds.includes(ANY_DECK) ? (await api.decks()).map((d) => d.id) : deckIds;
  const pool: LightCard[] = [];
  for (const deck of ids) pool.push(...(await api.cards({ deck, tags: [], status: ALL_STATUSES })).cards);
  return pool;
}

/** The words a choice of tags picks out (none chosen: all of them). */
export const wordsWithTags = (pool: LightCard[], tags: string[]): LightCard[] => (tags.length === 0 ? pool : pool.filter((c) => c.tags.some((tag) => tags.includes(tag))));

/** The questions of a new paper: `count` of them from the words with those tags, the wrong answers drawn from the whole pool. */
export function drawPaper(pool: LightCard[], tags: string[], count: number, kinds: QuizMode | QuizKind[], rng?: () => number): QuizQuestion[] {
  return buildQuiz(wordsWithTags(pool, tags), pool, { count, kinds: typeof kinds === 'string' ? kindsOf(kinds) : kinds, rng });
}
