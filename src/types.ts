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
  Known?: boolean;
}

export interface KanjiCompound {
  Word: string;
  Reading: string | null;
  Vi: string | null;
}

export interface KanjiMnemonic {
  En: string | null;
  Ja: string | null;
  Vi: string | null;
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
  /** Every node of the PartEdges graph with its Han-Viet sound (filled by the server). */
  Tree?: KanjiPart[];
  StrokePaths?: string[] | null;
  PartEdges?: string[] | null;
  /** From LCT: compound words and a memory story; absent or null when the kanji has no notes. */
  Compounds?: KanjiCompound[] | null;
  Mnemonic?: KanjiMnemonic | null;
}

/* What the server sends for every card of a run: enough for the word list and the front of the card. */
export interface LightCard {
  id: string;
  deckId: string;
  lang: 'ja' | 'en';
  headword: string;
  reading: string | null;
  pos: string | null;
  meaning: string;
  hanviet: string | null;
  example: string | null;
  exampleVi: string | null;
  tags: string[];
  progress: Progress;
  /** The reading split under each kanji piece, for the word list (null when it cannot be aligned). */
  furigana: { text: string; ruby: string | null; morae: PitchMora[] | null }[] | null;
  /** The pitch line of the whole reading when it could not be split under the kanji. */
  pitchMorae: PitchMora[] | null;
}

/* The heavy part, fetched per card just before it is studied (see lib/cardDetail.ts). */
export interface CardDetail {
  id: string;
  english: string | null;
  note: string | null;
  ruby: RubyCell[] | null;
  pitch: PitchView | null;
  kanji: KanjiInfo[];
}

export type Card = LightCard & CardDetail;

export interface Deck {
  id: string;
  name: string;
  total: number;
  counts: Record<StudyStatus, number>;
  tags: { tag: string; count: number }[];
  isDefault?: boolean; // the dictionary LCT marks as default (listed first)
}

export interface LookupResult {
  source: 'user' | 'dictionary';
  headword: string;
  reading: string | null;
  hanviet: string | null;
  meanings: string[];
}

/* ---- tests (quizzes) ---- */

export type TestMode = 'mixed' | 'meaning' | 'listen' | 'reading';

/** A new test as the app sends it: every question with the ids of its options in the order shown. The server works out which answers are right. */
export interface TestCreateBody {
  sessionId: string;
  at: string;
  deckId: string;
  tags: string[];
  mode: TestMode;
  questions: { wordId: string; kind: 'meaning' | 'listen' | 'reading'; options: string[] }[];
}

/** A test with the score so far. answered counts the skipped questions too; total - answered is what is not done yet. */
export interface TestSessionInfo {
  sessionId: string;
  at: string;
  deckId: string;
  deckName: string;
  tags: string[];
  mode: TestMode;
  status: 'open' | 'done';
  total: number;
  nListen: number;
  nMeaning: number;
  nReading?: number; // older servers do not send the reading counts
  finishedAt: string | null;
  paperId?: string | null; // set when it is an attempt at a paper an admin made
  paperTitle?: string | null;
  answered: number;
  correct: number;
  answeredListen: number;
  correctListen: number;
  answeredMeaning: number;
  correctMeaning: number;
  answeredReading?: number;
  correctReading?: number;
}

/* ---- papers: tests an admin makes, the same for every user ---- */

export interface PaperSource {
  deckId: string;
  deckName: string;
  tags: string[];
}

/** A paper with what the signed-in user did with it. deckId is '*' when it draws on several decks. */
export interface PaperInfo {
  paperId: string;
  title: string;
  createdBy: string;
  at: string;
  deckId: string;
  sources: PaperSource[];
  mode: TestMode;
  total: number;
  nListen: number;
  nMeaning: number;
  nReading: number;
  attempts: number;
  done: number;
  bestCorrect: number | null;
  latest: { at: string; status: 'open' | 'done'; correct: number; answered: number } | null;
}

/** One attempt of one user at a paper (the admin sees all of them). */
export interface PaperResult {
  userId: string;
  sessionId: string;
  at: string;
  status: 'open' | 'done';
  total: number;
  finishedAt: string | null;
  answered: number;
  correct: number;
}

export interface PaperCreateBody {
  paperId: string;
  title: string;
  sources: { deckId: string; tags: string[] }[];
  mode: TestMode;
  questions: { wordId: string; kind: 'meaning' | 'listen' | 'reading'; options: string[] }[];
}

export interface TestWord {
  id: string;
  headword: string;
  reading: string | null;
  meaning: string;
  hanviet?: string | null; // Sino-Vietnamese reading (older servers do not send it)
}

export interface TestAnswerDetail {
  n: number;
  kind: 'meaning' | 'listen' | 'reading';
  options: string[];
  answered: boolean; // false: not done yet
  correct: boolean;
  word: TestWord | null; // null: the word was removed from the dictionary since
  picked: TestWord | null; // null on an answered question: skipped
}
