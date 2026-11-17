import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts: the tests are plain TypeScript logic and need none of the Vue/PWA plugins.
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } });
