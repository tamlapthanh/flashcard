import { reactive, watch } from 'vue';

export type Language = 'en' | 'vi';

export interface Settings {
  fontScale: number; // 0.8 - 2.5, same range as LCT
  showReading: boolean; // show the reading on the front by default
  dark: boolean;
  language: Language; // language of the app's own text (card data stays as written in LCT)
  showMeaning: boolean; // show the Vietnamese meaning on the answer side (Japanese -> Vietnamese mode)
  showHanViet: boolean; // show the Sino-Vietnamese (Hán Việt) reading
  showEnglish: boolean; // show the English meaning under the Vietnamese one
  showTooltips: boolean; // web only: a small label when the mouse is over a button
  naturalVoice: boolean; // read words with the natural (ElevenLabs) voice when the server has one
  direction: 'forward' | 'reverse'; // forward = Japanese -> Vietnamese, reverse = Vietnamese -> Japanese
}

const KEY = 'flashmobile.settings';

function defaults(): Settings {
  const vietnamese = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi');
  return { fontScale: 1, showReading: false, dark: false, language: vietnamese ? 'vi' : 'en', showMeaning: true, showHanViet: true, showEnglish: false, showTooltips: true, naturalVoice: true, direction: 'forward' };
}

function load(): Settings {
  const base = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      fontScale: clampScale(raw.fontScale ?? base.fontScale),
      showReading: raw.showReading ?? base.showReading,
      dark: raw.dark ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? base.dark,
      language: raw.language === 'vi' || raw.language === 'en' ? raw.language : base.language,
      showMeaning: raw.showMeaning ?? base.showMeaning,
      showHanViet: raw.showHanViet ?? base.showHanViet,
      showEnglish: raw.showEnglish ?? base.showEnglish,
      showTooltips: raw.showTooltips ?? base.showTooltips,
      naturalVoice: raw.naturalVoice ?? base.naturalVoice,
      direction: raw.direction === 'reverse' ? 'reverse' : 'forward'
    };
  } catch {
    return base;
  }
}

export function clampScale(value: number): number {
  return Math.min(2.5, Math.max(0.8, Math.round(value * 10) / 10));
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
