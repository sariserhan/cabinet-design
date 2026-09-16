import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// One shared account and one shared signed-in page, so these run in order.
test.describe.configure({ mode: 'serial' });

// The safety net for refactoring the 3D scene builder: it asserts the renderer
// actually produced an image, which type-checking and unit tests cannot. A
// scene that silently stops drawing shows up here as a uniform canvas.

/** Number of distinct colours in the WebGL canvas, sampled on a 64x64 grid. */
async function canvasColours(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`${sel} canvas`);
    if (!canvas) return -1;
    const off = document.createElement('canvas');
    off.width = 64;
    off.height = 64;
    const ctx = off.getContext('2d');
    if (!ctx) return -1;
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4)
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return seen.size;
  }, selector);
}

test('the 2D plan and 3D preview draw geometry', async ({
  designer: page,
  pageErrors,
}) => {
  // Both are SVG; only the Render view uses WebGL.
  expect(await page.locator('.plan-svg > *').count()).toBeGreaterThan(5);

  await page.getByRole('button', { name: /3D preview/i }).click();
  await expect(page.locator('.preview-svg')).toBeVisible({ timeout: 30_000 });
  expect(await page.locator('.preview-svg > *').count()).toBeGreaterThan(5);
  expect(pageErrors).toEqual([]);
});

test('the Render view builds a WebGL scene without falling back to an error', async ({
  designer: page,
  pageErrors,
}) => {
  await page.getByRole('button', { name: 'Render', exact: true }).click();
  await expect(page.locator('.render-stage canvas')).toBeVisible({
    timeout: 60_000,
  });

  // A refactor that breaks the scene usually surfaces first as the component's
  // own WebGL alert, or as a canvas that draws a single flat colour.
  await expect(page.locator('.designer-render [role="alert"]')).toHaveCount(0);
  await expect
    .poll(() => canvasColours(page, '.render-stage'), { timeout: 60_000 })
    .toBeGreaterThan(3);
  expect(pageErrors).toEqual([]);
});

test('enlarging the canvas keeps the tools and grows the stage', async ({
  designer: page,
}) => {
  // Tall enough that filling the window is an improvement on the fixed stage
  // height; the CSS floor covers shorter windows.
  await page.setViewportSize({ width: 1280, height: 1100 });
  const stage = page.locator('.plan-scroll');
  const before = (await stage.boundingBox())?.height ?? 0;
  expect(before).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Enlarge canvas' }).click();
  await expect(page.locator('.designer-app.canvas-expanded')).toBeVisible();

  // Taller than the fixed 490px, and the editing tools survive the switch.
  await expect
    .poll(async () => (await stage.boundingBox())?.height ?? 0)
    .toBeGreaterThan(before);
  await expect(
    page.getByRole('button', { name: /hide library/i }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /2D plan/i })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.designer-app.canvas-expanded')).toHaveCount(0);
});

test('each door style rebuilds the scene and keeps it drawing', async ({
  designer: page,
  pageErrors,
}) => {
  await page.getByRole('button', { name: 'Render', exact: true }).click();
  await expect(page.locator('.render-stage canvas')).toBeVisible({
    timeout: 60_000,
  });
  // The styling controls live on the inspector's Materials tab.
  await page.getByRole('tab', { name: 'Materials' }).click();
  const style = page.getByLabel('Door style');
  await expect(style).toBeVisible({ timeout: 30_000 });
  for (const option of ['slab', 'raised', 'shaker']) {
    await style.selectOption(option);
    // A door builder that throws leaves the stage blank or raises its alert.
    await expect(page.locator('.designer-render [role="alert"]')).toHaveCount(0);
    await expect
      .poll(() => canvasColours(page, '.render-stage'), { timeout: 60_000 })
      .toBeGreaterThan(3);
  }
  expect(pageErrors).toEqual([]);
});

test('saved designs persist in IndexedDB and survive a reload', async ({
  designer: page,
  pageErrors,
}) => {
  const name = `Store check ${Date.now()}`;
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: /Save design/i }).click();
  await expect(page.getByText(/Design saved in this browser/i)).toBeVisible({
    timeout: 20_000,
  });

  // The whole point of the change: the list is a database record, not a
  // localStorage string competing with every other record for ~5 MB.
  const stored = await page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open('kitchen-studio', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction('records', 'readonly');
          const all = tx.objectStore('records').getAll();
          all.onsuccess = () =>
            resolve(all.result.length ? String(all.result[0]) : null);
          all.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );
  expect(stored).toContain(name);

  await page.reload();
  await expect(page.getByLabel('Project name')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('option', { name })).toBeAttached({
    timeout: 30_000,
  });
  expect(pageErrors).toEqual([]);
});
