import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL, USERS } from '../playwright.config';

export type User = keyof typeof USERS;

export interface DeckInfo {
  id: string;
  name: string;
  total: number;
  counts: { new: number; learning: number; learned: number; skipped: number };
}

/* The server limits /api/login to 10 per minute, so each user logs in once per run and the token is reused. */
const tokens = new Map<User, string>();

/** Logs in through the API (faster than the form; the form has its own spec). */
export async function apiLogin(request: APIRequestContext, user: User): Promise<string> {
  const cached = tokens.get(user);
  if (cached) return cached;
  const res = await request.post(`${API_URL}/api/login`, { data: { username: user, password: USERS[user] } });
  expect(res.ok(), `login of ${user} answered ${res.status()}`).toBeTruthy();
  const token = ((await res.json()) as { token: string }).token;
  tokens.set(user, token);
  return token;
}

export async function apiDecks(request: APIRequestContext, user: User): Promise<DeckInfo[]> {
  const token = await apiLogin(request, user);
  const res = await request.get(`${API_URL}/api/decks`, { headers: { authorization: `Bearer ${token}` } });
  return ((await res.json()) as { decks: DeckInfo[] }).decks;
}

/** One deck's current counts for a user. */
export async function apiDeck(request: APIRequestContext, user: User, id: string): Promise<DeckInfo> {
  return (await apiDecks(request, user)).find((d) => d.id === id)!;
}

/** The deck with the most new + learning cards: studying it does not run dry after a test or two. */
export async function richestDeck(request: APIRequestContext, user: User): Promise<DeckInfo | undefined> {
  const open = (d: DeckInfo): number => d.counts.new + d.counts.learning;
  return (await apiDecks(request, user)).sort((a, b) => open(b) - open(a))[0];
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opens the app already signed in as `user` (the session is seeded into localStorage before the app loads). */
export async function openSignedIn(page: Page, request: APIRequestContext, user: User): Promise<void> {
  const token = await apiLogin(request, user);
  await page.addInitScript(([t, u]) => localStorage.setItem('flashmobile.auth', JSON.stringify({ token: t, user: u })), [token, user]);
  await page.goto('/');
}

/** The "n / total" button on the study card. */
export const counter = (page: Page) => page.getByRole('button', { name: 'Show the word list' }).filter({ hasText: /\d+\s*\/\s*\d+/ });

/** Deck screen -> pick the deck -> Start -> study screen with the first card showing. */
export async function startStudy(page: Page, deck: DeckInfo): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${escapeRegex(deck.name)} \\d+ cards`) }).click();
  await page.getByRole('button', { name: /始める/ }).click();
  await expect(page.getByRole('button', { name: 'Learned' })).toBeVisible();
}

export { expect, test };
