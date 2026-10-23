import { createHash, randomBytes } from 'node:crypto';

/**
 * Deterministically stringifies an object by sorting its keys recursively.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((key) => {
    const val = (value as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJson(val);
  });

  return '{' + entries.join(',') + '}';
}

/**
 * Computes deterministic SHA-256 hash of any input.
 */
export function computeSha256(data: unknown): string {
  const serialized = typeof data === 'string' ? data : canonicalJson(data);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Generates a collision-resistant unique ID with an optional prefix.
 */
export function generateId(prefix: string = 'node'): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}
