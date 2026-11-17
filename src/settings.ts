import { reactive, watch } from 'vue';

export type Language = 'en' | 'vi';

export interface Settings {
  fontScale: number; // 0.8 - 2.5, same range as LCT
  showReading: boolean; // show the reading on the front by default
  dark: boolean;
  language: Language; // language of the app's own text (card data stays as written in LCT)
  showMeaning: boolean; // show the Vietnamese meaning on the answer side (Japanese -> Vietnamese mode)
  showHanViet: boolean; // show the Sino-Vietnamese (Hán Việt) reading
  direction: 'forward' | 'reverse'; // forward = Japanese -> Vietnamese, reverse = Vietnamese -> Japanese
}

const KEY = 'flashmobile.settings';

function defaults(): Settings {
  const vietnamese = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi');
  return { fontScale: 1, showReading: false, dark: false, language: vietnamese ? 'vi' : 'en', showMeaning: true, showHanViet: true, direction: 'forward' };
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
