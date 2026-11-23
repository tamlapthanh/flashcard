/* The four statuses of a word, in one place: their order, icon and colour, so every screen that shows a status looks the same.
   The colours match the study buttons: Again (orange) puts a word in "learning", Learned is green, Skip (blue) suspends it; New is purple. */
import type { StudyStatus } from '../types';

export const STATUS_ORDER: StudyStatus[] = ['new', 'learning', 'learned', 'skipped'];

export const STATUS_ICON: Record<StudyStatus, string> = {
  new: 'mdi-star-four-points-outline',
  learning: 'mdi-progress-clock',
  learned: 'mdi-check-circle-outline',
  skipped: 'mdi-pause-circle-outline'
};

export const STATUS_COLOR: Record<StudyStatus, string> = {
  new: '#8e4ec6',
  learning: '#ef8a17',
  learned: '#3f9b1f',
  skipped: '#2f80d1'
};

/** Inline style that gives an element its status colour as --stc (used by the .stchip class in style.css and by the stat boxes). */
export const statusStyle = (s: StudyStatus): Record<string, string> => ({ '--stc': STATUS_COLOR[s] });
