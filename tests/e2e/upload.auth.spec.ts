import { test, expect } from './fixtures';
import path from 'node:path';

// Next buffers every request body because src/proxy.ts matches all routes, and
// that buffer silently keeps only its first N bytes when a body is larger. A
// truncated PDF still hashes cleanly, so it used to be stored as a valid-looking
// source. This asserts the stored SHA-256 is the real one for the 12 MB book,
// which is only true if every byte arrived.
const ALLURE_SHA_PREFIX = '18424d5f3fc49f84';

test('a 12 MB source uploads whole, not truncated by the proxy body buffer', async ({
  designer: page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/documents');
  await page.getByRole('button', { name: 'Upload PDF' }).click();

  const form = page.getByRole('dialog');
  await form.getByLabel('Manufacturer').fill('Fabuwood');
  await form.getByLabel('Series').fill('Allure');
  await form.getByLabel('Document version').fill('V.02.26.26');
  await form
    .getByLabel('PDF file')
    .setInputFiles(
      path.join(
        process.cwd(),
        'sources/fabuwood-allure/Allure_Spec_Book_02-26-26.pdf',
      ),
    );
  await form.getByRole('button', { name: 'Upload', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'Compile a representative subset' }),
  ).toBeVisible({ timeout: 120_000 });
  // The documents table renders the first 16 hex characters of the stored hash.
  await expect(page.getByText(ALLURE_SHA_PREFIX).first()).toBeVisible({
    timeout: 60_000,
  });
});
