/*
 * Keeps the user's settings in their Google Sheet (through the server) and on this device:
 *  - after login (and when the app starts already logged in) the saved settings are pulled and replace the local ones;
 *    when the server has none yet, the local ones are uploaded (first time);
 *  - every change is pushed ~1 s later. A change the server could not take stays marked "unsent" on this device and
 *    is pushed again (the next login or change) instead of being overwritten by the older copy on the server.
 * The web-only tooltip switch is not synced.
 */
import { nextTick, watch } from 'vue';
import { api } from './api';
import { auth, isLoggedIn } from './auth';
import { applyRemoteSettings, settings, syncPayload } from './settings';

const PUSH_DELAY_MS = 1000;
const UNSENT_KEY = 'flashmobile.settingsUnsent'; // the user whose latest change has not reached the server yet

let applying = false; // true while the server's copy is being written into settings (must not be pushed back)
let timer: ReturnType<typeof setTimeout> | null = null;
let pulledFor = ''; // the user whose settings were pulled in this page

const unsentFor = (): string => {
  try {
    return localStorage.getItem(UNSENT_KEY) ?? '';
  } catch {
    return '';
  }
};

function markUnsent(user: string | null): void {
  try {
    if (user) localStorage.setItem(UNSENT_KEY, user);
    else localStorage.removeItem(UNSENT_KEY);
  } catch {
    /* storage unavailable: the change is still pushed while the page is open */
  }
}

async function push(): Promise<void> {
  const user = auth.user;
  if (!isLoggedIn()) return;
  try {
    await api.putSettings(syncPayload(settings));
    if (unsentFor() === user) markUnsent(null);
  } catch {
    markUnsent(user); // offline / server asleep: pushed again later
  }
}

function schedulePush(): void {
  if (!isLoggedIn()) return;
  markUnsent(auth.user);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void push();
  }, PUSH_DELAY_MS);
}

async function pull(): Promise<void> {
  if (!isLoggedIn() || pulledFor === auth.user) return;
  const user = auth.user;
  try {
    const remote = await api.getSettings();
    if (user !== auth.user) return; // logged out / switched while waiting
    pulledFor = user;
    if (unsentFor() === user || !remote.settings) {
      await push(); // our copy is newer, or the server has nothing yet
      return;
    }
    applying = true;
    applyRemoteSettings(remote.settings);
    await nextTick(); // let the watcher below see (and ignore) this change
    applying = false;
  } catch {
    applying = false; // keep the local settings; tried again at the next login
  }
}

export function startSettingsSync(): void {
  watch(
    settings,
    () => {
      if (!applying) schedulePush();
    },
    { deep: true, flush: 'post' }
  );
  watch(() => auth.token, () => {
    if (!auth.token) pulledFor = '';
    void pull();
  });
  void pull();
}
