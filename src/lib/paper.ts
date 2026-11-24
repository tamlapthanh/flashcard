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

/** A lesson picked in one deck (the same tag name can exist in several decks, so a pick says which deck it is of). */
export const pickKey = (deckId: string, tag: string): string => `${deckId}\t${tag}`;

/** The words the lessons picked (see pickKey) point at; no pick at all: every word of the pool. A deck with no pick adds nothing once any lesson is picked. */
export const wordsWithPicks = (pool: LightCard[], picks: string[]): LightCard[] =>
  picks.length === 0 ? pool : pool.filter((c) => c.tags.some((tag) => picks.includes(pickKey(c.deckId, tag))));

/** `count` questions about `words`, the wrong answers drawn from the whole pool. */
export function drawFrom(words: LightCard[], pool: LightCard[], count: number, kinds: QuizMode | QuizKind[], rng?: () => number): QuizQuestion[] {
  return buildQuiz(words, pool, { count, kinds: typeof kinds === 'string' ? kindsOf(kinds) : kinds, rng });
}

/** The questions of a new paper: `count` of them from the words with those tags, the wrong answers drawn from the whole pool. */
export function drawPaper(pool: LightCard[], tags: string[], count: number, kinds: QuizMode | QuizKind[], rng?: () => number): QuizQuestion[] {
  return drawFrom(wordsWithTags(pool, tags), pool, count, kinds, rng);
}

/** One other question of the given kind for a paper being made: a word with those tags that is not asked yet (`taken` are the ids already in the paper), or null when none is left. */
export function drawOther(words: LightCard[], pool: LightCard[], taken: Set<string>, kind: QuizKind, rng?: () => number): QuizQuestion | null {
  const spare = words.filter((c) => !taken.has(c.id));
  return buildQuiz(spare, pool, { count: 1, kinds: [kind], rng })[0] ?? null;
}
