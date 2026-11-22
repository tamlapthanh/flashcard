import type { KanjiCompound, KanjiInfo } from '../types';

/* The compound words of a kanji worth showing: a word is required, the rest may be missing. */
export function compoundsOf(k: Pick<KanjiInfo, 'Compounds'>): KanjiCompound[] {
  return (k.Compounds ?? []).filter((c) => c && typeof c.Word === 'string' && c.Word.trim() !== '');
}

/* The mnemonic texts that exist, in the order Ja, En, Vi. */
export function mnemonicOf(k: Pick<KanjiInfo, 'Mnemonic'>): { lang: 'Ja' | 'En' | 'Vi'; text: string }[] {
  const m = k.Mnemonic;
  if (!m) return [];
  return (['Ja', 'En', 'Vi'] as const).flatMap((lang) => {
    const text = m[lang]?.trim();
    return text ? [{ lang, text }] : [];
  });
}
