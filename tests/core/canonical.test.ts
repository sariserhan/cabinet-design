import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, contentHash } from '../../src/catalog/canonical.js';

test('object-key order does not affect canonical JSON or hashes', () => {
  assert.equal(canonicalJson({ b: { y: 2, x: 1 }, a: 1 }), canonicalJson({ a: 1, b: { x: 1, y: 2 } }));
  assert.equal(contentHash({ b: 2, a: 1 }), contentHash({ a: 1, b: 2 }));
});
test('arrays retain meaningful order and unsupported values are rejected', () => {
  assert.notEqual(contentHash([1, 2]), contentHash([2, 1]));
  for (const value of [undefined, NaN, Infinity, new Date(), { a: undefined }]) assert.throws(() => canonicalJson(value), TypeError);
});
