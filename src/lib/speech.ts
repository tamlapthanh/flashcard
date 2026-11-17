/*
 * Reads a word aloud. First choice: the natural ElevenLabs voice (MP3 from the server). Every MP3 is kept in the
 * browser's Cache Storage, so a word is paid for once and then plays instantly, even offline. When the server has no
 * voice, is asleep, out of credits or the Settings switch is off, the device's own Japanese voice (Web Speech API) reads it.
 * Only the word itself is read: the kana reading when there is one, otherwise the headword.
 */
import { fetchSpeech } from '../api';
import { settings } from '../settings';

const CACHE_NAME = 'flashmobile-speech-v2'; // bump when the server's voice or speed changes, so old recordings are not replayed

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || typeof Audio !== 'undefined');
}

let current = 0; // bumped by every speak/stop, so a late answer of an older request never plays
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;

function release(): void {
  audio?.pause();
  audio = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

async function cachedSpeech(text: string): Promise<Blob> {
  const key = new Request(`/speech/${encodeURIComponent(text)}`);
  const store = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME).catch(() => null) : null;
  const hit = await store?.match(key);
  if (hit) return hit.blob();
  const blob = await fetchSpeech(text);
  await store?.put(key, new Response(blob, { headers: { 'content-type': 'audio/mpeg' } })).catch(() => undefined);
  return blob;
}

function speakWithDevice(text: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja'));
  if (voice) utterance.voice = voice;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function speakJapanese(text: string, onEnd?: () => void): void {
  const id = ++current;
  stopOutput();
  if (!text) {
    onEnd?.();
    return;
  }
  if (!settings.naturalVoice || typeof Audio === 'undefined') {
    speakWithDevice(text, onEnd);
    return;
  }
  void cachedSpeech(text).then(
    (blob) => {
      if (id !== current) return; // stopped or replaced while the voice was loading
      audioUrl = URL.createObjectURL(blob);
      audio = new Audio(audioUrl);
      audio.onended = () => onEnd?.();
      audio.onerror = () => {
        release();
        if (id === current) speakWithDevice(text, onEnd);
      };
      audio.play().catch(() => {
        release();
        if (id === current) speakWithDevice(text, onEnd);
      });
    },
    () => {
      if (id === current) speakWithDevice(text, onEnd); // no ElevenLabs voice available: device voice instead
    }
  );
}

function stopOutput(): void {
  release();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function stopSpeaking(): void {
  current++;
  stopOutput();
}
