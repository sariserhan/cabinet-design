import { test, expect } from '@playwright/test';

// The public catalog route serves the pinned source PDFs the designer links to.
test('public catalog source serves a pinned PDF', async ({ request }) => {
  const response = await request.get(
    '/api/public-catalog-source?series=allure',
  );
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('an unknown series is a clean 404, not a path escape', async ({
  request,
}) => {
  for (const series of ['nope', '../../package.json', '']) {
    const response = await request.get(
      `/api/public-catalog-source?series=${encodeURIComponent(series)}`,
    );
    expect(response.status()).toBe(404);
  }
});
