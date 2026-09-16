import { test, expect } from '@playwright/test';
import { newDesign, fromObject } from '../../src/designer/model';
import { handoffPackage } from '../../src/designer/installer-handoff';

// The installer workspace is the one signed-out surface that does real work:
// it opens a handoff file, edits it in the tab and exports a site report.
test('installer opens a handoff file and reports its contents', async ({
  page,
}) => {
  const design = {
    ...newDesign(),
    name: 'Site survey kitchen',
    items: [
      { ...fromObject('custom_cabinet'), id: 'a', x: 10, y: 10 },
      { ...fromObject('sink'), id: 'b', x: 60, y: 10 },
    ],
  };

  await page.goto('/installer');
  await expect(
    page.getByRole('heading', { name: 'Installer workspace' }),
  ).toBeVisible();

  await page.getByLabel('Open installer handoff').setInputFiles({
    name: 'handoff.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(handoffPackage(design))),
  });

  await expect(page.getByRole('status').first()).toHaveText('Handoff opened.');
  await expect(
    page.getByRole('heading', { name: 'Site survey kitchen' }),
  ).toBeVisible();
  await expect(page.getByText('2 items')).toBeVisible();
});

test('installer rejects a file that is not a handoff, without crashing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/installer');
  await page.getByLabel('Open installer handoff').setInputFiles({
    name: 'not-a-handoff.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"something-else"}'),
  });

  await expect(page.getByRole('status').first()).not.toHaveText(
    'Handoff opened.',
  );
  await expect(
    page.getByRole('heading', { name: 'Installer workspace' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
