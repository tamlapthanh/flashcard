<script setup lang="ts">
import { t } from '../i18n';

withDefaults(defineProps<{ country: 'jp' | 'vn'; size?: number }>(), { size: 52 });
</script>

<!-- Flags drawn as SVG (emoji flags do not render on Windows and some Android builds). -->
<template>
  <svg
    class="flag"
    :style="{ width: size + 'px', height: size * 0.67 + 'px' }"
    viewBox="0 0 30 20"
    role="img"
    :aria-label="country === 'jp' ? t('flag.jp') : t('flag.vn')"
  >
    <template v-if="country === 'jp'">
      <rect width="30" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6" fill="#bc002d" />
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
