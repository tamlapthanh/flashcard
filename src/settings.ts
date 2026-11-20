import { reactive, watch } from 'vue';
import { defaultCardStyles, loadCardStyles, type CardTextStyles } from './cardText';

export type Language = 'en' | 'vi';

export interface Settings {
  cardText: CardTextStyles; // size (px) and colour of every text on the card (see cardText.ts); an old fontScale is migrated once
  showReading: boolean; // show the reading on the front by default
  dark: boolean;
  language: Language; // language of the app's own text (card data stays as written in LCT)
  showMeaning: boolean; // show the Vietnamese meaning on the answer side (Japanese -> Vietnamese mode)
  showHanViet: boolean; // show the Sino-Vietnamese (Hán Việt) reading
  showEnglish: boolean; // show the English meaning under the Vietnamese one
  showTooltips: boolean; // web only: a small label when the mouse is over a button
  naturalVoice: boolean; // read words with the natural (ElevenLabs) voice when the server has one
  direction: 'forward' | 'reverse'; // forward = Japanese -> Vietnamese, reverse = Vietnamese -> Japanese
  autoFrontSec: number; // auto play: seconds the front of a card stays
  autoBackSec: number; // auto play: seconds the answer side stays
  autoSpeak: boolean; // auto play: read the word aloud
  autoSaveVoice: boolean; // auto play: let the server keep the spoken words as files (only a local run with SPEECH_SAVE_DIR saves anything)
}

export const AUTO_MIN_SEC = 1;
export const AUTO_MAX_SEC = 30;
const autoSec = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(AUTO_MAX_SEC, Math.max(AUTO_MIN_SEC, Math.round(value))) : fallback);

const KEY = 'flashmobile.settings';

function defaults(): Settings {
  const vietnamese = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi');
  return { cardText: defaultCardStyles(), showReading: false, dark: false, language: vietnamese ? 'vi' : 'en', showMeaning: true, showHanViet: true, showEnglish: false, showTooltips: true, naturalVoice: true, direction: 'forward', autoFrontSec: 3, autoBackSec: 4, autoSpeak: true, autoSaveVoice: true };
}

/* Any saved / received shape -> valid Settings (unknown keys dropped, bad values replaced by defaults). */
export function normalizeSettings(input: unknown, tooltips = true): Settings {
  const base = defaults();
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<Settings> & { fontScale?: number };
  return {
    cardText: loadCardStyles(raw.cardText, typeof raw.fontScale === 'number' ? Math.min(2.5, Math.max(0.8, raw.fontScale)) : undefined),
    showReading: typeof raw.showReading === 'boolean' ? raw.showReading : base.showReading,
    dark: typeof raw.dark === 'boolean' ? raw.dark : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? base.dark),
    language: raw.language === 'vi' || raw.language === 'en' ? raw.language : base.language,
    showMeaning: typeof raw.showMeaning === 'boolean' ? raw.showMeaning : base.showMeaning,
    showHanViet: typeof raw.showHanViet === 'boolean' ? raw.showHanViet : base.showHanViet,
    showEnglish: typeof raw.showEnglish === 'boolean' ? raw.showEnglish : base.showEnglish,
    showTooltips: typeof raw.showTooltips === 'boolean' ? raw.showTooltips : tooltips,
    naturalVoice: typeof raw.naturalVoice === 'boolean' ? raw.naturalVoice : base.naturalVoice,
    direction: raw.direction === 'reverse' ? 'reverse' : 'forward',
    autoFrontSec: autoSec(raw.autoFrontSec, base.autoFrontSec),
    autoBackSec: autoSec(raw.autoBackSec, base.autoBackSec),
    autoSpeak: typeof raw.autoSpeak === 'boolean' ? raw.autoSpeak : base.autoSpeak,
    autoSaveVoice: typeof raw.autoSaveVoice === 'boolean' ? raw.autoSaveVoice : base.autoSaveVoice
  };
}

function load(): Settings {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return defaults();
  }
}

export const settings = reactive<Settings>(load());

watch(
  settings,
  (value) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  { deep: true }
);

/* What goes to the server: everything except the web-only tooltip switch (that one stays per device). */
export function syncPayload(value: Settings): Omit<Settings, 'showTooltips'> {
  const { showTooltips: _tooltips, ...rest } = JSON.parse(JSON.stringify(value)) as Settings;
  return rest;
}

/* Replace the settings with what the server holds (the local tooltip switch is kept). */
export function applyRemoteSettings(remote: unknown): void {
  Object.assign(settings, normalizeSettings(remote, settings.showTooltips));
}
