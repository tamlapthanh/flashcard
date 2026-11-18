import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL, USERS } from '../playwright.config';

export type User = keyof typeof USERS;

export interface DeckInfo {
  id: string;
  name: string;
  total: number;
  counts: { new: number; learning: number; learned: number; skipped: number };
}

/** Logs in through the API and returns the token (faster than the form; the form has its own spec). */
export async function apiLogin(request: APIRequestContext, user: User): Promise<string> {
  const res = await request.post(`${API_URL}/api/login`, { data: { username: user, password: USERS[user] } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

export async function apiDecks(request: APIRequestContext, user: User): Promise<DeckInfo[]> {
  const token = await apiLogin(request, user);
  const res = await request.get(`${API_URL}/api/decks`, { headers: { authorization: `Bearer ${token}` } });
  return ((await res.json()) as { decks: DeckInfo[] }).decks;
}

/** Opens the app already signed in as `user` (the session is seeded into localStorage before the app loads). */
export async function openSignedIn(page: Page, request: APIRequestContext, user: User): Promise<void> {
  const token = await apiLogin(request, user);
  await page.addInitScript(([t, u]) => localStorage.setItem('flashmobile.auth', JSON.stringify({ token: t, user: u })), [token, user]);
  await page.goto('/');
}

/** The "n / total" button on the study card. */
export const counter = (page: Page) => page.getByRole('button', { name: 'Show the word list' }).filter({ hasText: /\d+\s*\/\s*\d+/ });

/** Deck screen -> Start -> study screen with the first card showing. */
export async function startStudy(page: Page): Promise<void> {
  await page.getByRole('button', { name: /始める/ }).click();
  await expect(page.getByRole('button', { name: 'Learned' })).toBeVisible();
}

export { expect, test };
