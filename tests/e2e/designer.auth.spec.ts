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

test('the flooring workspace offers the deduction the design can derive', async ({
  designer: page,
  pageErrors,
}) => {
  await page.evaluate(() =>
    document.querySelectorAll('details').forEach((d) => (d.open = true)),
  );
  await page.getByRole('button', { name: 'Load presentation kitchen' }).click();
  await page.waitForTimeout(5000);
  await page.evaluate(() =>
    document.querySelectorAll('details').forEach((d) => (d.open = true)),
  );
  await page.getByRole('button', { name: 'Flooring', exact: true }).click();

  const suggestion = page.locator('.trade-suggestion').first();
  await expect(suggestion).toContainText(/sq ft of floor covered/i, {
    timeout: 30_000,
  });
  // Offered, not applied, until the button is used.
  await suggestion.getByRole('button').click();
  await expect(suggestion).toContainText(/entered deduction matches it/i, {
    timeout: 30_000,
  });
  expect(pageErrors).toEqual([]);
});

test('an item can be nudged, rotated, dragged in 3D and deleted', async ({
  designer: page,
  pageErrors,
}) => {
  type Row = { id: string; x: number; y: number; rotation: number };
  /** The saved draft, which is what the shortcuts ultimately have to change. */
  async function draft(): Promise<Row[]> {
    const rows = await page.evaluate(() => {
      const key = Object.keys(localStorage).filter((k) =>
        k.endsWith(':draft'),
      )[0];
      const value = key ? localStorage.getItem(key) : null;
      if (!value) return null;
      const design = JSON.parse(value) as {
        items: { id: string; x: number; y: number; rotation: number }[];
      };
      return design.items.map((i) => ({
        id: i.id,
        x: i.x,
        y: i.y,
        rotation: i.rotation,
      }));
    });
    expect(rows, 'expected a saved draft to read').not.toBeNull();
    return rows ?? [];
  }
  /** True when any row differs, which is all these assertions need to know. */
  const changed = (before: Row[], after: Row[], field: keyof Row) =>
    before.some((row, index) => after[index]?.[field] !== row[field]);

  await page.evaluate(() =>
    document.querySelectorAll('details').forEach((d) => (d.open = true)),
  );
  await page.getByRole('button', { name: 'Load presentation kitchen' }).click();
  await page.waitForTimeout(6000);

  // Select in the 2D plan, where the target is unambiguous, then work in 3D so
  // the shared shortcut layer is what is under test.
  await page.getByRole('button', { name: /2D plan/i }).click();
  await page
    .locator('g[aria-label*="placed object"]')
    .first()
    .click({ force: true });
  await page.getByRole('button', { name: 'Render', exact: true }).click();
  const canvas = page.locator('.render-stage canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6000);
  // page.mouse works in viewport coordinates and does not scroll to the target.
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const { x, y, width, height } = box ?? { x: 0, y: 0, width: 0, height: 0 };

  const start = await draft();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('r');
  await page.waitForTimeout(7000);
  const turned = await draft();
  expect(changed(start, turned, 'rotation')).toBe(true);

  // Dragging starts on a point known to sit on a base cabinet run.
  const sx = x + width * 0.2,
    sy = y + height * 0.75;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(sx + i * 10, sy - i * 2);
  await page.mouse.up();
  await page.waitForTimeout(7000);
  const dragged = await draft();
  expect(changed(turned, dragged, 'x') || changed(turned, dragged, 'y')).toBe(
    true,
  );

  await page.keyboard.press('Delete');
  await page.waitForTimeout(7000);
  expect((await draft()).length).toBe(dragged.length - 1);
  expect(pageErrors).toEqual([]);
});
