/* State that outlives a route change. */
import { ref, shallowRef } from 'vue';
import type { StudySession } from './session';

/* The study run built on the deck screen and read by the study screen. */
export const activeSession = shallowRef<StudySession | null>(null);

/* The navigation menu (opened by the ☰ button of every top bar, drawn in App.vue). */
export const menuOpen = ref(false);
