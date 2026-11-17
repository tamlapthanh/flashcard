<script setup lang="ts">
withDefaults(defineProps<{ char: string; size?: number; stamping?: boolean }>(), { size: 72, stamping: false });
</script>

<!-- A red seal with a kanji. `stamping` plays the "pressed onto the paper" animation once. -->
<template>
  <span
    class="hanko"
    :class="{ stamping }"
    :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.55 + 'px' }"
    aria-hidden="true"
  >{{ char }}</span>
</template>

<style scoped>
.hanko {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--shu);
  border: 3px solid var(--shu);
  border-radius: 8px;
  font-family: var(--font-jp);
  font-weight: 700;
  line-height: 1;
  transform: rotate(-9deg);
  opacity: 0.9;
  background: color-mix(in srgb, var(--shu) 6%, transparent);
  box-shadow:
    inset 0 0 0 2px var(--paper),
    inset 0 0 0 3.5px var(--shu);
  user-select: none;
}
.stamping {
  animation: press 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
@keyframes press {
  0% {
    transform: rotate(-9deg) scale(2.2);
    opacity: 0;
  }
  60% {
    transform: rotate(-9deg) scale(0.92);
    opacity: 1;
  }
  100% {
    transform: rotate(-9deg) scale(1);
    opacity: 0.9;
  }
}
</style>
