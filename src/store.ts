/* State that outlives a route change. */
import { ref, shallowRef } from 'vue';
import { auth } from './auth';
import { StudySession, type RunSnapshot } from './session';

/*
 * The study run built on the deck screen and read by the study screen. It is also written to this device (per user), so a
 * reload of the page - or the browser closing - brings the same run back (the "Deck finished" screen included), as it
 * already does on a phone that keeps the app in memory.
 */
const RUN_KEY = (): string => `flashmobile.run.${auth.user}`;

function loadRun(): StudySession | null {
  try {
    const snap = JSON.parse(localStorage.getItem(RUN_KEY()) ?? 'null') as RunSnapshot | null;
    return snap && snap.v === 1 && Array.isArray(snap.cards) && Array.isArray(snap.queue) ? StudySession.fromSnapshot(snap) : null;
  } catch {
    return null;
  }
}

export const activeSession = shallowRef<StudySession | null>(loadRun());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/* Writes the current run (a moment after the last change). Too big for the storage, or no storage: the run simply is not kept. */
export function saveRun(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const run = activeSession.value;
      if (run) localStorage.setItem(RUN_KEY(), JSON.stringify(run.snapshot()));
      else localStorage.removeItem(RUN_KEY());
    } catch {
      /* not remembered */
    }
  }, 300);
}

export function setActiveSession(run: StudySession | null): void {
  activeSession.value = run;
  saveRun();
}

/* The navigation menu (opened by the ☰ button of every top bar, drawn in App.vue). */
export const menuOpen = ref(false);
