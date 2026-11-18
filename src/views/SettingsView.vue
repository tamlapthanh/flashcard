<script setup lang="ts">
import { computed, reactive } from 'vue';
import { pendingResults } from '../api';
import Flag from '../components/Flag.vue';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { clampScale, settings } from '../settings';

/* The three groups of settings fold away: tap a heading to show or hide it (all folded at first, each with a one-line summary). */
const open = reactive({ size: false, direction: false, display: false });
const sizeSummary = computed(() => `${settings.fontScale.toFixed(1)}×`);
const directionSummary = computed(() => (settings.direction === 'forward' ? t('deck.dirForward') : t('deck.dirReverse')));
const displaySummary = computed(() => `${[settings.showReading, settings.showMeaning, settings.showHanViet, settings.showEnglish, settings.naturalVoice, settings.dark].filter(Boolean).length} / 6`);
</script>

<style scoped>
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
  padding: 8px 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--forest); /* the same colour as the "Settings" title in the top bar */
  font-weight: 700;
  text-align: start;
  cursor: pointer;
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
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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

  <v-container>
    <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.size" @click="open.size = !open.size">
      <span class="glyph">字</span><span class="name">{{ t('set.fontSize') }}</span><span class="sum">{{ sizeSummary }}</span>
      <v-icon :icon="open.size ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
    </button>
    <v-expand-transition>
    <div v-show="open.size" class="soft-card pa-4 mb-3">
      <v-slider
        :model-value="settings.fontScale"
        :min="0.8"
        :max="2.5"
        :step="0.1"
        hide-details
        color="primary"
        prepend-icon="mdi-format-font-size-decrease"
        append-icon="mdi-format-font-size-increase"
        @update:model-value="(v: number) => (settings.fontScale = clampScale(v))"
      />
      <div class="text-center jp mt-2" :style="{ fontSize: 1.8 * settings.fontScale + 'rem' }">香り</div>
    </div>
    </v-expand-transition>

    <button type="button" class="sechead" :data-tip="t('tip.section')" :aria-expanded="open.direction" @click="open.direction = !open.direction">
      <span class="glyph">向</span><span class="name">{{ t('set.direction') }}</span><span class="sum">{{ directionSummary }}</span>
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
      <span class="glyph">示</span><span class="name">{{ t('set.display') }}</span><span class="sum">{{ displaySummary }}</span>
      <v-icon :icon="open.display ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
    </button>
    <v-expand-transition>
    <v-list v-show="open.display" class="soft-card pa-0" lines="two">
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

    <v-alert v-if="pendingResults() > 0" type="warning" variant="tonal" density="compact" icon="mdi-cloud-upload-outline" class="mt-4">
      {{ t('set.pending', { n: pendingResults() }) }}
    </v-alert>
  </v-container>
</template>
