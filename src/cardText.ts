/*
 * Every piece of text on the study card: its default size (px) and colour (light / dark theme) are exactly what the card used before
 * the per-text settings existed. Settings store size and italic always, colour only when picked.
 * StudyView turns the settings into CSS variables --s-<key> / --c-<key>; the CSS falls back to the theme colour when no --c-<key> is set.
 */
import type { InjectionKey } from 'vue';

export interface CardTextDef {
  key: string;
  group: 'front' | 'back' | 'kanji' | 'test' | 'other';
  en: string;
  vi: string;
  size: number; // px (the old rem value x 16)
  light: string; // default colour, light theme (hex)
  dark: string; // default colour, dark theme (hex)
  italic?: boolean; // default style: italic (English meaning, Vietnamese example); the user can switch it per text
  frontScaled?: boolean; // the old "x" text-size slider scaled this text: used once to migrate an old fontScale
}

const TEXT_L = '#212121';
const TEXT_D = '#ffffff';
const HEAD_L = '#c42b1c';
const HEAD_D = '#ff8a80';
const RD_L = '#2b7bb9';
const RD_D = '#6cc3ee';
const HV_L = '#2e8b57';
const HV_D = '#6fe0a6';
const JP_L = '#1c2e1d';
const JP_D = '#eef8e4';
const LEAF_L = '#4e8f2f';
const LEAF_D = '#8fd35f';
const FOREST_L = '#1f4d24';
const FOREST_D = '#2e6b34';

export const CARD_TEXTS: CardTextDef[] = [
  { key: 'word', group: 'front', en: 'Main kanji', vi: 'Kanji chính', size: 57.6, light: HEAD_L, dark: HEAD_D, frontScaled: true },
  { key: 'wordRuby', group: 'front', en: 'Main kanji (with furigana)', vi: 'Kanji chính (khi có furigana)', size: 41.6, light: HEAD_L, dark: HEAD_D, frontScaled: true },
  { key: 'furigana', group: 'front', en: 'Furigana (above the kanji)', vi: 'Furigana (trên kanji)', size: 14.4, light: RD_L, dark: RD_D, frontScaled: true },
  { key: 'reading', group: 'front', en: 'Hiragana reading', vi: 'Hiragana', size: 16.8, light: RD_L, dark: RD_D, frontScaled: true },
  { key: 'hanviet', group: 'front', en: 'Sino-Vietnamese (Hán Việt)', vi: 'Hán Việt', size: 15.2, light: HV_L, dark: HV_D, frontScaled: true },
  { key: 'meaning', group: 'front', en: 'Vietnamese meaning', vi: 'Nghĩa tiếng Việt', size: 21.6, light: TEXT_L, dark: TEXT_D, frontScaled: true },
  { key: 'english', group: 'front', en: 'English meaning', vi: 'Nghĩa tiếng Anh', size: 15.2, light: TEXT_L, dark: TEXT_D, frontScaled: true, italic: true },
  { key: 'question', group: 'front', en: 'Question meaning (Vietnamese → Japanese mode)', vi: 'Nghĩa là câu hỏi (chế độ Việt → Nhật)', size: 28.8, light: TEXT_L, dark: TEXT_D, frontScaled: true },
  { key: 'answerWord', group: 'front', en: 'Answer kanji (Vietnamese → Japanese mode)', vi: 'Kanji đáp án (chế độ Việt → Nhật)', size: 35.2, light: HEAD_L, dark: HEAD_D, frontScaled: true },

  { key: 'backReading', group: 'back', en: 'Back: hiragana', vi: 'Mặt sau: hiragana', size: 16.8, light: RD_L, dark: RD_D },
  { key: 'backHanviet', group: 'back', en: 'Back: Sino-Vietnamese', vi: 'Mặt sau: Hán Việt', size: 15.2, light: HV_L, dark: HV_D },
  { key: 'backMeaning', group: 'back', en: 'Back: Vietnamese meaning', vi: 'Mặt sau: nghĩa tiếng Việt', size: 16, light: TEXT_L, dark: TEXT_D },
  { key: 'label', group: 'back', en: 'Section labels (KANJI, EXAMPLE…)', vi: 'Nhãn mục (KANJI, VÍ DỤ…)', size: 10.56, light: LEAF_L, dark: LEAF_D },
  { key: 'kanjiChar', group: 'back', en: 'Each kanji (in the list)', vi: 'Từng chữ kanji (trong danh sách)', size: 20.8, light: HEAD_L, dark: HEAD_D },
  { key: 'kanjiSound', group: 'back', en: 'Each kanji: Sino-Vietnamese', vi: 'Từng kanji: Hán Việt', size: 14.72, light: HV_L, dark: HV_D },
  { key: 'kanjiMeaning', group: 'back', en: 'Each kanji: meaning', vi: 'Từng kanji: nghĩa', size: 13.6, light: TEXT_L, dark: TEXT_D },
  { key: 'detailEnglish', group: 'back', en: 'Back: English meaning', vi: 'Mặt sau: nghĩa tiếng Anh', size: 14.72, light: TEXT_L, dark: TEXT_D, italic: true },
  { key: 'example', group: 'back', en: 'Japanese example', vi: 'Ví dụ tiếng Nhật', size: 16.8, light: JP_L, dark: JP_D },
  { key: 'exampleVi', group: 'back', en: 'Vietnamese example', vi: 'Ví dụ tiếng Việt', size: 14.08, light: TEXT_L, dark: TEXT_D, italic: true },
  { key: 'pos', group: 'back', en: 'Part of speech', vi: 'Loại từ', size: 14.72, light: TEXT_L, dark: TEXT_D },
  { key: 'pitchLabel', group: 'back', en: 'Pitch accent text', vi: 'Chữ ghi giọng (pitch)', size: 14.72, light: TEXT_L, dark: TEXT_D },
  { key: 'notes', group: 'back', en: 'Notes', vi: 'Ghi chú', size: 14.72, light: TEXT_L, dark: TEXT_D },
  { key: 'related', group: 'back', en: 'Related words (link)', vi: 'Từ liên quan (liên kết)', size: 14.72, light: FOREST_L, dark: FOREST_D },

  { key: 'kGlyph', group: 'kanji', en: 'Kanji sheet: the kanji', vi: 'Bảng Kanji: chữ kanji', size: 41.6, light: HEAD_L, dark: HEAD_D },
  { key: 'kHanviet', group: 'kanji', en: 'Kanji sheet: Sino-Vietnamese', vi: 'Bảng Kanji: Hán Việt', size: 14, light: HV_L, dark: HV_D },
  { key: 'kMeaning', group: 'kanji', en: 'Kanji sheet: meaning', vi: 'Bảng Kanji: nghĩa', size: 14, light: TEXT_L, dark: TEXT_D },
  { key: 'kMeta', group: 'kanji', en: 'Kanji sheet: strokes and JLPT', vi: 'Bảng Kanji: số nét và JLPT', size: 12, light: TEXT_L, dark: TEXT_D },
  { key: 'kFieldLabel', group: 'kanji', en: 'Kanji sheet: On / Kun / Radical labels', vi: 'Bảng Kanji: nhãn On / Kun / Bộ', size: 10.56, light: LEAF_L, dark: LEAF_D },
  { key: 'kReading', group: 'kanji', en: 'Kanji sheet: On and Kun readings', vi: 'Bảng Kanji: cách đọc On và Kun', size: 14, light: RD_L, dark: RD_D },
  { key: 'kRadical', group: 'kanji', en: 'Kanji sheet: radical', vi: 'Bảng Kanji: bộ thủ', size: 16, light: JP_L, dark: JP_D },
  { key: 'kSection', group: 'kanji', en: 'Kanji sheet: section titles (Memory hint, Compounds)', vi: 'Bảng Kanji: tiêu đề mục (Gợi ý cách nhớ, Từ ghép)', size: 12.8, light: LEAF_L, dark: LEAF_D },
  { key: 'kWhole', group: 'kanji', en: 'Memory hint: the whole kanji', vi: 'Gợi ý cách nhớ: chữ kanji gốc', size: 48, light: HEAD_L, dark: HEAD_D },
  { key: 'kPart', group: 'kanji', en: 'Memory hint: each part', vi: 'Gợi ý cách nhớ: từng thành phần', size: 20.8, light: TEXT_L, dark: TEXT_D },
  { key: 'kPartHv', group: 'kanji', en: 'Memory hint: part Sino-Vietnamese', vi: 'Gợi ý cách nhớ: Hán Việt của thành phần', size: 13.12, light: HV_L, dark: HV_D },
  { key: 'kPartMeaning', group: 'kanji', en: 'Memory hint: part meaning', vi: 'Gợi ý cách nhớ: nghĩa của thành phần', size: 13.12, light: TEXT_L, dark: TEXT_D },
  { key: 'kResult', group: 'kanji', en: 'Memory hint: result after the arrow', vi: 'Gợi ý cách nhớ: kết quả sau mũi tên', size: 16, light: TEXT_L, dark: TEXT_D },
  { key: 'kMnemonic', group: 'kanji', en: 'Memory hint: mnemonic lines', vi: 'Gợi ý cách nhớ: câu mẹo', size: 14, light: TEXT_L, dark: TEXT_D },
  { key: 'kCompWord', group: 'kanji', en: 'Compounds: the word', vi: 'Từ ghép: từ', size: 14, light: HEAD_L, dark: HEAD_D },
  { key: 'kCompText', group: 'kanji', en: 'Compounds: reading and meaning', vi: 'Từ ghép: cách đọc và nghĩa', size: 14, light: TEXT_L, dark: TEXT_D },

  { key: 'tAsk', group: 'test', en: 'Test: the instruction line', vi: 'Test: dòng hướng dẫn', size: 12, light: '#757575', dark: '#b0b0b0' },
  { key: 'tWord', group: 'test', en: 'Test: the word asked', vi: 'Test: từ được hỏi', size: 35.2, light: HEAD_L, dark: HEAD_D },
  { key: 'tReading', group: 'test', en: 'Test: reading under the word', vi: 'Test: cách đọc dưới từ', size: 16.8, light: FOREST_L, dark: FOREST_D },
  { key: 'tAnswer', group: 'test', en: 'Test: answers (meanings)', vi: 'Test: đáp án (nghĩa)', size: 17.6, light: TEXT_L, dark: TEXT_D },
  { key: 'tAnswerJp', group: 'test', en: 'Test: answers (Japanese words)', vi: 'Test: đáp án (từ tiếng Nhật)', size: 23.2, light: TEXT_L, dark: TEXT_D },
  { key: 'tFbWord', group: 'test', en: 'Test: the word, after answering', vi: 'Test: từ, sau khi trả lời', size: 24, light: HEAD_L, dark: HEAD_D },
  { key: 'tFbReading', group: 'test', en: 'Test: its reading, after answering', vi: 'Test: cách đọc, sau khi trả lời', size: 16, light: FOREST_L, dark: FOREST_D },
  { key: 'tFbMeaning', group: 'test', en: 'Test: its meaning, after answering', vi: 'Test: nghĩa, sau khi trả lời', size: 16, light: TEXT_L, dark: TEXT_D },

  { key: 'counter', group: 'other', en: 'Counter (1 / N)', vi: 'Bộ đếm (1 / N)', size: 10.88, light: LEAF_L, dark: LEAF_D }
];

export interface CardTextStyle {
  size: number; // px
  color: string; // '' = the default colour of the theme
  italic: boolean;
}

export type CardTextStyles = Record<string, CardTextStyle>;

/* The Card Style editor works on a draft copy of the styles (provided to every EdText); only Save writes it back to the settings. */
export const CARD_DRAFT: InjectionKey<CardTextStyles> = Symbol('cardDraft');

export function cloneCardStyles(styles: CardTextStyles): CardTextStyles {
  const out: CardTextStyles = {};
  for (const d of CARD_TEXTS) {
    const v = styles[d.key];
    out[d.key] = { size: v?.size ?? d.size, color: v?.color ?? '', italic: v?.italic ?? !!d.italic };
  }
  return out;
}

export function sameCardStyles(a: CardTextStyles, b: CardTextStyles): boolean {
  return CARD_TEXTS.every((d) => {
    const x = a[d.key];
    const y = b[d.key];
    return !!x && !!y && x.size === y.size && x.color === y.color && x.italic === y.italic;
  });
}

export const MIN_SIZE = 8;
export const MAX_SIZE = 120;

export function clampSize(value: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value * 10) / 10));
}

export function defaultCardStyles(scale = 1): CardTextStyles {
  const styles: CardTextStyles = {};
  for (const d of CARD_TEXTS) styles[d.key] = { size: clampSize(d.frontScaled ? d.size * scale : d.size), color: '', italic: !!d.italic };
  return styles;
}

/* Merge what was saved (any shape) over the defaults; unknown keys are dropped, bad values fall back. */
export function loadCardStyles(raw: unknown, oldScale: number | undefined): CardTextStyles {
  const base = defaultCardStyles(raw ? 1 : (oldScale ?? 1));
  if (!raw || typeof raw !== 'object') return base;
  for (const d of CARD_TEXTS) {
    const v = (raw as Record<string, Partial<CardTextStyle> | undefined>)[d.key];
    if (!v) continue;
    if (typeof v.size === 'number' && Number.isFinite(v.size)) base[d.key]!.size = clampSize(v.size);
    if (typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color)) base[d.key]!.color = v.color;
    if (typeof v.italic === 'boolean') base[d.key]!.italic = v.italic;
  }
  return base;
}

/* CSS variables for the card: --s-<key> (size) and --i-<key> (italic / normal) always, --c-<key> only when the user picked a colour. */
export function cardTextVars(styles: CardTextStyles): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const d of CARD_TEXTS) {
    const s = styles[d.key] ?? { size: d.size, color: '', italic: !!d.italic };
    vars[`--s-${d.key}`] = `${s.size}px`;
    vars[`--i-${d.key}`] = s.italic ? 'italic' : 'normal';
    if (s.color) vars[`--c-${d.key}`] = s.color;
  }
  return vars;
}
