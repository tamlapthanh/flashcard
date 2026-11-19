<script setup lang="ts">
/* One text of the sample card in Settings: click it to select; the selected text shows a small bar right under it
   (size - / +, colour, reset) and the whole sample card changes at once. Size and colour come straight from settings. */
import { computed } from 'vue';
import { CARD_TEXTS, clampSize, defaultCardStyles } from '../cardText';
import { settings } from '../settings';

const props = defineProps<{ k: string; sel: string | null; name: string; block?: boolean; nobar?: boolean; align?: 'left' | 'center' | 'right' }>();
const emit = defineEmits<{ pick: [k: string] }>();

const def = computed(() => CARD_TEXTS.find((d) => d.key === props.k)!);
const style = computed(() => settings.cardText[props.k]!);
const color = computed(() => style.value.color || (settings.dark ? def.value.dark : def.value.light));
const on = computed(() => props.sel === props.k);

function step(delta: number): void {
  style.value.size = clampSize(style.value.size + delta);
}
function typed(event: Event): void {
  const n = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(n) && n > 0) style.value.size = clampSize(n);
}
function reset(): void {
  settings.cardText[props.k] = { ...defaultCardStyles()[props.k]! };
}
</script>

<template>
  <component :is="block ? 'div' : 'span'" class="ed" :class="{ on }" :style="{ fontSize: style.size + 'px', color }" @click.stop="emit('pick', k)">
    <slot />
    <span v-if="on && !nobar" class="bar" :class="'al-' + (align ?? 'center')" @click.stop>
      <span class="nm">{{ name }}</span>
      <span class="ctl">
        <button type="button" aria-label="−" @click="step(-1)">−</button>
        <input class="num" type="number" min="8" max="120" step="1" :value="style.size" aria-label="px" @change="typed" />
        <button type="button" aria-label="+" @click="step(1)">+</button>
        <input class="clr" type="color" :value="color" aria-label="color" @input="style.color = ($event.target as HTMLInputElement).value" />
        <button type="button" class="rs" aria-label="reset" @click="reset"><v-icon icon="mdi-restore" size="16" /></button>
      </span>
    </span>
  </component>
</template>

<style scoped>
.ed {
  position: relative;
  cursor: pointer;
  border-radius: 4px;
  outline: 1px dashed transparent;
  outline-offset: 2px;
}
.ed:hover {
  outline-color: var(--leaf);
}
.ed.on {
  outline: 2px solid rgb(var(--v-theme-primary));
  z-index: 20;
}
.bar {
  position: absolute;
  top: 100%;
  margin-top: 6px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: max-content;
  padding: 6px 8px;
  border: 1px solid var(--paper-edge);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  font: 500 0.72rem/1.2 system-ui, sans-serif;
  font-style: normal;
  letter-spacing: 0;
  text-align: left;
  text-transform: none;
  white-space: nowrap;
  cursor: default;
}
.al-center {
  left: 50%;
  transform: translateX(-50%);
}
.al-left {
  left: 0;
}
.al-right {
  right: 0;
}
.nm {
  opacity: 0.75;
}
.ctl {
  display: flex;
  align-items: center;
  gap: 5px;
}
.ctl button,
.num,
.clr {
  height: 30px;
  border: 1px solid var(--paper-edge);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.ctl button {
  width: 32px;
  font-size: 1.1rem;
  line-height: 1;
}
.num {
  width: 52px;
  text-align: center;
  cursor: text;
}
.clr {
  width: 36px;
  padding: 0;
}
</style>
