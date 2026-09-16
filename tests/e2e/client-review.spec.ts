import { test, expect } from '@playwright/test';

// Review links carry their token in the URL fragment so it never reaches a
// server log. A missing or malformed token must fail closed and stay quiet.
test('client review without a token renders without errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/client-review');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a malformed review token is refused and never queried', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/client-review#not-a-valid-token');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toEqual([]);
});
