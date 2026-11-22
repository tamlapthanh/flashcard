import { describe, expect, it } from 'vitest';
import { compoundsOf, mnemonicOf } from '../src/lib/kanjiNotes';

describe('kanjiNotes', () => {
  it('compounds: none when missing or null, drops entries without a word', () => {
    expect(compoundsOf({})).toEqual([]);
    expect(compoundsOf({ Compounds: null })).toEqual([]);
    const c = { Word: '七日', Reading: 'なのか', Vi: 'bảy ngày' };
    expect(compoundsOf({ Compounds: [c, { Word: ' ', Reading: null, Vi: null }] })).toEqual([c]);
  });
  it('mnemonic: Ja, En, Vi order, skipping missing languages', () => {
    expect(mnemonicOf({})).toEqual([]);
    expect(mnemonicOf({ Mnemonic: { En: null, Ja: null, Vi: null } })).toEqual([]);
    expect(mnemonicOf({ Mnemonic: { En: 'e', Ja: 'j', Vi: 'v' } }).map((x) => x.lang)).toEqual(['Ja', 'En', 'Vi']);
    expect(mnemonicOf({ Mnemonic: { En: 'e', Ja: null, Vi: null } })).toEqual([{ lang: 'En', text: 'e' }]);
  });
});
