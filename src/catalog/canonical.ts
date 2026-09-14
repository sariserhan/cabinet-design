import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
/** Arrays retain their semantic order. Callers explicitly sort unordered entity collections. */
export function canonicalJson(value: unknown): string {
  function normalize(v: unknown): unknown {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return Object.is(v, -0) ? 0 : v;
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, val]) => [k, normalize(val)]));
    }
    throw new TypeError('Canonical JSON accepts only plain JSON values');
  }
  return JSON.stringify(normalize(value));
}
export function contentHash(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))));
}
