/* Shapes returned by flashmobile-server. */
export type StudyStatus = 'new' | 'learning' | 'learned' | 'skipped';
export type StudyResult = 'again' | 'learned' | 'skip';

export interface Progress {
  status: StudyStatus;
  correct: number;
  wrong: number;
  lastReviewed: string | null;
}

export interface PitchMora {
  text: string;
  high: boolean;
  dropAfter: boolean;
  stepAfter: boolean;
}

export interface PitchView {
  morae: PitchMora[];
  particleHigh: boolean;
  label: string;
  note: string | null;
}

export interface RubyCell {
  text: string;
  ruby: string | null;
  morae: PitchMora[] | null;
}

export interface KanjiPart {
  Literal: string;
  HanViet: string | null;
  Meaning: string | null;
}

export interface KanjiInfo {
  Literal: string;
  Onyomi: string[];
  Kunyomi: string[];
  Nanori: string[];
  HanViet: string | null;
  MeaningsEn: string[];
  MeaningsVi: string[];
  Strokes: number | null;
  Jlpt: number | null;
  Grade: number | null;
  Radical: string | null;
  RadicalHanViet?: string | null;
  RadicalMeaning?: string | null;
  Components: string[];
  /** Each component with its Han-Viet sound and meaning (filled by the server), for the memory hint. */
  Parts?: KanjiPart[];
  StrokePaths?: string[] | null;
  PartEdges?: string[] | null;
}

export interface Card {
  id: string;
  deckId: string;
  lang: 'ja' | 'en';
  headword: string;
  reading: string | null;
  pos: string | null;
  meaning: string;
  hanviet: string | null;
  english: string | null;
  note: string | null;
  tags: string[];
  progress: Progress;
  ruby: RubyCell[] | null;
  pitch: PitchView | null;
  kanji: KanjiInfo[];
}

export interface Deck {
  id: string;
  name: string;
  total: number;
  counts: Record<StudyStatus, number>;
  tags: { tag: string; count: number }[];
}

export interface LookupResult {
  source: 'user' | 'dictionary';
  headword: string;
  reading: string | null;
  hanviet: string | null;
  meanings: string[];
}
