import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addWindowLighting } from '../../src/components/designer/render-lighting';
import { newDesign, fromObject } from '../../src/designer/model';

test('exterior windows direct area light inward and place the sun outside the opening', () => {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('window'),
      x: 30,
      y: 0,
      width: 40,
      depth: 4,
      elevation: 40,
      height: 40,
      rotation: 0,
    },
  ];
  const scene = new THREE.Scene(),
    sun = new THREE.DirectionalLight();
  addWindowLighting(scene, d, sun);
  const light = scene.children.find((o) => o instanceof THREE.RectAreaLight);
  assert.ok(light instanceof THREE.RectAreaLight);
  assert.ok(light.position.z > 4);
  assert.ok(sun.position.z < 0);
  assert.ok(sun.target.position.z > 0);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
    light.quaternion,
  );
  assert.ok(direction.z > 0.99);
  assert.equal(light.width, 36);
  assert.equal(light.height, 36);
});

test('partition windows do not create daylight and evening keeps low window intensity', () => {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('window'),
      opening: { hostId: 'partition', offset: 0, sill: 36 },
    },
  ];
  const scene = new THREE.Scene();
  addWindowLighting(scene, d, new THREE.DirectionalLight());
  assert.equal(scene.children.length, 0);
  d.items = [fromObject('window')];
  d.appearance = {
    lighting: 'daylight',
    countertop: 'quartz',
    lightingProfile: 'evening',
  };
  const sun = new THREE.DirectionalLight();
  addWindowLighting(scene, d, sun);
  const light = scene.children[0];
  assert.ok(light instanceof THREE.RectAreaLight);
  assert.ok(light.intensity < 1);
  assert.ok(sun.intensity < 1);
});
