import { describe, expect, it } from 'vitest';
import { CARD_TEXTS, cardTextVars, clampSize, cloneCardStyles, defaultCardStyles, loadCardStyles, sameCardStyles } from '../src/cardText';

describe('cardText', () => {
  it('defaults are the old sizes in px and no colour override', () => {
    const d = defaultCardStyles();
    expect(d.word).toEqual({ size: 57.6, color: '', italic: false });
    // the texts that were always italic stay italic until the user switches them
    expect(['english', 'detailEnglish', 'exampleVi'].every((k) => d[k]!.italic)).toBe(true);
    expect(Object.values(d).filter((x) => x.italic)).toHaveLength(3);
    expect(d.counter!.size).toBe(10.9);
    expect(Object.keys(d)).toHaveLength(CARD_TEXTS.length);
  });

  it('migrates an old fontScale into the front texts only', () => {
    const m = loadCardStyles(undefined, 1.5);
    expect(m.word!.size).toBe(86.4);
    expect(m.backReading!.size).toBe(16.8);
  });

  it('keeps valid saved values and drops bad ones', () => {
    const m = loadCardStyles({ word: { size: 40, color: '#112233' }, reading: { size: 'x', color: 'red' }, nope: { size: 1 } }, 2);
    expect(m.word).toEqual({ size: 40, color: '#112233', italic: false });
    expect(m.reading).toEqual({ size: 16.8, color: '', italic: false });
    expect(m.nope).toBeUndefined();
  });

  it('keeps a saved italic switch (either way) and ignores a non-boolean one', () => {
    const m = loadCardStyles({ word: { size: 40, italic: true }, english: { size: 15, italic: false }, reading: { size: 16, italic: 'yes' } }, 1);
    expect(m.word!.italic).toBe(true);
    expect(m.english!.italic).toBe(false);
    expect(m.reading!.italic).toBe(false);
  });

  it('clamps sizes and emits colour variables only when picked', () => {
    expect(clampSize(1)).toBe(8);
    expect(clampSize(500)).toBe(120);
    const d = defaultCardStyles();
    d.word!.color = '#ffffff';
    const v = cardTextVars(d);
    expect(v['--s-word']).toBe('57.6px');
    expect(v['--c-word']).toBe('#ffffff');
    expect(v['--c-reading']).toBeUndefined();
    expect(v['--i-word']).toBe('normal');
    expect(v['--i-english']).toBe('italic');
  });

  it('a draft is an independent copy; sameCardStyles sees size, colour and italic changes', () => {
    const saved = defaultCardStyles();
    const draft = cloneCardStyles(saved);
    expect(sameCardStyles(draft, saved)).toBe(true);
    draft.word!.size += 1;
    expect(saved.word!.size).toBe(57.6); // editing the draft leaves the saved styles alone
    expect(sameCardStyles(draft, saved)).toBe(false);
    const other = cloneCardStyles(saved);
    other.english!.italic = false;
    expect(sameCardStyles(other, saved)).toBe(false);
    other.english!.italic = true;
    other.reading!.color = '#112233';
    expect(sameCardStyles(other, saved)).toBe(false);
  });
});
