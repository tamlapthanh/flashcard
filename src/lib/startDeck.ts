import { api, prefetchDetails } from '../api';
import { StudySession } from '../session';
import { settings } from '../settings';
import { setActiveSession, type PendingStart } from '../store';
import type { StudyStatus } from '../types';
import { clearDetails, ensureDetails } from './cardDetail';
import { listOrder } from './cardOrder';

const ALL_STATUSES: StudyStatus[] = ['new', 'learning', 'learned', 'skipped'];

/* Quietly keeps this deck on the device (its whole list and the detail of its cards), so it can be studied without the server later. */
async function keepForOffline(deckId: string, ids: string[]): Promise<void> {
  try {
    const all = await api.cards({ deck: deckId, tags: [], status: ALL_STATUSES });
    await prefetchDetails(all.cards.length ? all.cards.map((c) => c.id) : ids);
  } catch {
    /* offline or asleep: nothing to keep */
  }
}

/*
 * Loads a deck for studying: its cards of the status filter and of the tags remembered for it, then the full detail of the first cards (so they are
 * complete when the first card shows). Runs on the study screen, behind its loading screen. Resolves to 'run' when a run was built (it is the active
 * session now) or to 'finished' when there is nothing left to study (the active session is cleared: the "Deck finished" screen shows). Throws when the
 * cards cannot be loaded.
 */
export async function loadDeckRun(p: PendingStart): Promise<'run' | 'finished'> {
  const found = await api.cards({ deck: p.deckId, tags: p.wordIds ? [] : p.tags, status: p.wordIds ? ALL_STATUSES : p.statuses });
  const picked = p.wordIds ? found.cards.filter((c) => p.wordIds!.includes(c.id)) : found.cards;
  const cards = settings.studyInOrder ? listOrder(picked) : picked; // the server sends them shuffled
  if (cards.length === 0) {
    setActiveSession(null);
    return 'finished';
  }
  clearDetails();
  await ensureDetails(cards.slice(0, 7).map((c) => c.id));
  setActiveSession(new StudySession(cards, { reverse: settings.direction === 'reverse', showReading: settings.showReading, deckName: p.deckName, tags: p.tags }));
  void keepForOffline(p.deckId, cards.map((c) => c.id));
  return 'run';
}
