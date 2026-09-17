import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fromObject, type Cabinet } from '../../src/designer/model';
import {
  applianceDetails,
  type DetailBox,
} from '../../src/components/designer/render-details';

type Box = { w: number; h: number; d: number; x: number; y: number; z: number };

/** Every box an appliance builds, without building any geometry for it. */
function boxesOf(item: Cabinet) {
  const boxes: Box[] = [];
  const b = ((w, h, d, x, y, z) => {
    boxes.push({ w, h, d, x, y, z });
    return new THREE.Mesh();
  }) as DetailBox;
  const material = new THREE.MeshBasicMaterial();
  applianceDetails(new THREE.Group(), item, b, material, material, material);
  return boxes;
}

const AXES = [
  ['x', 'w', 'y', 'h', 'z', 'd'],
  ['y', 'h', 'x', 'w', 'z', 'd'],
  ['z', 'd', 'x', 'w', 'y', 'h'],
] as const;

/**
 * Two surfaces facing the same way, on the same plane, over the same
 * ground: the depth buffer has nothing to choose between them and the
 * renderer picks differently from frame to frame, which is seen as an
 * edge that flickers while the camera moves. It cannot be seen here -
 * software rendering resolves ties consistently - so it is measured from
 * the geometry instead.
 */
/** Is this point strictly within some box other than the two in hand? */
function inside(boxes: Box[], point: [number, number, number], skip: Box[]) {
  return boxes.some(
    (box) =>
      !skip.includes(box) &&
      point[0] > box.x - box.w / 2 + 0.05 &&
      point[0] < box.x + box.w / 2 - 0.05 &&
      point[1] > box.y - box.h / 2 + 0.05 &&
      point[1] < box.y + box.h / 2 - 0.05 &&
      point[2] > box.z - box.d / 2 + 0.05 &&
      point[2] < box.z + box.d / 2 - 0.05,
  );
}

function fighting(boxes: Box[], gap = 0.02) {
  const clashes: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        c = boxes[j];
      if (!a || !c) continue;
      for (const [axis, size, u, uSize, v, vSize] of AXES) {
        for (const side of [-1, 1]) {
          const faceA = a[axis] + (side * a[size]) / 2,
            faceC = c[axis] + (side * c[size]) / 2;
          if (Math.abs(faceA - faceC) > gap) continue;
          // Do they cover any of the same ground on the other two axes?
          const overlap = (
            first: Box,
            second: Box,
            along: 'x' | 'y' | 'z',
            span: 'w' | 'h' | 'd',
          ) =>
            Math.min(
              first[along] + first[span] / 2,
              second[along] + second[span] / 2,
            ) -
            Math.max(
              first[along] - first[span] / 2,
              second[along] - second[span] / 2,
            );
          if (
            overlap(a, c, u, uSize) <= 0.25 ||
            overlap(a, c, v, vSize) <= 0.25
          )
            continue;
          // Buried inside a third box, a tie is never drawn and never
          // seen: a carcass rail ending inside its own side panel is
          // built that way on purpose.
          const middle = (along: 'x' | 'y' | 'z', span: 'w' | 'h' | 'd') =>
            (Math.min(a[along] + a[span] / 2, c[along] + c[span] / 2) +
              Math.max(a[along] - a[span] / 2, c[along] - c[span] / 2)) /
            2;
          const index = { x: 0, y: 1, z: 2 } as const;
          const at: [number, number, number] = [0, 0, 0];
          at[index[axis]] = faceA;
          at[index[u]] = middle(u, uSize);
          at[index[v]] = middle(v, vSize);
          if (inside(boxes, at, [a, c])) continue;
          clashes.push(
            `${axis}${side > 0 ? '+' : '-'} faces at ${faceA.toFixed(3)} and ${faceC.toFixed(3)}`,
          );
        }
      }
    }
  return clashes;
}

test('no two appliance surfaces fight for the same depth', () => {
  for (const kind of [
    'refrigerator',
    'dishwasher',
    'range',
    'washing_machine',
  ] as const) {
    for (const style of [
      'single',
      'double',
      'french',
      'top_freezer',
    ] as const) {
      const item = { ...fromObject(kind), refrigeratorStyle: style };
      const clashes = fighting(boxesOf(item));
      assert.deepEqual(
        clashes,
        [],
        `${kind} (${style}) has surfaces on the same plane: ${clashes.join('; ')}`,
      );
    }
  }
});
