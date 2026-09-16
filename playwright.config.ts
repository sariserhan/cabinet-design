import { defineConfig, devices } from '@playwright/test';

// Next 16 permits only one dev server per project directory, so locally these
// tests attach to whichever server is already running and only start one when
// none is up (as in CI). Point E2E_BASE_URL at any deployment to skip that.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --port ${port}`,
          url: `${baseURL}/installer`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
});
