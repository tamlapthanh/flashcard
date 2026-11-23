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

/* The Memory hint (the parts, or the mnemonic) and the Compounds both exist: only then do they share a row. Not every kanji has compounds. */
export function hintBesideCompounds(k: Pick<KanjiInfo, 'Compounds' | 'Mnemonic' | 'Parts' | 'Components' | 'Literal'>): boolean {
  const parts = k.Parts?.length ?? k.Components.filter((c) => c !== k.Literal).length;
  return compoundsOf(k).length > 0 && (parts > 0 || mnemonicOf(k).length > 0);
}
