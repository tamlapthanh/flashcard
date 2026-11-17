/* Splits a card note into lines; "Liên quan: 香り(かおり)=nghĩa" lines become tappable related words (port of LCT's FlashcardNoteParser). */
export interface RelatedWord {
  headword: string;
  reading: string | null;
  meaning: string;
}

export interface NoteLine {
  text: string;
  related: RelatedWord | null;
}

const PREFIX = 'Liên quan:';
const RELATED = /^\s*([^()（）=＝\s][^()（）=＝]*?)\s*(?:[(（]([^)）]*)[)）])?\s*[=＝]\s*(\S.*)$/;

export function parseNote(note: string | null | undefined): NoteLine[] {
  if (!note || !note.trim()) return [];
  const lines: NoteLine[] = [];
  for (const raw of note.replace(/\r\n?/g, '\n').split('\n')) {
    const text = raw.trim();
    if (!text) continue;
    lines.push({ text, related: tryRelated(text) });
  }
  return lines;
}

function tryRelated(line: string): RelatedWord | null {
  if (!line.startsWith(PREFIX)) return null;
  const m = RELATED.exec(line.slice(PREFIX.length));
  if (!m) return null;
  const reading = (m[2] ?? '').trim();
  return { headword: (m[1] ?? '').trim(), reading: reading || null, meaning: (m[3] ?? '').trim() };
}
