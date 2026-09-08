/**
 * In-Memory Sliding Window Rate Limiter
 * Protects API routes, AI endpoints, and verification services against DoS and brute-force abuse.
 */

interface RateLimitRecord {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private records: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Periodically prune stale entries every 60 seconds
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.pruneStale(), 60_000);
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Check if a request is permitted under the rate limit.
   * @param key Unique identifier (e.g. ip:endpoint or wallet:action)
   * @param limit Max allowed requests within window
   * @param windowMs Time window in milliseconds
   */
  public check(
    key: string,
    limit: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetMs: number; limit: number } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps outside the active sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= limit) {
      const oldestInWindow = record.timestamps[0];
      const resetMs = oldestInWindow ? oldestInWindow + windowMs - now : windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, resetMs),
        limit,
      };
    }

    // Record this request
    record.timestamps.push(now);

    return {
      allowed: true,
      remaining: limit - record.timestamps.length,
      resetMs: windowMs,
      limit,
    };
  }

  /**
   * Reset rate limit state for a key (useful for tests and administrative resets)
   */
  public reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * Prune stale entries
   */
  private pruneStale(): void {
    const now = Date.now();
    const maxAge = 5 * 60_000; // 5 minutes
    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < maxAge);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }
}

// Global shared instances for common operations
export const globalRateLimiter = new SlidingWindowRateLimiter();
