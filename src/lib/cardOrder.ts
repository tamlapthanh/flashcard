/*
 * The order of the word list, the same as LCT's dictionary manager: ORDER BY lang, headword, reading (SQLite's plain comparison).
 * SQLite compares UTF-8 bytes, which is code point order, so the kanji of a deck of radicals come out in Kangxi order.
 * (JS `<` compares UTF-16 units, which would differ for rare kanji.) The server shuffles the cards it sends, so this order is rebuilt here.
 */
import type { LightCard } from '../types';

function byCodePoint(a: string | null, b: string | null): number {
  const x = [...(a ?? '')];
  const y = [...(b ?? '')];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
}

/* A new array in word list order; the given one is not changed. */
export function listOrder<T extends Pick<LightCard, 'lang' | 'headword' | 'reading'>>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => byCodePoint(a.lang, b.lang) || byCodePoint(a.headword, b.headword) || byCodePoint(a.reading, b.reading));
}
