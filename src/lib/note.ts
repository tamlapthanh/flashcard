/* Splits a card note into lines; "Liên quan: 香り(かおり)=nghĩa" lines become tappable related words (port of LCT's FlashcardNoteParser). */
export interface RelatedWord {
  headword: string;
  reading: string | null;
  meaning: string;
}

export interface NoteLine {
  text: string;
  related: RelatedWord | null;
  /* A compound line of a kanji's note, "冬休み (ふゆやすみ) nghỉ đông": its word is tappable too (same popup as a related word). */
  compound: RelatedWord | null;
}

const PREFIX = 'Liên quan:';
/* word (reading) meaning: the word is only Japanese characters, so "Gợi nhớ: …" and other free text never match. */
const COMPOUND = /^([々぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]+)\s*[(（]([^)）]+)[)）]\s*(\S.*)$/;
const RELATED = /^\s*([^()（）=＝\s][^()（）=＝]*?)\s*(?:[(（]([^)）]*)[)）])?\s*[=＝]\s*(\S.*)$/;

export function parseNote(note: string | null | undefined): NoteLine[] {
  if (!note || !note.trim()) return [];
  const lines: NoteLine[] = [];
  for (const raw of note.replace(/\r\n?/g, '\n').split('\n')) {
    const text = raw.trim();
    if (!text) continue;
    const related = tryRelated(text);
    lines.push({ text, related, compound: related ? null : tryCompound(text) });
  }
  return lines;
}

function tryCompound(line: string): RelatedWord | null {
  const m = COMPOUND.exec(line);
  if (!m) return null;
  return { headword: m[1] ?? '', reading: (m[2] ?? '').trim() || null, meaning: (m[3] ?? '').trim() };
}

function tryRelated(line: string): RelatedWord | null {
  if (!line.startsWith(PREFIX)) return null;
  const m = RELATED.exec(line.slice(PREFIX.length));
  if (!m) return null;
  const reading = (m[2] ?? '').trim();
  return { headword: (m[1] ?? '').trim(), reading: reading || null, meaning: (m[3] ?? '').trim() };
}
