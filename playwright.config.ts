import { defineConfig, devices } from '@playwright/test';

/*
 * End-to-end tests against the REAL server (no mocks): the config starts the server in local mode
 * (AUTH=local, progress in memory, no Google Sheet / ElevenLabs) on its own ports, then the Vite client.
 * Data comes from ../server/data-local/*.sqlite (copies of LCT's dictionaries).
 */
const API_PORT = 8799;
const WEB_PORT = 5199;
export const API_URL = `http://localhost:${API_PORT}`;
export const USERS = { alice: 'pw1', bob: 'pw2' } as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one shared in-memory server: tests run one after another
  workers: 1,
  retries: 0,
  timeout: 60_000, // Vite compiles on demand: the first test of a run (and any test that opens a screen for the first time) can take 30 s+
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'en-US', // the app picks Vietnamese for vi-* browsers; the tests read the English texts
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Pixel 7']
  },
  projects: [
    // a phone (touch): every spec except the desktop one
    { name: 'mobile-chromium', use: { browserName: 'chromium' }, testIgnore: /desktop\.spec\.ts/ },
    // a desktop browser (mouse, hover, wide window): only the desktop spec - hover colours, side-by-side kanji, word-list columns
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1700, height: 900 } }, testMatch: /desktop\.spec\.ts/ }
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: '../server',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        USER_DICT_PATH: './data-local/user-dict.sqlite',
        DICT_PATH: './data-local/vianiq-dict.sqlite',
        CORS_ORIGIN: '*',
        AUTH: 'local',
        AUTH_SECRET: 'e2e-secret-at-least-16-chars',
        LOCAL_USERS: Object.entries(USERS)
          .map(([u, p]) => `${u}:${p}`)
          .join(',')
      }
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      // Voice files live on their own host in production; the tests keep them on this dev server, where the route mocks are.
      env: { VITE_API_URL: API_URL, VITE_LOGIN: 'true', VITE_API_KEY: '', VITE_VOICES_URL: '/voices/' }
    }
  ]
});
