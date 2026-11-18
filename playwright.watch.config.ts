import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/* Same tests, but a visible browser and a pause after every action so you can follow along: npm run e2e:watch */
export default defineConfig(base, {
  timeout: 90_000, // slowMo makes every test longer
  use: { headless: false, launchOptions: { slowMo: 600 } }
});
