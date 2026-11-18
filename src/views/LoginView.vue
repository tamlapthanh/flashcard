<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../api';
import Hanko from '../components/Hanko.vue';
import { t } from '../i18n';

const router = useRouter();
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const busy = ref(false);
const waking = ref(false); // a sleeping free server needs a while to answer
const error = ref('');
let wakeTimer: ReturnType<typeof setTimeout> | undefined;

async function submit(): Promise<void> {
  if (busy.value || !username.value.trim() || !password.value) return;
  busy.value = true;
  error.value = '';
  wakeTimer = setTimeout(() => (waking.value = true), 4000);
  try {
    await api.login(username.value.trim(), password.value);
    await router.replace('/');
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 401 ? t('login.wrong') : e instanceof Error ? e.message : t('err.conn');
  } finally {
    clearTimeout(wakeTimer);
    waking.value = false;
    busy.value = false;
  }
}

onUnmounted(() => clearTimeout(wakeTimer));
</script>

<template>
  <v-container class="login">
    <div class="brand text-center">
      <Hanko char="字" :size="72" />
      <div class="text-h5 mt-4 title">単語帳</div>
      <div class="text-caption text-medium-emphasis">{{ t('app.tagline') }}</div>
    </div>

    <form class="paper-card pa-5 mt-6" @submit.prevent="submit">
      <div class="section-title mb-4"><span class="glyph">入</span>{{ t('login.title') }}</div>

      <v-text-field
        v-model="username"
        :label="t('login.user')"
        prepend-inner-icon="mdi-account-outline"
        autocomplete="username"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        variant="outlined"
        density="comfortable"
        :disabled="busy"
        hide-details
        class="mb-3"
      />
      <v-text-field
        v-model="password"
        :label="t('login.password')"
        prepend-inner-icon="mdi-lock-outline"
        :type="showPassword ? 'text' : 'password'"
        :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        autocomplete="current-password"
        variant="outlined"
        density="comfortable"
        :disabled="busy"
        hide-details
        @click:append-inner="showPassword = !showPassword"
      />

      <div v-if="error" class="text-body-2 text-error mt-3" role="alert"><v-icon icon="mdi-alert-circle-outline" size="16" /> {{ error }}</div>
      <div v-else-if="waking" class="text-caption text-medium-emphasis mt-3"><v-icon icon="mdi-power-sleep" size="14" /> {{ t('login.waking') }}</div>

      <v-btn type="submit" block color="primary" size="large" prepend-icon="mdi-login" class="mt-5" :loading="busy" :disabled="!username.trim() || !password" :data-tip="t('login.submit')">
        {{ t('login.submit') }}
      </v-btn>
    </form>
  </v-container>
</template>

<style scoped>
.login {
  max-width: 420px;
  padding-top: 8vh;
}
.title {
  font-family: var(--font-jp);
  letter-spacing: 0.1em;
}
</style>
