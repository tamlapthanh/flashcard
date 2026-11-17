<script setup lang="ts">
import { pendingResults } from '../api';
import Flag from '../components/Flag.vue';
import TopBar from '../components/TopBar.vue';
import { t } from '../i18n';
import { clampScale, settings } from '../settings';
</script>

<style scoped>
.dirs {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 14px 8px 10px;
}
.dirpick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 6px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: inherit;
  opacity: 0.4;
  transition: opacity 0.15s;
}
.dirpick.on {
  opacity: 1;
  border-bottom-color: rgb(var(--v-theme-primary));
}
</style>

<template>
  <TopBar :title="t('set.title')" />

  <v-container>
    <div class="section-title mt-0"><span class="glyph">字</span>{{ t('set.fontSize') }}</div>
    <div class="soft-card pa-4">
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

    <div class="section-title"><span class="glyph">向</span>{{ t('set.direction') }}</div>
    <!-- just the flags: the chosen direction is full colour with a leaf-green underline, the other one is faded -->
    <div class="soft-card dirs" role="radiogroup">
      <button type="button" role="radio" class="dirpick" :class="{ on: settings.direction === 'forward' }" :aria-checked="settings.direction === 'forward'" :aria-label="t('deck.dirForward')" @click="settings.direction = 'forward'">
        <Flag country="jp" /><v-icon icon="mdi-arrow-right" size="28" /><Flag country="vn" />
      </button>
      <button type="button" role="radio" class="dirpick" :class="{ on: settings.direction === 'reverse' }" :aria-checked="settings.direction === 'reverse'" :aria-label="t('deck.dirReverse')" @click="settings.direction = 'reverse'">
        <Flag country="vn" /><v-icon icon="mdi-arrow-right" size="28" /><Flag country="jp" />
      </button>
    </div>

    <div class="section-title"><span class="glyph">示</span>{{ t('set.display') }}</div>
    <v-list class="soft-card pa-0" lines="two">
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
      <v-list-item :title="t('set.language')">
        <template #prepend><v-avatar color="teal" variant="tonal" size="38"><v-icon icon="mdi-translate" /></v-avatar></template>
        <template #append>
          <v-btn-toggle v-model="settings.language" mandatory divided density="compact" color="primary" variant="outlined">
            <v-btn value="en">English</v-btn>
            <v-btn value="vi">Tiếng Việt</v-btn>
          </v-btn-toggle>
        </template>
      </v-list-item>
    </v-list>

    <v-alert v-if="pendingResults() > 0" type="warning" variant="tonal" density="compact" icon="mdi-cloud-upload-outline" class="mt-4">
      {{ t('set.pending', { n: pendingResults() }) }}
    </v-alert>
  </v-container>
</template>
