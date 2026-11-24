import { describe, expect, it } from 'vitest';
import { ALL_KINDS, buildQuiz, canListen, canRead, editDistance, kindsOf, meaningLabel, modeOf, optionLabel, pickDistractors, restoreQuestion, similarity } from '../src/lib/quiz';
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

/* a repeatable "random": the same sequence every run */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const deck = (n: number): LightCard[] =>
  Array.from({ length: n }, (_, i) => card({ headword: `語${i}`, reading: `ご${'あ'.repeat(i % 4)}${i}`, meaning: `nghĩa số ${i}`, pos: i % 2 ? 'danh từ' : 'động từ', tags: [`bài${i % 3}`] }));

describe('editDistance', () => {
  it('counts the changes between two readings', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('がくせい', 'がくせい')).toBe(0);
    expect(editDistance('がくせい', 'がっこう')).toBe(3);
    expect(editDistance('ねこ', '')).toBe(2);
  });
});

describe('similarity', () => {
  it('rates a word of the same kind, tag and kanji above an unrelated one', () => {
    const a = card({ headword: '学生', reading: 'がくせい', pos: 'danh từ', tags: ['bài1'], meaning: 'học sinh' });
    const near = card({ headword: '学校', reading: 'がっこう', pos: 'danh từ', tags: ['bài1'], meaning: 'trường học' });
    const far = card({ headword: '走る', reading: 'はしる', pos: 'động từ', tags: ['bài9'], meaning: 'chạy' });
    for (const kind of ['meaning', 'listen'] as const) expect(similarity(a, near, kind)).toBeGreaterThan(similarity(a, far, kind));
  });
});

describe('pickDistractors', () => {
  it('never offers the word itself, a word with the same reading, or a meaning that says the same', () => {
    const a = card({ headword: '橋', reading: 'はし', meaning: 'cái cầu' });
    const same = card({ headword: '箸', reading: 'はし', meaning: 'đôi đũa' }); // homophone
    const samePart = card({ headword: '鉄橋', reading: 'てっきょう', meaning: 'cái cầu sắt' }); // contains "cái cầu"
    const others = deck(8);
    const listen = pickDistractors(a, [a, same, samePart, ...others], 'listen', seeded());
    expect(listen.map((c) => c.id)).not.toContain(a.id);
    expect(listen.map((c) => c.id)).not.toContain(same.id);
    const meaning = pickDistractors(a, [a, same, samePart, ...others], 'meaning', seeded());
    expect(meaning.map((c) => c.id)).not.toContain(samePart.id);
    expect(meaning).toHaveLength(3);
  });

  it('gives different wrong answers on different runs, all from the near ones', () => {
    const a = card({ headword: '学生', reading: 'がくせい', pos: 'danh từ', meaning: 'học sinh' });
    const pool = [a, ...deck(40)];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) for (const c of pickDistractors(a, pool, 'meaning', seeded(seed))) seen.add(c.id);
    expect(seen.size).toBeGreaterThan(3);
  });

  it('never uses two wrong answers that mean the same', () => {
    const a = card({ headword: 'a', meaning: 'một' });
    const twins = [card({ headword: 'b', meaning: 'hai' }), card({ headword: 'c', meaning: 'hai' }), card({ headword: 'd', meaning: 'ba' }), card({ headword: 'e', meaning: 'bốn' })];
    const got = pickDistractors(a, [a, ...twins], 'meaning', seeded()).map(meaningLabel);
    expect(new Set(got).size).toBe(got.length);
  });
});

describe('buildQuiz', () => {
  it('builds the asked number of questions, each with one right answer among four, shared between the three kinds', () => {
    const cards = deck(30);
    const quiz = buildQuiz(cards, cards, { count: 10, rng: seeded() });
    expect(quiz).toHaveLength(10);
    for (const q of quiz) {
      expect(q.options).toHaveLength(4);
      expect(q.options[q.answerIndex]!.id).toBe(q.card.id);
      expect(new Set(q.options.map((o) => o.id)).size).toBe(4);
      expect(q.options.map((o) => o.label)).toContain(optionLabel(q.card, q.kind));
    }
    const count = (kind: string): number => quiz.filter((q) => q.kind === kind).length;
    for (const kind of ['meaning', 'listen', 'reading']) expect(count(kind)).toBeGreaterThanOrEqual(3); // 10 questions over 3 kinds: 3 or 4 of each
    expect(count('meaning') + count('listen') + count('reading')).toBe(10);
    expect(new Set(quiz.map((q) => q.card.id)).size).toBe(10); // a word is asked once
  });

  it('asks only the kind chosen; listening leaves out single kanji', () => {
    const cards = deck(20);
    expect(buildQuiz(cards, cards, { count: 10, mode: 'meaning', rng: seeded() }).every((q) => q.kind === 'meaning')).toBe(true);
    const listen = buildQuiz(cards, cards, { count: 10, mode: 'listen', rng: seeded() });
    expect(listen).toHaveLength(10);
    expect(listen.every((q) => q.kind === 'listen')).toBe(true);
    const kanji = Array.from({ length: 8 }, (_, i) => card({ headword: String.fromCodePoint(0x4e00 + i), meaning: `chữ ${i}` }));
    expect(buildQuiz(kanji, kanji, { count: 8, mode: 'listen', rng: seeded() })).toEqual([]);
  });

  it('asks any chosen set of kinds, sharing the questions between them', () => {
    const cards = deck(30);
    const two = buildQuiz(cards, cards, { count: 12, kinds: ['listen', 'reading'], rng: seeded() });
    expect(two).toHaveLength(12);
    expect(two.every((q) => q.kind === 'listen' || q.kind === 'reading')).toBe(true);
    expect(two.filter((q) => q.kind === 'listen').length).toBeGreaterThanOrEqual(5); // 12 over 2 kinds: about 6 each
    expect(two.filter((q) => q.kind === 'reading').length).toBeGreaterThanOrEqual(5);
    expect(buildQuiz(cards, cards, { count: 10, kinds: ['reading'], rng: seeded() }).every((q) => q.kind === 'reading')).toBe(true);
    // `kinds` wins over `mode`; no kind at all asks nothing
    expect(buildQuiz(cards, cards, { count: 10, mode: 'meaning', kinds: ['listen'], rng: seeded() }).every((q) => q.kind === 'listen')).toBe(true);
    expect(buildQuiz(cards, cards, { count: 10, kinds: [], rng: seeded() })).toEqual([]);
    // a word that fits none of the chosen kinds is left out: single kanji cannot be heard
    const kanji = Array.from({ length: 8 }, (_, i) => card({ headword: String.fromCodePoint(0x4e00 + i), reading: `On: x${i}`, meaning: `chữ ${i}` }));
    expect(buildQuiz(kanji, kanji, { count: 8, kinds: ['listen'], rng: seeded() })).toEqual([]);
    expect(kindsOf('mixed')).toEqual(['meaning', 'listen', 'reading']);
    expect(kindsOf('listen')).toEqual(['listen']);
    expect(modeOf(['listen'])).toBe('listen');
    expect(modeOf(['listen', 'reading'])).toBe('mixed');
    expect(modeOf(ALL_KINDS)).toBe('mixed');
  });

  it('asks every word at most once and never more than there are words', () => {
    const cards = deck(6);
    expect(buildQuiz(cards, cards, { count: 50, rng: seeded() })).toHaveLength(6);
  });

  it('never asks a single kanji by ear, but by meaning or by reading', () => {
    const kanji = Array.from({ length: 8 }, (_, i) => card({ headword: String.fromCodePoint(0x4e00 + i), reading: `On: x${i}`, meaning: `chữ ${i}` }));
    expect(canListen(kanji[0]!)).toBe(false);
    const quiz = buildQuiz(kanji, kanji, { count: 8, rng: seeded() });
    expect(quiz.length).toBeGreaterThan(0);
    expect(quiz.every((q) => q.kind === 'meaning' || q.kind === 'reading')).toBe(true);
  });

  it('asks the reading: the options are the readings of similar words, the word itself is not read out', () => {
    const cards = deck(20);
    const reading = buildQuiz(cards, cards, { count: 10, mode: 'reading', rng: seeded() });
    expect(reading).toHaveLength(10);
    for (const q of reading) {
      expect(q.kind).toBe('reading');
      expect(q.options[q.answerIndex]!.label).toBe(q.card.reading);
      expect(new Set(q.options.map((o) => o.label)).size).toBe(4); // no two options read the same
    }
    // a word written in kana only (its reading is the word itself) has nothing to read: it is left out
    const kana = Array.from({ length: 6 }, (_, i) => card({ headword: `かな${i}`, reading: `かな${i}`, meaning: `kana ${i}` }));
    expect(canRead(kana[0]!)).toBe(false);
    expect(buildQuiz(kana, kana, { count: 6, mode: 'reading', rng: seeded() })).toEqual([]);
  });

  it('skips a word that has too few wrong answers, and gives nothing for a tiny deck', () => {
    const tiny = deck(2);
    expect(buildQuiz(tiny, tiny, { count: 10, rng: seeded() })).toEqual([]);
    const three = deck(3);
    expect(buildQuiz(three, three, { count: 10, rng: seeded() }).every((q) => q.options.length === 3)).toBe(true);
  });

  it('draws the wrong answers from the pool, not only from the words asked', () => {
    const pool = deck(20);
    const asked = pool.slice(0, 1);
    const [q] = buildQuiz(asked, pool, { count: 1, rng: seeded() });
    expect(q!.options).toHaveLength(4);
  });
});

describe('restoreQuestion', () => {
  it('brings a saved question back exactly as it was made, options in the same order', () => {
    const cards = deck(12);
    const [q] = buildQuiz(cards, cards, { count: 1, rng: seeded() });
    const byId = new Map(cards.map((c) => [c.id, c]));
    const again = restoreQuestion({ n: q!.n, kind: q!.kind, wordId: q!.card.id, options: q!.options.map((o) => o.id) }, byId);
    expect(again).toEqual(q);
  });

  it('gives nothing when a word of the question is no longer in the deck', () => {
    const cards = deck(6);
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(restoreQuestion({ n: 0, kind: 'meaning', wordId: cards[0]!.id, options: [cards[0]!.id, cards[1]!.id, 'gone'] }, byId)).toBeNull();
    expect(restoreQuestion({ n: 0, kind: 'meaning', wordId: 'gone', options: [cards[0]!.id, cards[1]!.id, cards[2]!.id] }, byId)).toBeNull();
  });
});
