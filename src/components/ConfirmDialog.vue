<script setup lang="ts">
/*
 * A question in the app's own style (the paper card, the 3D buttons) instead of the browser's alert box.
 * `confirm` is the main answer, `cancel` also comes from Esc or a tap outside. `danger` makes the main button the red of a delete.
 */
defineProps<{
  modelValue: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  icon?: string; // the icon beside the title
  confirmIcon?: string; // the icons of the two buttons
  cancelIcon?: string;
  danger?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="380" @update:model-value="(open: boolean) => !open && emit('cancel')">
    <div class="paper-card confirm" role="alertdialog" :aria-label="title">
      <div class="head">
        <v-icon :icon="icon ?? 'mdi-help-circle-outline'" size="22" :color="danger ? 'error' : 'warning'" />
        <div class="title">{{ title }}</div>
      </div>
      <div class="message">{{ message }}</div>
      <slot />
      <div class="actions">
        <!-- both are the app's 3D buttons: tonal (blue / red) and the green main one, each with an icon, sinking under the mouse -->
        <v-btn variant="tonal" color="info" :prepend-icon="cancelIcon ?? 'mdi-close'" @click="emit('cancel')">{{ cancelLabel }}</v-btn>
        <v-btn v-if="danger" variant="tonal" color="error" :prepend-icon="confirmIcon ?? 'mdi-check'" @click="emit('confirm')">{{ confirmLabel }}</v-btn>
        <v-btn v-else color="primary" :prepend-icon="confirmIcon ?? 'mdi-check'" @click="emit('confirm')">{{ confirmLabel }}</v-btn>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.confirm {
  padding: 18px 18px 14px;
  border-radius: 20px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--forest);
}
.message {
  margin-top: 8px;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
