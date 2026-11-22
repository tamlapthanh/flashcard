import type { KanjiCompound, KanjiInfo } from '../types';

/* The compound words of a kanji worth showing: a word is required, the rest may be missing. */
export function compoundsOf(k: Pick<KanjiInfo, 'Compounds'>): KanjiCompound[] {
  return (k.Compounds ?? []).filter((c) => c && typeof c.Word === 'string' && c.Word.trim() !== '');
}

/* The mnemonic texts that exist, in the order Vi, En, Ja. */
export function mnemonicOf(k: Pick<KanjiInfo, 'Mnemonic'>): { lang: 'Vi' | 'En' | 'Ja'; text: string }[] {
  const m = k.Mnemonic;
  if (!m) return [];
  return (['Vi', 'En', 'Ja'] as const).flatMap((lang) => {
    const text = m[lang]?.trim();
    return text ? [{ lang, text }] : [];
  });
}
