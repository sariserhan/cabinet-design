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
      // parallelIndex, not workerIndex: the latter increments when a worker is
      // replaced, so a single restart would sign up a brand new account through
      // the slow creation path instead of reusing the one for this slot.
      await signInToDesigner(page, workerInfo.parallelIndex);
      await use(page);
      await context.close();
    },
    // Sign-in has its own budget rather than borrowing the first test's 120s:
    // its staged waits can exceed that on a cold or loaded dev server, and the
    // failure then looks like whichever test happened to run first.
    { scope: 'worker', timeout: 300_000 },
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
