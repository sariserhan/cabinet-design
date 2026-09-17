import { defineConfig, devices } from '@playwright/test';

// Next 16 permits only one dev server per project directory, so locally these
// tests attach to whichever server is already running and only start one when
// none is up (as in CI). Point E2E_BASE_URL at any deployment to skip that.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  // Signing in and building a WebGL scene on a cold dev server both take longer
  // than the 30s default, which otherwise fires inside a single step.
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'public',
      testIgnore: /.*\.auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Signed-in specs authenticate per test; see tests/e2e/sign-in.ts.
    {
      name: 'authenticated',
      testMatch: /.*\.auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The same signed-in specs on the real GPU rather than SwiftShader,
    // for the faults only hardware shows: specular glitter, the
    // refinement gate, anything temporal. Asked for explicitly, because
    // it doubles the signed-in work and a plain `playwright test` should
    // not pay for it:
    //
    //   sg render -c "E2E_GPU=1 npx playwright test --project=gpu"
    //
    // `sg render` so the process can open the render node.
    ...(process.env.E2E_GPU
      ? [
          {
            name: 'gpu',
            testMatch: /.*\.auth\.spec\.ts/,
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: {
                args: ['--use-angle=vulkan', '--ignore-gpu-blocklist'],
              },
            },
          },
        ]
      : []),
  ],
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
