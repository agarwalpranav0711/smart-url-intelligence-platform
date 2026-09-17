/**
 * Bounded In-Memory LRU Cache for Link Metadata.
 * Provides high-throughput, sub-millisecond lookups while maintaining
 * fallback safety to PostgreSQL as the single source of truth.
 */

class MemoryCache {
  /**
   * @param {number} maxSize - Maximum number of entries in the cache
   * @param {number} ttlMs - Default time-to-live in milliseconds (e.g. 5 minutes)
   */
  constructor(maxSize = 10000, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  /**
   * Get cached item by key. Returns null if missing or expired.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    try {
      if (!this.cache.has(key)) return null;

      const item = this.cache.get(key);
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        return null;
      }

      // Move key to back of Map to maintain LRU order
      this.cache.delete(key);
      this.cache.set(key, item);
      return item.value;
    } catch (err) {
      // Graceful fallback to DB on any cache error
      return null;
    }
  }

  /**
   * Set cached item with optional TTL override.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs]
   */
  set(key, value, ttlMs = this.ttlMs) {
    try {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // Evict oldest entry (first key in Map iterator)
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }

      this.cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
    } catch (err) {
      // Ignore cache write failures gracefully
    }
  }

  /**
   * Delete item from cache (used for cache invalidation on deactivation).
   * @param {string} key
   */
  del(key) {
    try {
      this.cache.delete(key);
    } catch (err) {
      // Ignore cache delete failures gracefully
    }
  }

  /**
   * Clear all cached entries.
   */
  clear() {
    try {
      this.cache.clear();
    } catch (err) {
      // Ignore clear errors
    }
  }
}

// Export singleton instance for process-local link caching
const linkCache = new MemoryCache();

module.exports = {
  MemoryCache,
  linkCache,
};
