/*
 * One study run. Rules follow LCT's flashcard: Learned and Skip leave the deck, Again puts the card back at the end.
 * Plain logic (no Vue, no network) so it can be unit tested; the view wraps it in reactive().
 */
import type { LightCard as Card, StudyResult } from './types';

export interface SessionOptions {
  reverse: boolean; // Việt -> Nhật
  showReading: boolean;
}

export class StudySession {
  queue: Card[];
  flipped = false;
  showReading: boolean;
  readonly reverse: boolean;
  learned = 0;
  again = 0;
  skipped = 0;
  readonly total: number;
  private readonly againIds = new Set<string>();
  /* Every card of the run in its original order, and the ids already learned / skipped (for the word list). */
  readonly cards: Card[];
  readonly learnedIds = new Set<string>();
  readonly skippedIds = new Set<string>();
  private readonly byId = new Map<string, Card>();

  constructor(cards: Card[], options: SessionOptions) {
    this.queue = [...cards];
    this.total = cards.length;
    this.cards = [...cards];
    this.reverse = options.reverse;
    this.showReading = options.showReading;
    for (const c of cards) this.byId.set(c.id, c);
  }

  get current(): Card | undefined {
    return this.queue[0];
  }

  get remaining(): number {
    return this.queue.length;
  }

  get finished(): boolean {
    return this.queue.length === 0;
  }

  /* 1-based position of the current card among the cards of this run (Again cards keep their number). */
  get position(): number {
    return Math.min(this.total, this.total - this.queue.length + 1);
  }

  /* Cards that got Again at least once and are not finished yet or were finished after an Again. */
  get againCards(): Card[] {
    return [...this.againIds].map((id) => this.byId.get(id)!).filter(Boolean);
  }

  /* Where a card stands in this run, for the word list. Learned wins over an earlier Again. */
  status(id: string): 'learned' | 'again' | 'skipped' | 'todo' {
    if (this.learnedIds.has(id)) return 'learned';
    if (this.againIds.has(id)) return 'again';
    if (this.skippedIds.has(id)) return 'skipped';
    return 'todo';
  }

  /* Bring a card that is still in the deck to the front (picked from the word list). */
  jumpTo(id: string): boolean {
    const i = this.queue.findIndex((c) => c.id === id);
    if (i < 0) return false;
    if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
    this.flipped = false;
    return true;
  }

  flip(): void {
    if (!this.finished) this.flipped = !this.flipped;
  }

  /* Browse without grading (like LCT's Prev/Next): the current card goes to the back of the deck. */
  next(): boolean {
    if (this.queue.length < 2) return false;
    this.queue.push(this.queue.shift()!);
    this.flipped = false;
    return true;
  }

  /* The card at the back of the deck comes to the front. */
  previous(): boolean {
    if (this.queue.length < 2) return false;
    this.queue.unshift(this.queue.pop()!);
    this.flipped = false;
    return true;
  }

  /* Returns the answered card so the caller can send the result. */
  answer(result: StudyResult): Card | undefined {
    const card = this.queue.shift();
    if (!card) return undefined;
    this.flipped = false;
    if (result === 'again') {
      this.again++;
      this.againIds.add(card.id);
      this.queue.push(card);
    } else if (result === 'learned') {
      this.learned++;
      this.learnedIds.add(card.id);
    } else {
      this.skipped++;
      this.skippedIds.add(card.id);
    }
    return card;
  }
}
