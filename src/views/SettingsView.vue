<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { api, fetchVoicePreview, me, pendingResults, serverInfo, type VoiceConfig, type VoiceOption, type VoiceOptions, type VoiceProvider } from '../api';
import Flag from '../components/Flag.vue';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import CardTextEditor from '../components/CardTextEditor.vue';
import { clearSpeechCaches } from '../lib/speech';
import { clearSamples, samplesJson, sampleStats } from '../lib/strokeSamples';
import { AUTO_MAX_SEC, AUTO_MIN_SEC, settings } from '../settings';

/* The three groups of settings fold away: tap a heading to show or hide it (all folded at first, each with a one-line summary). */
const open = reactive({ size: false, direction: false, display: false, auto: false, write: false, voice: false });

/* Auto play times: whole seconds, within the limits of the settings. */
function bump(key: 'autoFrontSec' | 'autoBackSec', delta: number): void {
  settings[key] = Math.min(AUTO_MAX_SEC, Math.max(AUTO_MIN_SEC, settings[key] + delta));
}
/* The strokes the user marked as right (kept on this device): copied out as JSON to tune the check with. */
const copied = ref(false);
async function copySamples(): Promise<void> {
  try {
    await navigator.clipboard.writeText(samplesJson());
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    /* the browser did not allow the clipboard */
  }
}
/* Admin only: how much of the ElevenLabs credits is used. Read (free) the first time the ElevenLabs Voice section is opened, and again on "Refresh". */
type VoiceUsage = { used: number; limit: number; percent: number; resetAt: string | null; tier: string | null };
const usage = ref<VoiceUsage | null>(null);
const usageState = ref<'idle' | 'loading' | 'error'>('idle');

/* Admin only: the Google characters counted by the server this month (Google itself has no usage API). */
type GoogleUsage = { used: number; limit: number; percent: number; month: string };
const googleUsage = ref<GoogleUsage | null>(null);
const googleState = ref<'idle' | 'loading' | 'error'>('idle');
async function loadGoogleUsage(): Promise<void> {
  googleState.value = 'loading';
  try {
    googleUsage.value = await api.voiceUsage();
    googleState.value = 'idle';
  } catch {
    googleState.value = 'error';
  }
}

/* Admin only: which provider reads the words. Changing it makes the server keep a new cache version, so the browser drops its copies. */
const switching = ref<VoiceProvider | null>(null);
const voiceError = ref('');
const voiceName = (p: VoiceProvider): string => (p === 'google' ? t('set.voiceGoogle') : t('set.voiceElevenlabs'));
async function switchVoice(provider: unknown): Promise<void> {
  if (typeof provider !== 'string' || switching.value || provider === me.voiceProvider) return;
  const picked = provider as VoiceProvider;
  switching.value = picked;
  voiceError.value = '';
  try {
    const saved = await api.setVoiceProvider(picked);
    me.voiceProvider = saved.provider;
    me.voiceVersion = saved.updatedAt;
    await clearSpeechCaches(); // the files made by the other voice must never play again
  } catch {
    voiceError.value = picked === 'google' ? t('set.voiceGoogleCheckFail') : t('set.voiceSwitchFail');
  } finally {
    switching.value = null;
  }
}

/* The voice itself: the list comes from the providers (metadata only, no characters spent), and a change rebuilds the
   server's engines with the new voice/model/speed. The form is saved per provider; the sample is synthesized once per
   settings and then cached by the engine. */
const voiceOptions = ref<VoiceOptions | null>(null);
const voiceOptionsState = ref<'idle' | 'loading' | 'error'>('idle');
const voiceForm = ref<VoiceConfig | null>(null);
const voiceSaving = ref(false);
const voiceSaved = ref(false);
const voiceFormError = ref('');
const previewing = ref(false);
let previewAudio: HTMLAudioElement | null = null;
let previewUrl = '';

const cloneVoice = (config: VoiceConfig): VoiceConfig => ({ ...config, elevenlabs: { ...config.elevenlabs }, google: { ...config.google } });

async function loadVoiceOptions(): Promise<void> {
  voiceOptionsState.value = 'loading';
  voiceFormError.value = '';
  try {
    const options = await api.voiceOptions();
    voiceOptions.value = options;
    voiceForm.value = cloneVoice(options.current);
    voiceOptionsState.value = 'idle';
  } catch {
    voiceOptionsState.value = 'error';
  }
}

const voiceDirty = computed(() => {
  const current = voiceOptions.value?.current;
  const form = voiceForm.value;
  if (!current || !form) return false;
  return (
    current.elevenlabs.voice !== form.elevenlabs.voice ||
    current.elevenlabs.model !== form.elevenlabs.model ||
    current.elevenlabs.speed !== form.elevenlabs.speed ||
    current.google.voice !== form.google.voice
  );
});

async function saveVoice(): Promise<boolean> {
  const form = voiceForm.value;
  if (!form || voiceSaving.value) return false;
  voiceSaving.value = true;
  voiceSaved.value = false;
  voiceFormError.value = '';
  try {
    const saved = await api.updateVoice(me.voiceProvider === 'elevenlabs' ? { elevenlabs: { ...form.elevenlabs } } : { google: { ...form.google } });
    me.voiceProvider = saved.provider;
    me.voiceVersion = saved.updatedAt;
    if (voiceOptions.value) voiceOptions.value.current = saved;
    voiceForm.value = cloneVoice(saved);
    await clearSpeechCaches();
    voiceSaved.value = true;
    setTimeout(() => (voiceSaved.value = false), 2000);
    return true;
  } catch {
    voiceFormError.value = t('set.voiceSettingsFail');
    return false;
  } finally {
    voiceSaving.value = false;
  }
}

function stopPreview(): void {
  previewAudio?.pause();
  previewAudio = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
}

async function previewVoice(): Promise<void> {
  if (previewing.value) return;
  previewing.value = true;
  voiceFormError.value = '';
  try {
    if (voiceDirty.value && !(await saveVoice())) return; // hear what the form says: apply it first
    const blob = await fetchVoicePreview();
    stopPreview();
    previewUrl = URL.createObjectURL(blob);
    previewAudio = new Audio(previewUrl);
    previewAudio.onended = stopPreview;
    await previewAudio.play();
  } catch {
    voiceFormError.value = t('set.voicePreviewFail');
  } finally {
    previewing.value = false;
  }
}

const voiceItemProps = (item: VoiceOption): { subtitle?: string } => ({ subtitle: item.detail });
watch(
  () => open.voice && me.admin,
  (show) => {
    if (show && !voiceOptions.value && voiceOptionsState.value !== 'loading') void loadVoiceOptions();
  }
);
onBeforeUnmount(stopPreview);
watch(
  () => open.voice,
  (isOpen) => {
    if (!isOpen) stopPreview();
  }
);
async function loadUsage(): Promise<void> {
  usageState.value = 'loading';
  try {
    usage.value = await api.speechUsage();
    usageState.value = 'idle';
  } catch {
    usageState.value = 'error';
  }
}
watch(
  () => open.voice && me.admin && me.voiceProvider === 'elevenlabs',
  (show) => {
    if (show && !usage.value && usageState.value !== 'loading') void loadUsage();
  }
);
watch(
  () => open.voice && me.admin && me.voiceProvider === 'google',
  (show) => {
    if (show && !googleUsage.value && googleState.value !== 'loading') void loadGoogleUsage();
  }
);
const usageReset = computed(() => (usage.value?.resetAt ? new Date(usage.value.resetAt).toLocaleDateString() : ''));
const usageDays = computed(() => (usage.value?.resetAt ? Math.max(0, Math.ceil((new Date(usage.value.resetAt).getTime() - Date.now()) / 86_400_000)) : 0));
/* How far through the period we are. The account only says when it resets, so the period is taken as a month (30 days): about right for a monthly plan. */
const PERIOD_DAYS = 30;
const timePct = computed(() => Math.min(100, Math.max(0, ((PERIOD_DAYS - usageDays.value) / PERIOD_DAYS) * 100)));
const usageColor = computed(() => colorFor(usage.value?.percent ?? 0));
/** Green, then orange from 70%, red from 90%. */
function colorFor(percent: number): string {
  return percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'primary';
}
const directionSummary = computed(() => (settings.direction === 'forward' ? t('deck.dirForward') : t('deck.dirReverse')));
</script>

<style>
/* Light mode: the page behind the Settings cards is white too (the green gradient is the page of every other screen). Only while this screen is open. */
.v-application:not(.v-theme--dark):has(.settings-page) {
  background: #fff !important;
}
</style>

<style scoped>
/* The list of switches is a Vuetify v-list, which paints its own surface colour over .soft-card: give it the same paper as every other card. */
.soft-card.v-list,
.soft-card.v-list :deep(.v-list-item) {
  background: var(--paper);
}
/* Light mode: the texts of this screen are a dark warm brown (easier on the eyes than black); the Vuetify text colour is the one setting. */
.warm {
  --v-theme-on-surface: 43, 33, 24; /* #2b2118 */
  color: #2b2118;
  --paper: #fff; /* light mode: the cards of this screen (and what is inside them) are white instead of cream */
}
/* Light mode: the section bars are the app's main green (a clear leaf-green tint on the white page), a deeper one when open */
.warm .sechead {
  background: color-mix(in srgb, var(--leaf) 26%, #fff);
  border-color: color-mix(in srgb, var(--leaf) 45%, #fff);
}
.warm .sechead[aria-expanded='true'] {
  background: color-mix(in srgb, var(--leaf) 42%, #fff);
  border-color: var(--leaf);
}
.warm .sechead .glyph {
  background: color-mix(in srgb, var(--leaf) 30%, #fff);
}
.warm :deep(.v-list-item-subtitle),
.warm .hint {
  color: #6b5a4a !important;
  opacity: 1;
}
/* the ElevenLabs speed slider: label on the left, value on the right */
.speedrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 600;
}
.speedval {
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* Phones have no mouse, hence no tooltips: the tooltip switch is hidden there. */
@media not all and (hover: hover) and (pointer: fine) {
  .webonly {
    display: none;
  }
}
.langflags {
  display: flex;
  justify-content: center;
  gap: 18px;
  padding: 4px 0;
}
.langpick {
  padding: 4px 6px 6px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  opacity: 0.4;
  transition: opacity 0.15s;
  cursor: pointer;
}
.langpick.on {
  opacity: 1;
  border-bottom-color: rgb(var(--v-theme-primary));
}
.sechead {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0 0 8px;
  padding: 10px 12px;
  border: 1.5px solid var(--paper-edge);
  border-radius: 14px;
  background: color-mix(in srgb, var(--leaf) 10%, var(--paper)); /* a soft leaf-tinted bar */
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.18); /* small 3D edge, like the buttons */
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.12s ease;
  color: #4e342e; /* deep brown: the three section headings stand apart from the green title above them */
  font-weight: 700;
  text-align: start;
  cursor: pointer;
}
.sechead {
  outline: none; /* no black focus ring: the green edge below is the focus / open mark */
}
.sechead:focus-visible,
.sechead[aria-expanded='true'] {
  border-color: var(--leaf); /* the open section has a green edge */
}
.sechead[aria-expanded='true'] {
  background: color-mix(in srgb, var(--leaf) 18%, var(--paper));
  margin-bottom: 1px; /* what opens under it sits right up against it */
}
.sechead:active {
  box-shadow: 0 0 0 rgba(31, 77, 36, 0.18);
  transform: translateY(2px);
}
@media (hover: hover) and (pointer: fine) {
  .sechead:hover {
    border-color: var(--leaf);
  }
}
.v-theme--dark .sechead {
  color: #eef8e4; /* the top bar's colour in dark mode */
}
.sechead .glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--leaf) 18%, transparent);
  font-family: var(--font-jp);
  font-size: 0.8rem;
}
.sechead .name {
  flex: 0 0 auto;
  white-space: nowrap; /* the heading stays on one line; the summary beside it is the one that gives way */
  font-size: 0.9rem;
}
.sechead .sum {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.75;
  text-transform: none;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 2px;
}
.secs {
  min-width: 54px;
  text-align: center;
  font-weight: 700;
}
.dirs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 8px;
}
/* Each direction is a small card that shows how a flashcard will go: the question side, then the answer side. */
.dirpick {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 6px 7px;
  border: 2px solid var(--paper-edge);
  border-radius: 14px;
  background: var(--paper);
  color: inherit;
  opacity: 0.55;
  transform: scale(0.97);
  box-shadow: 0 2px 0 rgba(31, 77, 36, 0.18);
  transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}
.dirpick.on {
  opacity: 1;
  transform: none;
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 4px 0 #3f8a1f;
}
.dirflags {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dirdemo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: 100%;
}
.mini {
  width: 100%;
  padding: 3px 4px;
  border: 1px solid var(--paper-edge);
  border-radius: 10px;
  text-align: center;
  line-height: 1.2;
  font-size: 0.74rem;
  background: rgb(var(--v-theme-surface));
}
.mini.q {
  font-size: 1rem;
  font-weight: 700;
}
.mini.q.jp {
  color: var(--headword);
}
.mini.a {
  opacity: 0.85;
}
.dirhint {
  font-size: 0.66rem;
  line-height: 1.2;
  text-align: center;
  opacity: 0.8;
}
.dircheck {
  position: absolute;
  top: -9px;
  right: -7px;
  border-radius: 50%;
  background: var(--paper); /* the tick sits on the corner of the card, clear of the flag */
}
.wrapsub :deep(.v-list-item-subtitle) {
  white-space: normal; /* the explanation may take two lines instead of being cut */
  -webkit-line-clamp: unset;
}
.usagehead {
  display: flex;
  align-items: center;
  justify-content: flex-end; /* only the refresh button, at the right */
  margin-bottom: 4px;
}
.usagebody {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap; /* a narrow phone puts the numbers under the ring */
}
.usagepct {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
}
.usagepct small {
  font-size: 0.9rem;
  font-weight: 700;
}
.usagenums {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.usageused b {
  font-size: 1.5rem;
}
.usageused span,
.usageleft,
.usagereset {
  font-size: 0.85rem;
  opacity: 0.8;
}
.usageleft {
  font-weight: 600;
  opacity: 1;
}
.usagetime {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--paper-edge);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.usagebar {
  display: grid;
  grid-template-columns: 64px 1fr 40px;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
}
.usagebar .n {
  text-align: right;
  font-weight: 700;
}
.usagepace {
  font-size: 0.8rem;
  opacity: 0.8;
}
.usagepace.fast {
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
  opacity: 1;
}
.usagereset .v-icon {
  vertical-align: -3px;
}
.samplesrow {
  display: flex;
  align-items: center;
  gap: 8px;
}
.samplesrow .secs {
  margin-right: auto;
}
</style>

<template>
  <TopBar :title="t('set.title')" back />

  <v-container fluid class="settings-page px-3 pt-1" :class="{ warm: !settings.dark }">
    <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.size" @click="open.size = !open.size">
      <span class="glyph">字</span><span class="name">{{ t('set.fontSize') }}</span><span class="sum" />
      <v-icon :icon="open.size ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
    </button>
    <v-expand-transition>
    <div v-show="open.size" class="soft-card pa-4 mb-3">
      <CardTextEditor />
    </div>
    </v-expand-transition>

    <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.direction" @click="open.direction = !open.direction">
      <span class="glyph">向</span><span class="name">{{ directionSummary }}</span><span class="sum" />
      <v-icon :icon="open.direction ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
    </button>
    <v-expand-transition>
    <!-- the chosen direction is a lit card with a tick, the other one is faded -->
    <div v-show="open.direction" class="soft-card dirs mb-3" role="radiogroup">
      <button type="button" role="radio" class="dirpick" :class="{ on: settings.direction === 'forward' }" :aria-checked="settings.direction === 'forward'" :aria-label="t('deck.dirForward')" @click="settings.direction = 'forward'">
        <v-icon v-if="settings.direction === 'forward'" class="dircheck" icon="mdi-check-circle" color="primary" size="20" />
        <span class="dirflags"><Flag country="jp" /><v-icon icon="mdi-arrow-right" size="18" /><Flag country="vn" /></span>
        <span class="dirdemo">
          <span class="mini q jp">香り</span>
          <v-icon icon="mdi-chevron-down" size="16" color="primary" />
          <span class="mini a">mùi thơm</span>
        </span>
        <span class="dirhint">{{ t('set.dirForwardHint') }}</span>
      </button>
      <button type="button" role="radio" class="dirpick" :class="{ on: settings.direction === 'reverse' }" :aria-checked="settings.direction === 'reverse'" :aria-label="t('deck.dirReverse')" @click="settings.direction = 'reverse'">
        <v-icon v-if="settings.direction === 'reverse'" class="dircheck" icon="mdi-check-circle" color="primary" size="20" />
        <span class="dirflags"><Flag country="vn" /><v-icon icon="mdi-arrow-right" size="22" /><Flag country="jp" /></span>
        <span class="dirdemo">
          <span class="mini q">mùi thơm</span>
          <v-icon icon="mdi-chevron-down" size="16" color="primary" />
          <span class="mini a jp">香り</span>
        </span>
        <span class="dirhint">{{ t('set.dirReverseHint') }}</span>
      </button>
    </div>
    </v-expand-transition>

    <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.display" @click="open.display = !open.display">
      <span class="glyph">示</span><span class="name">{{ t('set.display') }}</span><span class="sum" />
      <v-icon :icon="open.display ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
    </button>
    <v-expand-transition>
    <v-list v-show="open.display" class="soft-card pa-0 mb-3" lines="two">
      <v-list-item :title="t('set.showReading')" :subtitle="t('set.showReadingSub')">
        <template #prepend><v-avatar color="info" variant="tonal" size="38"><v-icon icon="mdi-eye-outline" /></v-avatar></template>
        <template #append><v-switch v-model="settings.showReading" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.studyInOrder')" :subtitle="t('set.studyInOrderSub')" class="wrapsub">
        <template #prepend><v-avatar color="primary" variant="tonal" size="38"><v-icon icon="mdi-sort-variant" /></v-avatar></template>
        <template #append><v-switch v-model="settings.studyInOrder" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.showMeaning')" :subtitle="t('set.showMeaningSub')">
        <template #prepend><v-avatar color="primary" variant="tonal" size="38"><v-icon icon="mdi-translate" /></v-avatar></template>
        <template #append><v-switch v-model="settings.showMeaning" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.showHanViet')" :subtitle="t('set.showHanVietSub')">
        <template #prepend><v-avatar color="teal" variant="tonal" size="38"><v-icon icon="mdi-ideogram-cjk" /></v-avatar></template>
        <template #append><v-switch v-model="settings.showHanViet" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.showEnglish')" :subtitle="t('set.showEnglishSub')">
        <template #prepend><v-avatar color="info" variant="tonal" size="38"><v-icon icon="mdi-alpha-e-box-outline" /></v-avatar></template>
        <template #append><v-switch v-model="settings.showEnglish" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.naturalVoice')" :subtitle="t('set.naturalVoiceSub')">
        <template #prepend><v-avatar color="info" variant="tonal" size="38"><v-icon icon="mdi-account-voice" /></v-avatar></template>
        <template #append><v-switch v-model="settings.naturalVoice" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.testInstant')" :subtitle="t('set.testInstantSub')" class="wrapsub">
        <template #prepend><v-avatar color="warning" variant="tonal" size="38"><v-icon icon="mdi-school-outline" /></v-avatar></template>
        <template #append><v-switch v-model="settings.testInstantCheck" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.dark')">
        <template #prepend><v-avatar color="secondary" variant="tonal" size="38"><v-icon icon="mdi-weather-night" /></v-avatar></template>
        <template #append><v-switch v-model="settings.dark" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <!-- the app language: icon and "Language" on the left, the two flags at the right end (web and phone alike) -->
      <v-divider class="webonly" />
      <v-list-item class="webonly" :title="t('set.showTooltips')" :subtitle="t('set.showTooltipsSub')">
        <template #prepend><v-avatar color="primary" variant="tonal" size="38"><v-icon icon="mdi-tooltip-text-outline" /></v-avatar></template>
        <template #append><v-switch v-model="settings.showTooltips" color="primary" hide-details density="compact" /></template>
      </v-list-item>
      <v-divider />
      <v-list-item class="langrow" :title="t('set.language')">
        <template #prepend><v-avatar color="teal" variant="tonal" size="38"><v-icon icon="mdi-translate" /></v-avatar></template>
        <template #append>
        <div class="langflags" role="radiogroup" :aria-label="t('set.language')">
            <button type="button" role="radio" class="langpick" :class="{ on: settings.language === 'vi' }" :aria-checked="settings.language === 'vi'" :aria-label="t('flag.vn')" @click="settings.language = 'vi'"><Flag country="vn" :size="46" /></button>
            <button type="button" role="radio" class="langpick" :class="{ on: settings.language === 'en' }" :aria-checked="settings.language === 'en'" :aria-label="t('flag.us')" @click="settings.language = 'en'"><Flag country="us" :size="46" /></button>
          </div>
        </template>
      </v-list-item>
    </v-list>
    </v-expand-transition>

    <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.auto" @click="open.auto = !open.auto">
      <span class="glyph">自</span><span class="name">{{ t('set.auto') }}</span><span class="sum" />
      <v-icon :icon="open.auto ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
    </button>
    <v-expand-transition>
    <v-list v-show="open.auto" class="soft-card pa-0 mb-3" lines="two">
      <v-list-item :title="t('set.autoFront')" :subtitle="t('set.autoFrontSub')">
        <template #append>
          <div class="stepper">
            <v-btn icon="mdi-minus" variant="text" size="small" :aria-label="t('set.autoFront') + ' −'" :disabled="settings.autoFrontSec <= AUTO_MIN_SEC" @click="bump('autoFrontSec', -1)" />
            <span class="secs" data-testid="auto-front">{{ t('set.seconds', { n: settings.autoFrontSec }) }}</span>
            <v-btn icon="mdi-plus" variant="text" size="small" :aria-label="t('set.autoFront') + ' +'" :disabled="settings.autoFrontSec >= AUTO_MAX_SEC" @click="bump('autoFrontSec', 1)" />
          </div>
        </template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.autoBack')" :subtitle="t('set.autoBackSub')">
        <template #append>
          <div class="stepper">
            <v-btn icon="mdi-minus" variant="text" size="small" :aria-label="t('set.autoBack') + ' −'" :disabled="settings.autoBackSec <= AUTO_MIN_SEC" @click="bump('autoBackSec', -1)" />
            <span class="secs" data-testid="auto-back">{{ t('set.seconds', { n: settings.autoBackSec }) }}</span>
            <v-btn icon="mdi-plus" variant="text" size="small" :aria-label="t('set.autoBack') + ' +'" :disabled="settings.autoBackSec >= AUTO_MAX_SEC" @click="bump('autoBackSec', 1)" />
          </div>
        </template>
      </v-list-item>
      <v-divider />
      <v-list-item :title="t('set.autoSpeak')" :subtitle="t('set.autoSpeakSub')">
        <template #append><v-switch v-model="settings.autoSpeak" color="primary" hide-details density="compact" :aria-label="t('set.autoSpeak')" /></template>
      </v-list-item>
      <!-- only when the server keeps voice files (a local run with SPEECH_SAVE_DIR); on any other server there is nothing to switch -->
      <template v-if="serverInfo.saveVoice">
        <v-divider />
        <v-list-item :title="t('set.autoSaveVoice')" :subtitle="t('set.autoSaveVoiceSub')">
          <template #append><v-switch v-model="settings.autoSaveVoice" color="primary" hide-details density="compact" :aria-label="t('set.autoSaveVoice')" data-testid="auto-save-voice" /></template>
        </v-list-item>
      </template>
    </v-list>
    </v-expand-transition>

    <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.write" @click="open.write = !open.write">
      <span class="glyph">書</span><span class="name">{{ t('set.write') }}</span><span class="sum" />
      <v-icon :icon="open.write ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
    </button>
    <v-expand-transition>
    <v-list v-show="open.write" class="soft-card pa-0 mb-3" lines="two">
      <!-- the choices sit on a row of their own under the text: beside it they squeezed the title to "How strictly st..." on a phone -->
      <v-list-item :title="t('set.strictness')" :subtitle="t('set.strictnessSub')" class="wrapsub" />
      <div class="px-4 pb-3">
        <v-btn-toggle v-model="settings.strokeStrictness" mandatory density="comfortable" color="primary" variant="outlined" divided class="w-100" data-testid="stroke-strictness">
          <v-btn value="strict" size="small" class="flex-grow-1">{{ t('set.strict') }}</v-btn>
          <v-btn value="normal" size="small" class="flex-grow-1">{{ t('set.normal') }}</v-btn>
          <v-btn value="loose" size="small" class="flex-grow-1">{{ t('set.loose') }}</v-btn>
        </v-btn-toggle>
      </div>
      <v-divider />
      <v-list-item :title="t('set.samples')" :subtitle="t('set.samplesSub')" class="wrapsub" />
      <div class="samplesrow px-4 pb-3">
        <span class="secs" data-testid="stroke-samples">{{ t('set.samplesN', { n: sampleStats.count }) }}</span>
        <v-btn variant="tonal" size="small" :disabled="!sampleStats.count" @click="copySamples">{{ copied ? t('set.copied') : t('set.copy') }}</v-btn>
        <v-btn variant="tonal" size="small" color="error" :disabled="!sampleStats.count" @click="clearSamples">{{ t('set.clear') }}</v-btn>
      </div>
    </v-list>
    </v-expand-transition>

    <!-- admin only (the server refuses everybody else too): how much of the ElevenLabs credits is used -->
    <template v-if="me.admin">
      <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.voice" data-testid="voice-section" @click="open.voice = !open.voice">
        <span class="glyph">声</span><span class="name">{{ t('set.voiceTitle') }}</span><span class="sum" />
        <v-icon :icon="open.voice ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
      </button>
      <v-expand-transition>
      <div v-show="open.voice" class="soft-card pa-4 mb-3" data-testid="voice-usage">
        <!-- admin: which voice reads the words (the server refuses everybody else too) -->
        <v-list-item :title="t('set.voiceProvider')" :subtitle="t('set.voiceProviderSub')" class="wrapsub pa-0" />
        <div class="px-4 pb-3">
          <v-btn-toggle :model-value="me.voiceProvider" mandatory density="comfortable" color="primary" variant="outlined" divided class="w-100" data-testid="voice-provider" @update:model-value="switchVoice">
            <v-btn v-for="p in me.voiceAvailable" :key="p" :value="p" size="small" class="flex-grow-1" :loading="switching === p" :disabled="!!switching">{{ voiceName(p) }}</v-btn>
          </v-btn-toggle>
          <div v-if="voiceError" class="hint mt-2">{{ voiceError }}</div>
        </div>
        <!-- admin: the voice (and ElevenLabs' model and speed) of the active provider, plus a short sample -->
        <div class="px-4 pb-3" data-testid="voice-settings">
          <div v-if="voiceOptionsState === 'loading'" class="hint">{{ t('set.voiceOptionsLoading') }}</div>
          <div v-else-if="voiceOptionsState === 'error'" class="hint">
            {{ t('set.voiceOptionsError') }}
            <v-btn variant="tonal" size="small" class="ml-2" @click="loadVoiceOptions">{{ t('deck.retry') }}</v-btn>
          </div>
          <template v-else-if="voiceForm && voiceOptions">
            <template v-if="me.voiceProvider === 'elevenlabs'">
              <v-select v-model="voiceForm.elevenlabs.voice" :items="voiceOptions.elevenlabs.voices" :item-props="voiceItemProps" item-title="name" item-value="id" :label="t('set.voiceVoice')" density="compact" variant="outlined" hide-details class="mb-2" data-testid="voice-elevenlabs" />
              <v-select v-if="voiceOptions.elevenlabs.models.length" v-model="voiceForm.elevenlabs.model" :items="voiceOptions.elevenlabs.models" item-title="name" item-value="id" :label="t('set.voiceModel')" density="compact" variant="outlined" hide-details class="mb-2" data-testid="voice-model" />
              <div class="speedrow">
                <span>{{ t('set.voiceSpeed') }}</span>
                <v-slider v-model="voiceForm.elevenlabs.speed" :min="0.7" :max="1.2" :step="0.05" hide-details density="compact" color="primary" class="flex-grow-1 mx-2" />
                <span class="speedval">{{ voiceForm.elevenlabs.speed.toFixed(2) }}</span>
              </div>
            </template>
            <v-select v-else v-model="voiceForm.google.voice" :items="voiceOptions.google.voices" :item-props="voiceItemProps" item-title="name" item-value="id" :label="t('set.voiceVoice')" density="compact" variant="outlined" hide-details data-testid="voice-google" />
            <div class="d-flex ga-2 mt-2">
              <v-btn size="small" color="primary" variant="flat" :disabled="!voiceDirty" :loading="voiceSaving" @click="saveVoice">{{ voiceSaved ? t('set.voiceSaved') : t('set.voiceSave') }}</v-btn>
              <v-btn size="small" variant="tonal" color="primary" :loading="previewing" @click="previewVoice">{{ t('set.voiceListen') }}</v-btn>
            </div>
            <div v-if="voiceFormError" class="hint mt-2">{{ voiceFormError }}</div>
            <div class="hint mt-2">{{ t('set.voicePreviewNote') }}</div>
          </template>
        </div>
        <v-divider class="mb-2" />
        <!-- admin test option, this device only: every read asks the provider, no cache of any kind -->
        <v-list-item class="pa-0 mb-2" :title="t('set.skipVoiceCache')" :subtitle="t('set.skipVoiceCacheSub')" lines="three">
          <template #append><v-switch v-model="settings.skipVoiceCache" color="primary" hide-details density="compact" :aria-label="t('set.skipVoiceCache')" data-testid="skip-voice-cache" /></template>
        </v-list-item>
        <v-divider class="mb-2" />
        <!-- the credit figures are ElevenLabs only (the server reads its subscription); Google offers no such figure -->
        <template v-if="me.voiceProvider === 'elevenlabs'">
        <div class="usagehead">
          <v-btn icon="mdi-refresh" variant="text" size="small" :loading="usageState === 'loading'" :aria-label="t('set.voiceUsageRefresh')" @click="loadUsage" />
        </div>
        <div v-if="usage" class="usagebody">
          <!-- a ring that fills with what is used: green, then orange from 70%, red from 90% -->
          <v-progress-circular :model-value="usage.percent" :color="usageColor" :size="104" :width="11" class="usagering">
            <span class="usagepct">{{ Math.round(usage.percent) }}<small>%</small></span>
          </v-progress-circular>
          <div class="usagenums">
            <div class="usageused"><b>{{ usage.used.toLocaleString() }}</b> <span>/ {{ usage.limit.toLocaleString() }} credits</span></div>
            <div class="usageleft">{{ t('set.voiceLeft', { n: Math.max(0, usage.limit - usage.used).toLocaleString() }) }}</div>
            <div v-if="usageReset" class="usagereset"><v-icon icon="mdi-calendar-refresh-outline" size="16" /> {{ t('set.voiceUsageReset', { date: usageReset, days: usageDays }) }}</div>
          </div>
        </div>
        <!-- the same period as a bar: how far through it we are, against how much credit is gone (a longer credit bar than time bar = spending faster than the month passes) -->
        <div v-if="usage && usageReset" class="usagetime" data-testid="voice-time">
          <div class="usagebar">
            <span>{{ t('set.voiceBarCredit') }}</span>
            <v-progress-linear :model-value="usage.percent" :color="usageColor" height="8" rounded />
            <span class="n">{{ Math.round(usage.percent) }}%</span>
          </div>
          <div class="usagebar">
            <span>{{ t('set.voiceBarTime') }}</span>
            <v-progress-linear :model-value="timePct" color="blue-grey" height="8" rounded />
            <span class="n">{{ Math.round(timePct) }}%</span>
          </div>
          <div class="usagepace" :class="{ fast: usage.percent > timePct + 5 }">{{ usage.percent > timePct + 5 ? t('set.voicePaceFast') : t('set.voicePaceOk') }}</div>
        </div>
        <div v-else-if="usageState === 'error'" class="hint">{{ t('set.voiceUsageError') }}</div>
        <div v-else class="hint">{{ t('set.voiceUsageLoading') }}</div>
        </template>
        <!-- Google has no usage API: the server counts the characters itself and stops at the limit -->
        <template v-else>
        <div class="usagehead">
          <v-btn icon="mdi-refresh" variant="text" size="small" :loading="googleState === 'loading'" :aria-label="t('set.voiceUsageRefresh')" @click="loadGoogleUsage" />
        </div>
        <div v-if="googleUsage" class="usagebody" data-testid="voice-google-usage">
          <v-progress-circular :model-value="googleUsage.percent" :color="colorFor(googleUsage.percent)" :size="104" :width="11" class="usagering">
            <span class="usagepct">{{ Math.round(googleUsage.percent) }}<small>%</small></span>
          </v-progress-circular>
          <div class="usagenums">
            <div class="usageused"><b>{{ googleUsage.used.toLocaleString() }}</b> <span>/ {{ t('set.voiceGoogleChars', { n: googleUsage.limit.toLocaleString() }) }}</span></div>
            <div class="usageleft">{{ t('set.voiceGoogleLeft', { n: Math.max(0, googleUsage.limit - googleUsage.used).toLocaleString() }) }}</div>
            <div class="usagereset"><v-icon icon="mdi-calendar-month-outline" size="16" /> {{ t('set.voiceGoogleMonth', { month: googleUsage.month }) }}</div>
          </div>
        </div>
        <div v-else-if="googleState === 'error'" class="hint">{{ t('set.voiceGoogleUsageError') }}</div>
        <div v-else class="hint">{{ t('set.voiceGoogleUsageLoading') }}</div>
        <div class="hint mt-2">{{ t('set.voiceGoogleNote') }}</div>
        </template>
      </div>
      </v-expand-transition>
    </template>

    <v-alert v-if="pendingResults() > 0" type="warning" variant="tonal" density="compact" icon="mdi-cloud-upload-outline" class="mt-4">
      {{ t('set.pending', { n: pendingResults() }) }}
    </v-alert>
  </v-container>
</template>
