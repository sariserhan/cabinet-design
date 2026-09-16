import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { doorFace, type DoorStyle } from '../../src/components/designer/render-details.js';
import {
  FRONT_DETAIL_BUDGET,
  MAX_DESIGN_ITEMS,
} from '../../src/designer/model.js';

type Part = { w: number; h: number; d: number; x: number; y: number; z: number };

/** Runs doorFace against a recording DetailBox, so geometry is testable headlessly. */
function build(style: DoorStyle, pw = 15, ph = 28) {
  const parts: Part[] = [];
  const m = {} as THREE.Material;
  doorFace(
    ((w, h, d, x, y, z) => {
      parts.push({ w, h, d, x, y, z });
      return {} as THREE.Mesh;
    }),
    style,
    pw,
    ph,
    0,
    0,
    0,
    m,
    m,
    m,
  );
  return parts;
}

test('a slab front is a single flat overlay panel', () => {
  const parts = build('slab');
  assert.equal(parts.length, 1);
  assert.deepEqual([parts[0]?.w, parts[0]?.h], [15, 28]);
});

test('shaker recesses the panel behind the frame face', () => {
  const parts = build('shaker');
  const frameFace = Math.max(...parts.map((p) => p.z + p.d / 2));
  // The centre panel is the thin part sitting on the door body.
  const panel = parts.find((p) => p.d === 0.2);
  assert.ok(panel, 'expected a recessed panel');
  assert.ok(
    panel.z + panel.d / 2 < frameFace,
    'shaker panel must sit behind the frame face',
  );
});

test('a raised panel field stands proud of the frame face', () => {
  const shakerPanel = build('shaker').find((p) => p.d === 0.2);
  const field = build('raised').find((p) => p.d === 0.45);
  assert.ok(shakerPanel, 'expected a shaker panel');
  assert.ok(field, 'expected a raised field');
  assert.ok(
    field.z + field.d / 2 > shakerPanel.z + shakerPanel.d / 2,
    'raised field must stand further forward than a shaker panel',
  );
});

test('stiles run full height and rails fit between them', () => {
  const parts = build('shaker', 15, 28);
  const [stile, otherStile] = parts.filter((p) => p.d === 0.3 && p.h === 28);
  assert.ok(stile && otherStile, 'expected two full-height stiles');
  const [rail] = parts.filter((p) => p.d === 0.3 && p.h !== 28);
  assert.ok(rail, 'expected a rail');
  assert.ok(
    rail.w <= 15 - 2 * stile.w + 1e-9,
    'rails must not overlap the stiles',
  );
});

test('narrow and short doors stay within their own outline', () => {
  for (const [pw, ph] of [
    [3, 4],
    [1, 1],
    [60, 90],
  ] as [number, number][]) {
    for (const style of ['shaker', 'slab', 'raised'] as DoorStyle[]) {
      for (const p of build(style, pw, ph)) {
        assert.ok(p.w > 0 && p.h > 0, `${style} ${pw}x${ph} produced a degenerate part`);
        assert.ok(
          Math.abs(p.x) + p.w / 2 <= pw / 2 + 0.6,
          `${style} ${pw}x${ph} part escapes the door width`,
        );
        assert.ok(
          Math.abs(p.y) + p.h / 2 <= ph / 2 + 0.6,
          `${style} ${pw}x${ph} part escapes the door height`,
        );
      }
    }
  }
});

test('the front detail budget stays below the item ceiling', () => {
  // If these ever cross, the simplification never engages and the largest
  // permitted design is the one that crashed the tab during measurement.
  assert.ok(
    FRONT_DETAIL_BUDGET < MAX_DESIGN_ITEMS,
    `budget ${FRONT_DETAIL_BUDGET} must be below the ${MAX_DESIGN_ITEMS} item ceiling`,
  );
});
