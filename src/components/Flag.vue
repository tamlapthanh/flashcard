<script setup lang="ts">
import { t } from '../i18n';

/* A few dots stand for the stars of the US canton. */
const dots: [number, number][] = [1.6, 4, 6.4, 8.8, 11].flatMap((x, c) => [1.6, 4, 6.6].map((y): [number, number] => [x, y + (c % 2) * 0.4]));

withDefaults(defineProps<{ country: 'jp' | 'vn' | 'us'; size?: number }>(), { size: 52 });
</script>

<!-- Flags drawn as SVG (emoji flags do not render on Windows and some Android builds). -->
<template>
  <svg
    class="flag"
    :style="{ width: size + 'px', height: size * 0.67 + 'px' }"
    viewBox="0 0 30 20"
    role="img"
    :aria-label="country === 'jp' ? t('flag.jp') : country === 'us' ? t('flag.us') : t('flag.vn')"
  >
    <template v-if="country === 'jp'">
      <rect width="30" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6" fill="#bc002d" />
    </template>
    <template v-else-if="country === 'us'">
      <rect width="30" height="20" fill="#fff" />
      <rect v-for="i in 7" :key="i" y="0" :transform="`translate(0 ${(i - 1) * 2 * 20 / 13})`" width="30" :height="20 / 13" fill="#b22234" />
      <rect width="12" :height="7 * 20 / 13" fill="#3c3b6e" />
      <circle v-for="(d, i) in dots" :key="i" :cx="d[0]" :cy="d[1]" r="0.55" fill="#fff" />
    </template>
    <template v-else>
      <rect width="30" height="20" fill="#da251d" />
      <polygon fill="#ff0" points="15,4 16.76,8.58 21.66,8.82 17.85,11.9 19.11,16.64 15,13.95 10.89,16.64 12.15,11.9 8.34,8.82 13.24,8.58" />
    </template>
  </svg>
</template>

<style scoped>
.flag {
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
}
</style>
