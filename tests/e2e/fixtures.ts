import { test as base, expect, type Page } from '@playwright/test';
import { signInToDesigner } from './sign-in';

/**
 * A signed-in designer page, created once per worker.
 *
 * Convex Auth rotates refresh tokens, so every fresh sign-in for the same
 * account invalidates the sessions before it. Signing in once per worker and
 * reusing the page keeps a run stable; `pageErrors` is reset per test so each
 * one only sees what it caused.
 */
export const test = base.extend<
  { designer: Page; pageErrors: string[] },
  { signedIn: Page }
>({
  signedIn: [
    async ({ browser }, use, workerInfo) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signInToDesigner(page, workerInfo.workerIndex);
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
  designer: async ({ signedIn }, use) => {
    await signedIn.setViewportSize({ width: 1280, height: 900 });
    const mounted = signedIn
      .getByRole('button', { name: /hide library/i })
      .first();
    await signedIn.goto('/designer');
    // The Convex socket occasionally does not resume after a heavy WebGL test
    // and the shell sits on "Loading workspace"; one reload clears it.
    if (!(await mounted.isVisible({ timeout: 40_000 }).catch(() => false)))
      await signedIn.reload();
    await expect(mounted).toBeVisible({ timeout: 60_000 });
    await expect(signedIn.locator('.plan-scroll')).toBeVisible({
      timeout: 60_000,
    });
    await use(signedIn);
  },
  pageErrors: async ({ signedIn }, use) => {
    const errors: string[] = [];
    const listener = (error: Error) => errors.push(error.message);
    signedIn.on('pageerror', listener);
    await use(errors);
    signedIn.off('pageerror', listener);
  },
});

export { expect };
