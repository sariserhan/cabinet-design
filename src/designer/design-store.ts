import { designSchema, type Design } from './model';

/**
 * Saved designs used to live in one localStorage key holding the whole array.
 * A 400-item design serialises to roughly 195 KB, so twenty of them is about
 * 3.8 MB against a typical 5 MB origin budget, before trade settings, scenes,
 * job records and backups take their share. IndexedDB is quota-limited against
 * free disk rather than a few megabytes, so the list lives there and
 * localStorage stays the fallback for browsers that refuse a database.
 */
export const MAX_SAVED_DESIGNS = 200;

/** The subset of IndexedDB this module needs, so tests can supply a fake. */
export type AsyncRecordStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export const savedKey = (ownerId: string) => `kitchen-designs:${ownerId}`;
/** The pre-IndexedDB location, still read once so existing work is not lost. */
export const legacySavedKey = (storageKey: string) => `${storageKey}:saved`;

const DB_NAME = 'kitchen-studio';
const STORE_NAME = 'records';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Returns null when IndexedDB is unavailable, e.g. blocked site data. */
export function browserRecordStore(): AsyncRecordStore | null {
  if (typeof indexedDB === 'undefined') return null;
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME))
          req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  const run = async <T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await open();
    try {
      return await request(body(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)));
    } finally {
      db.close();
    }
  };
  return {
    async get(key) {
      const value = await run<unknown>('readonly', (s) => s.get(key));
      return typeof value === 'string' ? value : null;
    },
    async set(key, value) {
      await run('readwrite', (s) => s.put(value, key));
    },
    async remove(key) {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}

/**
 * Validates a stored list. Unreadable entries are dropped rather than failing
 * the whole list, so one corrupt design cannot hide the other nineteen, and
 * later duplicates of an id win as they did when this was a Map over the array.
 */
export function parseSavedDesigns(raw: string | null): {
  designs: Design[];
  dropped: number;
} {
  if (!raw) return { designs: [], dropped: 0 };
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return { designs: [], dropped: 0 };
  }
  if (!Array.isArray(list)) return { designs: [], dropped: 0 };
  const byId = new Map<string, Design>();
  let dropped = 0;
  for (const entry of list.slice(0, MAX_SAVED_DESIGNS)) {
    const parsed = designSchema.safeParse(entry);
    if (parsed.success) byId.set(parsed.data.id, parsed.data);
    else dropped++;
  }
  return { designs: [...byId.values()], dropped: dropped + Math.max(0, list.length - MAX_SAVED_DESIGNS) };
}

/**
 * Reads the saved list, migrating a pre-IndexedDB localStorage array on first
 * run. The legacy key is only cleared once its contents are safely written, so
 * a failed migration leaves the original where the next attempt can find it.
 */
export async function loadSavedDesigns(args: {
  store: AsyncRecordStore | null;
  local: Pick<Storage, 'getItem' | 'removeItem'>;
  ownerId: string;
  storageKey: string;
}): Promise<{ designs: Design[]; dropped: number; migrated: boolean }> {
  const { store, local, ownerId, storageKey } = args;
  const legacyRaw = local.getItem(legacySavedKey(storageKey));
  if (store) {
    let current: string | null = null;
    try {
      current = await store.get(savedKey(ownerId));
    } catch {
      current = null;
    }
    if (current !== null) {
      // Already migrated. A legacy key surviving a previous crash is stale.
      return { ...parseSavedDesigns(current), migrated: false };
    }
    if (legacyRaw !== null) {
      const parsed = parseSavedDesigns(legacyRaw);
      try {
        await store.set(savedKey(ownerId), JSON.stringify(parsed.designs));
        local.removeItem(legacySavedKey(storageKey));
        return { ...parsed, migrated: true };
      } catch {
        return { ...parsed, migrated: false };
      }
    }
    return { designs: [], dropped: 0, migrated: false };
  }
  return { ...parseSavedDesigns(legacyRaw), migrated: false };
}

/**
 * Writes the list, preferring IndexedDB and falling back to localStorage. The
 * caller is told which happened, because the fallback reinstates the small
 * quota and a design that saved today can fail to save tomorrow.
 */
export async function persistSavedDesigns(args: {
  store: AsyncRecordStore | null;
  local: Pick<Storage, 'setItem'>;
  ownerId: string;
  storageKey: string;
  designs: Design[];
}): Promise<{ durable: boolean }> {
  const { store, local, ownerId, storageKey, designs } = args;
  const text = JSON.stringify(designs);
  if (store)
    try {
      await store.set(savedKey(ownerId), text);
      return { durable: true };
    } catch {
      // Fall through to localStorage rather than losing the save outright.
    }
  local.setItem(legacySavedKey(storageKey), text);
  return { durable: false };
}
