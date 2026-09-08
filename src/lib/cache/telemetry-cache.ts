/**
 * Lightweight server-side TTL in-memory cache.
 *
 * Purpose: Avoid re-running expensive operations (PowerShell SMART queries,
 * recursive fs.stat scans) on every page load. Cached entries are served
 * instantly and expire automatically after a configurable TTL.
 *
 * This module is intentionally dependency-free (pure Node.js Map + Date.now).
 * It lives at the module level so the cache persists across hot-reload-safe
 * Server Action invocations within the same Node.js process lifetime.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TelemetryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Returns the cached value for `key` if it exists and has not expired.
   * Returns `undefined` on a miss or expired entry.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Stores `value` under `key` with a TTL of `ttlMs` milliseconds.
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Removes a cached entry immediately (e.g. after a mutation).
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Removes all entries — useful for a full forced rescan.
   */
  invalidateAll(): void {
    this.store.clear();
  }
}

// Singleton instance — shared across all Server Action calls in the same process.
export const telemetryCache = new TelemetryCache();

// Cache key constants — centralised to avoid typo-driven cache misses.
export const CACHE_KEYS = {
  /** Windows SMART + volume label disk info — 30 s TTL */
  SMART_DISKS: 'smart_disks_win32',
  /** Per-user recursive storage breakdown scan — 60 s TTL */
  STORAGE_BREAKDOWN: 'storage_breakdown',
} as const;

export const CACHE_TTL = {
  /** 30 seconds — fast enough to feel live, slow enough to avoid hammering PowerShell */
  SMART_DISKS_MS: 30_000,
  /** 60 seconds — full recursive scan is expensive; stale by a minute is acceptable */
  STORAGE_BREAKDOWN_MS: 60_000,
} as const;
