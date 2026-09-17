import { expect, type Page } from '@playwright/test';

// Deliberately obvious as a test identity so it is recognisable in whatever
// deployment it reaches. Override for a shared environment.
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-automation-pw-1';

/**
 * One account per worker. Convex Auth rotates refresh tokens, so two workers
 * signing into the same account race and the loser is bounced back to the
 * sign-in screen. Separate identities remove the race entirely.
 */
function emailFor(worker: number | string) {
  const base = process.env.E2E_EMAIL ?? 'e2e-automation@example.test';
  const [name, domain] = base.split('@');
  return `${name}+w${String(worker).replace(/[^a-z0-9-]/gi, '')}@${domain}`;
}

/**
 * Opens the designer as the end-to-end account, creating it on the first run.
 * Called once per worker by the `signedIn` fixture; see fixtures.ts for why a
 * saved storageState is not used.
 */
export async function signInToDesigner(page: Page, worker: number | string = 0) {
  const EMAIL = emailFor(worker);
  await page.goto('/designer');
  // The shell renders this as soon as auth resolves, well before the designer
  // itself has mounted, which makes it the right signal for "am I signed in".
  const authed = page.getByRole('button', { name: 'Sign out' });

  const fill = async (withName: boolean) => {
    if (withName)
      await page.getByLabel('Name').fill(`E2E automation ${worker}`);
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
  };

  await expect(page.getByLabel('Email')).toBeVisible({ timeout: 30_000 });
  await fill(false);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // The first ever run has no account, so fall back to creating one. Only do so
  // while the form is still on screen: a slow sign-in must not be mistaken for a
  // missing account, or the run fails on an account that already exists.
  const stillOnForm = async () =>
    !(await authed.isVisible({ timeout: 40_000 }).catch(() => false)) &&
    (await page
      .getByLabel('Email')
      .isVisible()
      .catch(() => false));
  if (await stillOnForm()) {
    await page.getByRole('button', { name: 'Create an account' }).click();
    await fill(true);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
  }
  await expect(authed).toBeVisible({ timeout: 45_000 });

  // The workspace mounts in stages as the design loads; wait for the default 2D
  // stage so a test does not click a control that is about to be replaced.
  await expect(
    page.getByRole('button', { name: /hide library/i }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.plan-scroll')).toBeVisible({ timeout: 60_000 });
}
