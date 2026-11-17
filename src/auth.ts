/*
 * Who is logged in. The token comes from the server (POST /api/login) and is kept in localStorage so a reload or a
 * restart of the installed app stays logged in. Set VITE_LOGIN=false to run against a server that has login off.
 */
import { reactive } from 'vue';

const STORAGE_KEY = 'flashmobile.auth';

export const loginRequired = import.meta.env.VITE_LOGIN !== 'false';

interface Stored {
  token: string;
  user: string;
}

function read(): Stored | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
    return value && typeof value.token === 'string' && typeof value.user === 'string' ? { token: value.token, user: value.user } : null;
  } catch {
    return null;
  }
}

export const auth = reactive<{ token: string; user: string }>(read() ?? { token: '', user: '' });

export const isLoggedIn = (): boolean => !loginRequired || auth.token !== '';

export function setSession(token: string, user: string): void {
  auth.token = token;
  auth.user = user;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  } catch {
    /* storage unavailable: the login lasts until the page closes */
  }
}

export function clearSession(): void {
  auth.token = '';
  auth.user = '';
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
