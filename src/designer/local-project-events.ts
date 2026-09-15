export function projectDataChanged() {
  window.dispatchEvent(new Event('kitchen-project-data'));
}
export function writeLocalBatch(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  entries: [string, string | null][],
) {
  const previous = entries.map(([key]) => [key, storage.getItem(key)] as const);
  try {
    for (const [key, value] of entries) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch (error) {
    for (const [key, value] of previous.reverse()) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        /* Preserve original storage error. */
      }
    }
    throw error;
  }
}
