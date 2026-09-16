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
    await expect(page.locator('.designer-render [role="alert"]')).toHaveCount(
      0,
    );
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
  await expect(page.getByLabel('Project name')).toBeVisible({
    timeout: 60_000,
  });
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

  // Locked is the default. Unlock first, prove editing works, then lock again
  // and prove it stops. Done in that order because a drag attempt while locked
  // is an orbit, which would move the camera off the point being aimed at.
  await page.getByRole('button', { name: /Items locked/i }).click();
  await expect(
    page.getByRole('button', { name: /Items editable/i }),
  ).toBeVisible();
  // page.mouse works in viewport coordinates and does not scroll to its target,
  // and the hint line changes height with the lock, so measure after unlocking.
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const live = await canvas.boundingBox();
  expect(live).not.toBeNull();
  const open = live ?? { x: 0, y: 0, width: 0, height: 0 };
  const sx = open.x + open.width * 0.2,
    sy = open.y + open.height * 0.75;

  const start = await draft();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('r');
  await page.waitForTimeout(7000);
  const turned = await draft();
  expect(changed(start, turned, 'rotation')).toBe(true);

  // Dragging starts on a point known to sit on a base cabinet run.
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
  const deleted = await draft();
  expect(deleted.length).toBe(dragged.length - 1);

  // Lock again: the same keys must now do nothing at all.
  await page.getByRole('button', { name: /Items editable/i }).click();
  await expect(
    page.getByRole('button', { name: /Items locked/i }),
  ).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('r');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(7000);
  const afterLock = await draft();
  expect(afterLock.length).toBe(deleted.length);
  expect(changed(deleted, afterLock, 'x')).toBe(false);
  expect(changed(deleted, afterLock, 'rotation')).toBe(false);

  expect(pageErrors).toEqual([]);
});

test('a band selects several items, which then move, turn and delete as one', async ({
  designer: page,
  pageErrors,
}) => {
  /** The saved draft: what any selection gesture ultimately has to change. */
  async function items() {
    const rows = await page.evaluate(() => {
      const key = Object.keys(localStorage).filter((k) =>
        k.endsWith(':draft'),
      )[0];
      const value = key ? localStorage.getItem(key) : null;
      if (!value) return null;
      return (
        JSON.parse(value) as {
          items: { id: string; x: number; y: number; rotation: number }[];
        }
      ).items.map((i) => ({ id: i.id, x: i.x, y: i.y, rotation: i.rotation }));
    });
    expect(rows, 'expected a saved draft to read').not.toBeNull();
    return rows ?? [];
  }

  /** Plan inches to viewport pixels, the mapping the canvas itself uses. */
  async function at(x: number, y: number) {
    const point = await page.evaluate(
      ([ux, uy]) => {
        const svg = document.querySelector<SVGSVGElement>('.plan-svg');
        const matrix = svg?.getScreenCTM();
        if (!svg || !matrix || ux === undefined || uy === undefined)
          return null;
        const p = svg.createSVGPoint();
        p.x = ux;
        p.y = uy;
        const t = p.matrixTransform(matrix);
        return { x: t.x, y: t.y };
      },
      [x, y],
    );
    expect(point, 'expected the plan to be on screen').not.toBeNull();
    return point ?? { x: 0, y: 0 };
  }

  await page.evaluate(() =>
    document.querySelectorAll('details').forEach((d) => (d.open = true)),
  );
  await page.getByRole('button', { name: 'Load presentation kitchen' }).click();
  await page.waitForTimeout(6000);
  await page.getByRole('button', { name: /2D plan/i }).click();
  await page.locator('.plan-svg').scrollIntoViewIfNeeded();

  // A band around the island, in room inches rather than screen fractions, so
  // the test says which items it means: the three island cabinets and the
  // countertop over them, clear of the perimeter run.
  const from = await at(60, 90),
    to = await at(165, 150);
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++)
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / 10,
      from.y + ((to.y - from.y) * step) / 10,
    );
  await page.mouse.up();
  await page.keyboard.up('Shift');

  // The band is drawn only while the pointer is down.
  await expect(page.locator('[data-testid="selection-band"]')).toHaveCount(0);
  const banner = page.locator('.designer-message');
  await expect(banner).toContainText(/\d+ items selected/, { timeout: 20_000 });
  const count = Number(
    (await banner.textContent())?.match(/(\d+) items selected/)?.[1] ?? 0,
  );
  expect(count).toBeGreaterThan(1);

  // Every selected item moves by the same amount, which is what makes this a
  // group move rather than a nudge of whichever item had focus.
  // Dragging one member carries the rest: the whole point of selecting a
  // group before moving it. Snapping decides the exact distance, so what
  // matters is that every member travels the same way.
  const grabbed = await items();
  const grab = await at(112, 115),
    drop = await at(132, 115);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++)
    await page.mouse.move(grab.x + ((drop.x - grab.x) * step) / 10, grab.y);
  await page.mouse.up();
  await expect(banner).toContainText(/items moved/, { timeout: 20_000 });
  await expect
    .poll(
      async () => {
        const after = await items();
        const deltas = after
          .map((row, index) => row.x - (grabbed[index]?.x ?? 0))
          .filter((d) => d !== 0);
        return deltas.length > 1 && new Set(deltas).size === 1
          ? deltas.length
          : 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(1);

  // The draft is saved on a debounce, so each step polls the stored design
  // instead of reading it the moment the status line changes.
  const before = await items();
  await page.keyboard.press('ArrowRight');
  await expect(banner).toContainText(/items moved/, { timeout: 20_000 });
  await expect
    .poll(
      async () =>
        (await items()).filter(
          (row, index) => row.x - (before[index]?.x ?? 0) === 1,
        ).length,
      { timeout: 30_000 },
    )
    .toBeGreaterThan(1);
  const moved = await items();
  expect(moved.filter((row, i) => row.y !== before[i]?.y)).toHaveLength(0);

  await page.keyboard.press('r');
  await expect(banner).toContainText(/turned 90° as one group/, {
    timeout: 20_000,
  });
  await expect
    .poll(
      async () =>
        (await items()).filter((row, i) => row.rotation !== moved[i]?.rotation)
          .length,
      { timeout: 30_000 },
    )
    .toBeGreaterThan(1);
  const turned = await items();

  await page.keyboard.press('Delete');
  await expect(banner).toContainText(/items deleted/, { timeout: 20_000 });
  await expect
    .poll(async () => (await items()).length, { timeout: 30_000 })
    .toBeLessThan(turned.length);

  expect(pageErrors).toEqual([]);
});

test('Help opens a guide over the workspace and closes again', async ({
  designer: page,
  pageErrors,
}) => {
  const guide = page.locator('dialog.help-guide');
  await expect(guide).toBeHidden();

  // In the header, not behind a collapsed section: the point of the change.
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole('heading', { name: 'How to use Kitchen Studio' }),
  ).toBeVisible();
  // A modal dialog, so the workspace behind it is inert.
  expect(await guide.evaluate((node: HTMLDialogElement) => node.open)).toBe(
    true,
  );
  await expect(guide).toContainText('Shift + click');
  await expect(guide.locator('.help-guide-keys tr')).not.toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();

  // The conventional shortcut reopens it without reaching for the button.
  await page.keyboard.press('?');
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Close help' }).click();
  await expect(guide).toBeHidden();

  expect(pageErrors).toEqual([]);
});
