import { describe, expect, it } from 'vitest';
import { CARD_TEXTS, cardTextVars, clampSize, defaultCardStyles, loadCardStyles } from '../src/cardText';

describe('cardText', () => {
  it('defaults are the old sizes in px and no colour override', () => {
    const d = defaultCardStyles();
    expect(d.word).toEqual({ size: 57.6, color: '' });
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
    expect(m.word).toEqual({ size: 40, color: '#112233' });
    expect(m.reading).toEqual({ size: 16.8, color: '' });
    expect(m.nope).toBeUndefined();
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
  });
});
