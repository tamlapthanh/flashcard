<script setup lang="ts">
import { computed, reactive } from 'vue';
import { pendingResults, serverInfo } from '../api';
import Flag from '../components/Flag.vue';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import CardTextEditor from '../components/CardTextEditor.vue';
import { AUTO_MAX_SEC, AUTO_MIN_SEC, settings } from '../settings';

/* The three groups of settings fold away: tap a heading to show or hide it (all folded at first, each with a one-line summary). */
const open = reactive({ size: false, direction: false, display: false, auto: false });

/* Auto play times: whole seconds, within the limits of the settings. */
function bump(key: 'autoFrontSec' | 'autoBackSec', delta: number): void {
  settings[key] = Math.min(AUTO_MAX_SEC, Math.max(AUTO_MIN_SEC, settings[key] + delta));
}
const directionSummary = computed(() => (settings.direction === 'forward' ? t('deck.dirForward') : t('deck.dirReverse')));
</script>

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
}
.warm :deep(.v-list-item-subtitle),
.warm .hint {
  color: #6b5a4a !important;
  opacity: 1;
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
</style>

<template>
  <TopBar :title="t('set.title')" />

  <v-container fluid class="px-3 pt-1" :class="{ warm: !settings.dark }">
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

    <v-alert v-if="pendingResults() > 0" type="warning" variant="tonal" density="compact" icon="mdi-cloud-upload-outline" class="mt-4">
      {{ t('set.pending', { n: pendingResults() }) }}
    </v-alert>
  </v-container>
</template>
