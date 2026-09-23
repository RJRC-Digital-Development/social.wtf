/**
 * Distributed Key-Value Store Adapter (Zero-Dependency REST Interface)
 * Supports Upstash Redis, Vercel KV, and standard Redis REST endpoints.
 * 
 * Provides atomic single-use nonce consumption, global session revocation blocklists,
 * atomic handle claiming (SETNX), and distributed rate limiting across horizontal serverless worker instances.
 * 
 * Seamlessly falls back to local in-memory storage for offline development and testing.
 */

export interface DistributedStoreConfig {
  url?: string;
  token?: string;
}

export type DistributedReadResult =
  | { ok: true; value: string | null }
  | { ok: false; value: null };

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
  public async executeCommand<T = any>(command: (string | number)[]): Promise<T | null> {
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

  /** Read with an explicit unavailable-vs-missing distinction. */
  public async getWithStatus(key: string): Promise<DistributedReadResult> {
    if (!this.isEnabled || !this.url || !this.token) {
      return { ok: true, value: await this.get(key) };
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { ok: false, value: null };
      const data = await response.json();
      return { ok: true, value: typeof data?.result === 'string' ? data.result : null };
    } catch {
      return { ok: false, value: null };
    }
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
   * Atomically sets a key if it does not already exist (SET ... NX)
   * Returns true if the key was set, false if the key already exists or operation failed.
   */
  public async setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.isEnabled) {
      const cmd: (string | number)[] = ['SET', key, value, 'NX'];
      if (ttlSeconds && ttlSeconds > 0) {
        cmd.push('EX', ttlSeconds);
      }
      const res = await this.executeCommand<string>(cmd);
      return res === 'OK';
    }

    const item = this.fallbackMemory.get(key);
    if (item && Date.now() <= item.expiresAt) {
      return false;
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
   * Adds a member to a set (SADD)
   */
  public async sadd(key: string, member: string): Promise<boolean> {
    if (this.isEnabled) {
      const res = await this.executeCommand<number>(['SADD', key, member]);
      return typeof res === 'number' && res > 0;
    }

    const raw = this.fallbackMemory.get(key);
    let set = new Set<string>();
    if (raw && Date.now() <= raw.expiresAt) {
      try {
        set = new Set(JSON.parse(raw.value));
      } catch {}
    }
    const wasAdded = !set.has(member);
    set.add(member);
    this.fallbackMemory.set(key, { value: JSON.stringify(Array.from(set)), expiresAt: Infinity });
    return wasAdded;
  }

  /**
   * Retrieves all members of a set (SMEMBERS)
   */
  public async smembers(key: string): Promise<string[]> {
    if (this.isEnabled) {
      const res = await this.executeCommand<string[]>(['SMEMBERS', key]);
      return Array.isArray(res) ? res : [];
    }

    const raw = this.fallbackMemory.get(key);
    if (!raw || Date.now() > raw.expiresAt) return [];
    try {
      return JSON.parse(raw.value) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Checks if a member exists in a set (SISMEMBER)
   */
  public async sismember(key: string, member: string): Promise<boolean> {
    if (this.isEnabled) {
      const res = await this.executeCommand<number>(['SISMEMBER', key, member]);
      return typeof res === 'number' && res === 1;
    }

    const raw = this.fallbackMemory.get(key);
    if (!raw || Date.now() > raw.expiresAt) return false;
    try {
      const set = new Set<string>(JSON.parse(raw.value));
      return set.has(member);
    } catch {
      return false;
    }
  }

  /**
   * Removes a member from a set (SREM)
   */
  public async srem(key: string, member: string): Promise<boolean> {
    if (this.isEnabled) {
      const res = await this.executeCommand<number>(['SREM', key, member]);
      return typeof res === 'number' && res > 0;
    }

    const raw = this.fallbackMemory.get(key);
    if (!raw || Date.now() > raw.expiresAt) return false;
    try {
      const set = new Set<string>(JSON.parse(raw.value));
      const removed = set.delete(member);
      this.fallbackMemory.set(key, { value: JSON.stringify(Array.from(set)), expiresAt: Infinity });
      return removed;
    } catch {
      return false;
    }
  }

  /**
   * Atomically increments a key with TTL (for distributed rate limiting)
   */
  public async incrWithExpiry(key: string, ttlSeconds: number): Promise<number | null> {
    if (this.isEnabled) {
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
