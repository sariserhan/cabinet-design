import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SAVED_DESIGNS,
  loadSavedDesigns,
  parseSavedDesigns,
  persistSavedDesigns,
  legacySavedKey,
  savedKey,
  type AsyncRecordStore,
} from '../../src/designer/design-store.js';
import { newDesign } from '../../src/designer/model.js';

const OWNER = 'owner-1';
const KEY = `kitchen:${OWNER}`;

function fakeStore(seed: Record<string, string> = {}, failOn?: 'set' | 'get') {
  const data = new Map(Object.entries(seed));
  const store: AsyncRecordStore = {
    get: async (k) => {
      if (failOn === 'get') throw new Error('blocked');
      return data.get(k) ?? null;
    },
    set: async (k, v) => {
      if (failOn === 'set') throw new Error('quota');
      data.set(k, v);
    },
    remove: async (k) => void data.delete(k),
  };
  return { store, data };
}

function fakeLocal(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const design = (id: string) => ({ ...newDesign(), id, name: id });

test('a corrupt entry is dropped without hiding the designs beside it', () => {
  const raw = JSON.stringify([design('a'), { not: 'a design' }, design('b')]);
  const { designs, dropped } = parseSavedDesigns(raw);
  assert.deepEqual(
    designs.map((d) => d.id),
    ['a', 'b'],
  );
  assert.equal(dropped, 1);
});

test('unreadable or non-array storage yields an empty list rather than throwing', () => {
  for (const raw of ['not json', '{"a":1}', 'null', null]) {
    const { designs } = parseSavedDesigns(raw);
    assert.deepEqual(designs, []);
  }
});

test('a localStorage list migrates into the database exactly once', async () => {
  const { store, data } = fakeStore();
  const local = fakeLocal({
    [legacySavedKey(KEY)]: JSON.stringify([design('a'), design('b')]),
  });
  const first = await loadSavedDesigns({ store, local, ownerId: OWNER, storageKey: KEY });
  assert.equal(first.migrated, true);
  assert.deepEqual(first.designs.map((d) => d.id), ['a', 'b']);
  // The legacy copy is cleared only after the database write succeeded.
  assert.equal(local.getItem(legacySavedKey(KEY)), null);
  assert.ok(data.has(savedKey(OWNER)));

  const second = await loadSavedDesigns({ store, local, ownerId: OWNER, storageKey: KEY });
  assert.equal(second.migrated, false);
  assert.deepEqual(second.designs.map((d) => d.id), ['a', 'b']);
});

test('a failed migration leaves the original list where the next attempt finds it', async () => {
  const { store } = fakeStore({}, 'set');
  const local = fakeLocal({
    [legacySavedKey(KEY)]: JSON.stringify([design('a')]),
  });
  const result = await loadSavedDesigns({ store, local, ownerId: OWNER, storageKey: KEY });
  assert.equal(result.migrated, false);
  assert.deepEqual(result.designs.map((d) => d.id), ['a']);
  assert.ok(local.getItem(legacySavedKey(KEY)), 'legacy copy must survive');
});

test('without a database the list still loads and saves through localStorage', async () => {
  const local = fakeLocal({
    [legacySavedKey(KEY)]: JSON.stringify([design('a')]),
  });
  const loaded = await loadSavedDesigns({ store: null, local, ownerId: OWNER, storageKey: KEY });
  assert.deepEqual(loaded.designs.map((d) => d.id), ['a']);

  const written = await persistSavedDesigns({
    store: null,
    local,
    ownerId: OWNER,
    storageKey: KEY,
    designs: [design('a'), design('b')],
  });
  // The caller is told the small quota is back in play.
  assert.equal(written.durable, false);
  assert.equal(parseSavedDesigns(local.getItem(legacySavedKey(KEY))).designs.length, 2);
});

test('a database write that fails falls back to localStorage rather than losing the save', async () => {
  const { store } = fakeStore({}, 'set');
  const local = fakeLocal();
  const written = await persistSavedDesigns({
    store,
    local,
    ownerId: OWNER,
    storageKey: KEY,
    designs: [design('a')],
  });
  assert.equal(written.durable, false);
  assert.deepEqual(
    parseSavedDesigns(local.getItem(legacySavedKey(KEY))).designs.map((d) => d.id),
    ['a'],
  );
});

test('a successful database write reports a durable save and does not touch localStorage', async () => {
  const { store, data } = fakeStore();
  const local = fakeLocal();
  const written = await persistSavedDesigns({
    store,
    local,
    ownerId: OWNER,
    storageKey: KEY,
    designs: [design('a')],
  });
  assert.equal(written.durable, true);
  assert.equal(local.getItem(legacySavedKey(KEY)), null);
  assert.ok(data.has(savedKey(OWNER)));
});

test('the stored list is capped and the overflow is reported', () => {
  const many = Array.from({ length: MAX_SAVED_DESIGNS + 5 }, (_, i) => design(`d${i}`));
  const { designs, dropped } = parseSavedDesigns(JSON.stringify(many));
  assert.equal(designs.length, MAX_SAVED_DESIGNS);
  assert.equal(dropped, 5);
});

test('designs of different owners do not share a key', () => {
  assert.notEqual(savedKey('a'), savedKey('b'));
});
