import { describe, expect, it } from 'vitest';
import { parseNote } from '../src/lib/note';
import { strokeStart } from '../src/lib/strokes';
import { StudySession } from '../src/session';
import type { Card } from '../src/types';

const card = (id: string): Card => ({
  id,
  deckId: 'd',
  lang: 'ja',
  headword: id,
  reading: null,
  pos: null,
  meaning: 'm',
  hanviet: null,
  english: null,
  note: null,
  example: null,
  exampleVi: null,
  tags: [],
  furigana: null,
  pitchMorae: null,
  progress: { status: 'new', correct: 0, wrong: 0, lastReviewed: null },
  ruby: null,
  pitch: null,
  kanji: []
});

describe('StudySession', () => {
  it('Learned and Skip leave the deck; Again goes to the end', () => {
    const s = new StudySession([card('a'), card('b'), card('c')], { reverse: false, showReading: false });
    expect(s.current?.id).toBe('a');
    s.answer('again');
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    s.answer('learned');
    s.answer('skip');
    expect(s.queue.map((c) => c.id)).toEqual(['a']);
    expect([s.learned, s.again, s.skipped]).toEqual([1, 1, 1]);
    s.answer('learned');
    expect(s.finished).toBe(true);
    expect(s.answer('learned')).toBeUndefined();
  });

  it('flip toggles and resets after an answer', () => {
    const s = new StudySession([card('a'), card('b')], { reverse: false, showReading: false });
    s.flip();
    expect(s.flipped).toBe(true);
    s.answer('learned');
    expect(s.flipped).toBe(false);
  });

  it('next and previous browse the deck without grading', () => {
    const s = new StudySession([card('a'), card('b'), card('c')], { reverse: false, showReading: false });
    s.flip();
    expect(s.next()).toBe(true);
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(s.flipped).toBe(false);
    expect(s.previous()).toBe(true);
    expect(s.queue.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect([s.learned, s.again, s.skipped]).toEqual([0, 0, 0]);
  });

  it('browsing does nothing with a single card left', () => {
    const s = new StudySession([card('a')], { reverse: false, showReading: false });
    expect(s.next()).toBe(false);
    expect(s.previous()).toBe(false);
  });

  it('remembers which cards got Again (once each)', () => {
    const s = new StudySession([card('a'), card('b')], { reverse: false, showReading: false });
    s.answer('again');
    s.answer('learned');
    s.answer('again');
    expect(s.againCards.map((c) => c.id)).toEqual(['a']);
    expect(s.again).toBe(2);
  });

  it('position counts finished cards, capped at the total', () => {
    const s = new StudySession([card('a'), card('b')], { reverse: false, showReading: false });
    expect(s.position).toBe(1);
    s.answer('learned');
    expect(s.position).toBe(2);
    s.answer('learned');
    expect(s.position).toBe(2);
  });

  it('position follows Prev/Next and word-list jumps', () => {
    const s = new StudySession([card('a'), card('b'), card('c')], { reverse: false, showReading: false });
    s.next();
    expect(s.position).toBe(2);
    s.next();
    expect(s.position).toBe(3);
    s.next();
    expect(s.position).toBe(1);
    s.previous();
    expect(s.position).toBe(3);
    s.jumpTo('b');
    expect(s.position).toBe(2);
  });
});

describe('parseNote', () => {
  it('turns "Liên quan" lines into related words, keeps the rest as text', () => {
    const lines = parseNote('dùng cho mùi dễ chịu\nLiên quan: 香る(かおる)=tỏa hương\nLiên quan: 匂い=mùi\nLiên quan: hỏng');
    expect(lines[0]).toEqual({ text: 'dùng cho mùi dễ chịu', related: null, compound: null });
    expect(lines[1]?.related).toEqual({ headword: '香る', reading: 'かおる', meaning: 'tỏa hương' });
    expect(lines[2]?.related).toEqual({ headword: '匂い', reading: null, meaning: 'mùi' });
    expect(lines[3]?.related).toBeNull();
  });

  it('turns a compound line of a kanji note into a tappable word; free text and "Liên quan" lines are not compounds', () => {
    const lines = parseNote('冬休み (ふゆやすみ) nghỉ đông\nGợi nhớ: hai chấm (ở trên)\nLiên quan: 香る(かおる)=tỏa hương');
    expect(lines[0]?.compound).toEqual({ headword: '冬休み', reading: 'ふゆやすみ', meaning: 'nghỉ đông' });
    expect(lines[0]?.related).toBeNull();
    expect(lines[1]?.compound).toBeNull();
    expect(lines[2]?.compound).toBeNull();
    expect(lines[2]?.related).not.toBeNull();
  });

  it('handles empty notes and full-width brackets', () => {
    expect(parseNote(null)).toEqual([]);
    expect(parseNote('  \n ')).toEqual([]);
    expect(parseNote('Liên quan: 香り（かおり）＝hương thơm')[0]?.related).toEqual({ headword: '香り', reading: 'かおり', meaning: 'hương thơm' });
  });
});

describe('strokeStart', () => {
  it('reads the first point of a KanjiVG path', () => {
    expect(strokeStart('M31.5,37.5c3.5,0.5')).toEqual({ x: 31.5, y: 37.5 });
    expect(strokeStart('M 10 20 L 5 5')).toEqual({ x: 10, y: 20 });
    expect(strokeStart('bad')).toBeNull();
  });
});
