/*
 * Builds the questions of a test from the cards of a deck. Three kinds, all multiple choice:
 *   meaning: a word or phrase is shown, the user picks its meaning;
 *   listen:  a word is read aloud, the user picks the Japanese word (kanji or kana) that was said;
 *   reading: a word is shown, the user picks how it is read (its kana reading) from the list below.
 * The right answer is the card itself. The wrong answers are other cards of the same deck that look like it (same kind of word, same tag,
 * a shared kanji, a close reading or a meaning of about the same length), so the choice is a real doubt but never two right answers.
 * Nothing here is saved: the wrong answers are worked out when the test starts and thrown away with it.
 */
import type { LightCard } from '../types';

export type QuizKind = 'meaning' | 'listen' | 'reading';

export interface QuizOption {
  id: string; // the card this option stands for
  label: string;
}

export interface QuizQuestion {
  n: number;
  kind: QuizKind;
  card: LightCard;
  options: QuizOption[];
  answerIndex: number;
}

export const OPTIONS = 4;
const NEAR_POOL = 10; // the wrong answers are drawn from this many most similar cards

type Rng = () => number;

const SINGLE_KANJI = /^\p{Script=Han}$/u;
const HAN = /\p{Script=Han}/gu;

/** The meaning as shown on an option: its first two lines, kept short. */
export function meaningLabel(card: LightCard): string {
  const lines = card.meaning.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2);
  const text = lines.join(' · ');
  return text.length > 90 ? text.slice(0, 89).trimEnd() + '…' : text;
}

/** What is read aloud for a card: the kana reading when there is one, otherwise the headword (as the study screen does). */
export const spoken = (card: LightCard): string => card.reading || card.headword;

/** A single kanji is not tested by ear: its reading is ambiguous (On / Kun). */
export const canListen = (card: LightCard): boolean => card.lang === 'ja' && !SINGLE_KANJI.test(card.headword) && spoken(card).length > 0;

/** A word is tested by its reading when it has one that differs from the written word (a word written in kana only has nothing to read out). */
export const canRead = (card: LightCard): boolean => card.lang === 'ja' && !!card.reading && card.reading !== card.headword;

/** The text of an option for each kind of question. */
export function optionLabel(card: LightCard, kind: QuizKind): string {
  return kind === 'listen' ? card.headword : kind === 'reading' ? (card.reading ?? card.headword) : meaningLabel(card);
}

export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length]!;
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

function shuffle<T>(list: T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function sharesKanji(a: string, b: string): boolean {
  const x = new Set(a.match(HAN) ?? []);
  return (b.match(HAN) ?? []).some((c) => x.has(c));
}

/** Whether `other` may stand next to `card` as a wrong answer: it must not also be right. */
function distinct(card: LightCard, other: LightCard, kind: QuizKind): boolean {
  if (other.id === card.id || other.headword === card.headword) return false;
  if (kind === 'listen') return spoken(other) !== spoken(card);
  if (kind === 'reading') return !!other.reading && norm(other.reading) !== norm(card.reading ?? '');
  const a = norm(meaningLabel(card));
  const b = norm(meaningLabel(other));
  if (!a || !b || a === b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return !(short.length >= 3 && long.includes(short)); // one meaning inside the other: both could be called right
}

/** How much `other` looks like `card` (higher: a better wrong answer). */
export function similarity(card: LightCard, other: LightCard, kind: QuizKind): number {
  let s = 0;
  if (card.pos && other.pos && card.pos === other.pos) s += 3;
  if (card.tags.some((tag) => other.tags.includes(tag))) s += 2;
  if (sharesKanji(card.headword, other.headword)) s += 2;
  if (kind === 'listen' || kind === 'reading') {
    const a = kind === 'listen' ? spoken(card) : (card.reading ?? '');
    const b = kind === 'listen' ? spoken(other) : (other.reading ?? '');
    s += 4 * (1 - editDistance(a, b) / Math.max([...a].length, [...b].length, 1));
  } else {
    const a = meaningLabel(card).length;
    const b = meaningLabel(other).length;
    s += 2 * (1 - Math.abs(a - b) / Math.max(a, b, 1));
  }
  return s;
}

/** Up to `OPTIONS - 1` wrong answers: random ones among the most similar cards of the pool. */
export function pickDistractors(card: LightCard, pool: LightCard[], kind: QuizKind, rng: Rng = Math.random): LightCard[] {
  const labels = new Set<string>();
  const near = shuffle(pool, rng) // shuffled first, so equal scores come out in a random order
    .filter((o) => distinct(card, o, kind))
    .map((o) => ({ o, score: similarity(card, o, kind) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, NEAR_POOL);
  const chosen: LightCard[] = [];
  for (const { o } of shuffle(near, rng)) {
    const label = kind === 'listen' ? spoken(o) : kind === 'reading' ? norm(o.reading ?? '') : norm(meaningLabel(o));
    if (labels.has(label)) continue; // two options that read or mean the same would both be right
    labels.add(label);
    chosen.push(o);
    if (chosen.length === OPTIONS - 1) break;
  }
  return chosen;
}

/** mixed: all the kinds, shared evenly among the words that fit them; the others ask only that kind (listen leaves out the words that cannot be
    heard, reading the words that have no reading of their own). */
export type QuizMode = 'mixed' | QuizKind;

/** A question as the server keeps it (a test being continued). */
export interface SavedQuestion {
  n: number;
  kind: QuizKind;
  wordId: string;
  options: string[];
}

/** The question again from its saved form, with the cards of the deck; null when one of its words has been removed since. */
export function restoreQuestion(saved: SavedQuestion, byId: Map<string, LightCard>): QuizQuestion | null {
  const card = byId.get(saved.wordId);
  const cards = saved.options.map((id) => byId.get(id));
  if (!card || cards.some((c) => !c)) return null;
  const options = (cards as LightCard[]).map((c) => ({ id: c.id, label: optionLabel(c, saved.kind) }));
  return { n: saved.n, kind: saved.kind, card, options, answerIndex: options.findIndex((o) => o.id === card.id) };
}

/** The most questions one test can hold (the server and the worker refuse more): "All" stops here. */
export const MAX_QUESTIONS = 500;

export const ALL_KINDS: QuizKind[] = ['meaning', 'listen', 'reading'];

/** The kinds a mode stands for: mixed is all three. */
export const kindsOf = (mode: QuizMode): QuizKind[] => (mode === 'mixed' ? ALL_KINDS : [mode]);

/** The mode to store for a choice of kinds: one kind is itself, any other choice is "mixed". */
export const modeOf = (kinds: QuizKind[]): QuizMode => (kinds.length === 1 ? kinds[0]! : 'mixed');

export interface QuizParams {
  count: number;
  mode?: QuizMode;
  /** Which kinds may be asked (any choice of the three). Wins over `mode`. */
  kinds?: QuizKind[];
  rng?: Rng;
}

/**
 * `cards` are the words to ask about, `pool` the whole deck the wrong answers come from. The kinds are shared out evenly among the ones a word fits
 * (a single kanji cannot be heard, a word with no reading of its own cannot be read); a word that fits none is only asked as `meaning`. A word with fewer than two usable wrong answers is left out.
 */
export function buildQuiz(cards: LightCard[], pool: LightCard[], { count, mode = 'mixed', kinds, rng = Math.random }: QuizParams): QuizQuestion[] {
  const allowed = kinds ?? kindsOf(mode);
  const questions: QuizQuestion[] = [];
  let turn = Math.floor(rng() * 3); // where the rotation of the kinds starts
  for (const card of shuffle(cards, rng)) {
    if (questions.length >= count) break;
    // the allowed kinds this word fits (meaning fits every word); a word that fits none of them is left out
    const fits = allowed.filter((k) => (k === 'listen' ? canListen(card) : k === 'reading' ? canRead(card) : true));
    if (fits.length === 0) continue;
    const kind = fits[turn++ % fits.length]!;
    const wrong = pickDistractors(card, pool, kind, rng);
    if (wrong.length < 2) continue;
    const options = shuffle([card, ...wrong], rng).map((c) => ({ id: c.id, label: optionLabel(c, kind) }));
    questions.push({ n: questions.length, kind, card, options, answerIndex: options.findIndex((o) => o.id === card.id) });
  }
  return questions;
}
