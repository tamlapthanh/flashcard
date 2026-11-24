import { describe, expect, it } from 'vitest';
import { drawPaper, pickKey, wordsWithPicks, wordsWithTags } from '../src/lib/paper';
import type { LightCard } from '../src/types';

let nextId = 1;
const card = (over: Partial<LightCard> = {}): LightCard => ({
  id: `w${nextId++}`,
  deckId: 'd',
  lang: 'ja',
  headword: 'x',
  reading: null,
  pos: null,
  meaning: 'm',
  hanviet: null,
  example: null,
  exampleVi: null,
  tags: [],
  progress: { status: 'new', correct: 0, wrong: 0, lastReviewed: null },
  furigana: null,
  pitchMorae: null,
  ...over
});

const pool = Array.from({ length: 12 }, (_, i) => card({ deckId: i < 6 ? 'a' : 'b', headword: `語${i}`, reading: `ご${i}`, meaning: `nghĩa ${i}`, tags: [`bài${i % 3}`] }));

describe('wordsWithTags', () => {
  it('keeps every word when no tag is chosen, else the words with one of the tags', () => {
    expect(wordsWithTags(pool, [])).toHaveLength(12);
    expect(wordsWithTags(pool, ['bài0']).map((c) => c.tags)).toEqual([['bài0'], ['bài0'], ['bài0'], ['bài0']]);
    expect(wordsWithTags(pool, ['bài0', 'bài1'])).toHaveLength(8);
    expect(wordsWithTags(pool, ['nope'])).toEqual([]);
  });
});

describe('drawPaper', () => {
  it('asks only about the words of the chosen tags, with the wrong answers drawn from the whole pool', () => {
    const questions = drawPaper(pool, ['bài1'], 10, 'meaning');
    expect(questions).toHaveLength(4); // only four words carry the tag
    for (const q of questions) {
      expect(q.card.tags).toContain('bài1');
      expect(q.options).toHaveLength(4);
      expect(q.options.some((o) => o.id === q.card.id)).toBe(true);
    }
    expect(questions.some((q) => q.options.some((o) => !pool.find((c) => c.id === o.id)!.tags.includes('bài1')))).toBe(true); // wrong answers come from beyond the tag
  });

  it('stops at the number asked for, and draws from several decks at once', () => {
    const questions = drawPaper(pool, [], 5, 'mixed');
    expect(questions).toHaveLength(5);
    expect(new Set(questions.map((q) => q.card.id)).size).toBe(5); // no word twice
    const all = drawPaper(pool, [], 500, 'meaning');
    expect(new Set(all.map((q) => q.card.deckId))).toEqual(new Set(['a', 'b']));
  });
});

describe('wordsWithPicks', () => {
  it('keeps every word with no pick, else only the words of the lessons picked in their own deck', () => {
    expect(wordsWithPicks(pool, [])).toHaveLength(12);
    const got = wordsWithPicks(pool, [pickKey('a', 'bài0')]);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((c) => c.deckId === 'a' && c.tags.includes('bài0'))).toBe(true); // bài0 of deck b is not picked
    expect(wordsWithPicks(pool, [pickKey('zzz', 'bài0')])).toEqual([]);
  });
});
