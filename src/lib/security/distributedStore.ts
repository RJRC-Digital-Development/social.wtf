/**
 * Distributed Key-Value Store Adapter (Zero-Dependency REST Interface)
 * Supports Upstash Redis, Vercel KV, and standard Redis REST endpoints.
 * 
 * Provides atomic single-use nonce consumption, global session revocation blocklists,
 * and distributed rate limiting across horizontal serverless worker instances.
 * 
 * Seamlessly falls back to local in-memory storage for offline development and testing.
 */

export interface DistributedStoreConfig {
  url?: string;
  token?: string;
}

export class DistributedStore {
  private readonly url: string | null = null;
  private readonly token: string | null = null;
  private readonly isEnabled: boolean = false;
  private readonly fallbackMemory = new Map<string, { value: string; expiresAt: number }>();

  constructor(config?: DistributedStoreConfig) {
    const rawUrl =
      config?.url ||
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      process.env.REDIS_REST_URL;

    const rawToken =
      config?.token ||
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      process.env.REDIS_REST_TOKEN;

    if (rawUrl && rawToken) {
      this.url = rawUrl.replace(/\/+$/, '');
      this.token = rawToken;
      this.isEnabled = true;
    }
  }

  public isConfigured(): boolean {
    return this.isEnabled;
  }

  /**
   * Executes a Redis command against the REST endpoint
   */
  private async executeCommand<T = any>(command: (string | number)[]): Promise<T | null> {
    if (!this.isEnabled || !this.url || !this.token) {
      return null;
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        // 3 second timeout for high-performance edge execution
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        console.warn(`[DistributedStore] REST command failed with status ${response.status}`);
        return null;
      }

      const data = await response.json();
      return (data?.result as T) ?? null;
    } catch (err) {
      console.warn('[DistributedStore] Network error connecting to distributed store:', err);
      return null;
    }
  }

  /**
   * Retrieves a string value by key
   */
  public async get(key: string): Promise<string | null> {
    if (this.isEnabled) {
      return this.executeCommand<string>(['GET', key]);
    }

    const item = this.fallbackMemory.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.fallbackMemory.delete(key);
      return null;
    }
    return item.value;
  }

  /**
   * Stores a key-value pair with optional TTL in seconds
   */
  public async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.isEnabled) {
      const cmd: (string | number)[] = ['SET', key, value];
      if (ttlSeconds && ttlSeconds > 0) {
        cmd.push('EX', ttlSeconds);
      }
      const res = await this.executeCommand<string>(cmd);
      return res === 'OK';
    }

    if (ttlSeconds !== undefined && ttlSeconds <= 0) {
      this.fallbackMemory.delete(key);
      return true;
    }

    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.fallbackMemory.set(key, { value, expiresAt });
    return true;
  }

  /**
   * Atomically reads and deletes a key (ideal for single-use nonce consumption)
   */
  public async getdel(key: string): Promise<string | null> {
    if (this.isEnabled) {
      return this.executeCommand<string>(['GETDEL', key]);
    }

    const item = this.fallbackMemory.get(key);
    if (!item) return null;
    this.fallbackMemory.delete(key);
    if (Date.now() > item.expiresAt) {
      return null;
    }
    return item.value;
  }

  /**
   * Deletes a key
   */
  public async del(key: string): Promise<boolean> {
    if (this.isEnabled) {
      const res = await this.executeCommand<number>(['DEL', key]);
      return typeof res === 'number' && res > 0;
    }

    return this.fallbackMemory.delete(key);
  }

  /**
   * Atomically increments a key with TTL (for distributed rate limiting)
   */
  public async incrWithExpiry(key: string, ttlSeconds: number): Promise<number | null> {
    if (this.isEnabled) {
      // Execute pipeline: INCR then EXPIRE (if new key)
      const count = await this.executeCommand<number>(['INCR', key]);
      if (count === 1 && ttlSeconds > 0) {
        await this.executeCommand(['EXPIRE', key, ttlSeconds]);
      }
      return count;
    }

    const now = Date.now();
    const item = this.fallbackMemory.get(key);
    let count = 1;
    if (item && now <= item.expiresAt) {
      count = parseInt(item.value, 10) + 1;
    }
    this.fallbackMemory.set(key, {
      value: count.toString(),
      expiresAt: now + ttlSeconds * 1000,
    });
    return count;
  }

  /**
   * Clears fallback in-memory state (useful in test harnesses)
   */
  public clearLocalFallback(): void {
    this.fallbackMemory.clear();
  }
}

export const distributedStore = new DistributedStore();
