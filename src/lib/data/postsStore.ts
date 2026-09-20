/**
 * Authoritative Post Persistence Store (Cookie Chain SVM)
 *
 * Provides production-grade durable post persistence backed by DistributedStore (Redis / Vercel KV)
 * with atomic secondary set indexing and local fallback for offline development.
 *
 * Storage Model:
 *   - Entity Key:        post:{id}                   -> JSON string of canonical Post
 *   - Global Set Index:  platform:posts              -> Redis Set of all post IDs
 *   - Author Set Index:  posts:author:{wallet}       -> Redis Set of post IDs authored by wallet
 *
 * Invariants:
 *   - Zero 7-day TTL expiration: Creator content persists indefinitely
 *   - Production Fail-Closed: Outage or missing KV configuration throws PostStoreUnavailableError (HTTP 503)
 *   - Compensating Rollback: Failed secondary index writes roll back primary record
 *   - Read-Time Reconciliation: Stale index entries pointing to deleted/missing keys are pruned
 *   - Concurrency Safety: Atomic SADD prevents lost-update array races
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Post, ShieldClassification } from '../../types/index.ts';
import { sanitizeString } from '../security/sanitize.ts';
import { distributedStore } from '../security/distributedStore.ts';
import { getProfileByWalletAsync } from './profileStore.ts';

export const DISTRIBUTED_POSTS_SET_KEY = 'platform:posts';
export const AUTHOR_POSTS_SET_PREFIX = 'posts:author:';
export const POST_PREFIX = 'post:';

export class PostStoreUnavailableError extends Error {
  public readonly code = 'POST_STORE_UNAVAILABLE';
  constructor(message: string = 'Authoritative post store is temporarily unavailable') {
    super(message);
    this.name = 'PostStoreUnavailableError';
  }
}

// In-memory cache for Local Development / Testing Fallback ONLY
const postsCache = new Map<string, Post>();
const authorPostsCache = new Map<string, Set<string>>();
let isLocalInitialized = false;

// Concurrency lock for local development fallback
let localLockPromise: Promise<void> = Promise.resolve();

async function acquireLocalLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const currentLock = localLockPromise;
  localLockPromise = nextLock;
  await currentLock;
  try {
    return await fn();
  } finally {
    release!();
  }
}

function getStorageFilePath(): string {
  if (process.env.POSTS_STORAGE_FILE) {
    return process.env.POSTS_STORAGE_FILE;
  }
  return path.join(process.cwd(), '.data', 'posts.json');
}

function loadFromLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data) as Post[];
        if (Array.isArray(parsed)) {
          postsCache.clear();
          authorPostsCache.clear();
          for (const post of parsed) {
            if (post && post.id && post.author?.walletAddress) {
              postsCache.set(post.id, post);
              let authorSet = authorPostsCache.get(post.author.walletAddress);
              if (!authorSet) {
                authorSet = new Set<string>();
                authorPostsCache.set(post.author.walletAddress, authorSet);
              }
              authorSet.add(post.id);
            }
          }
        }
      }
    }
  } catch {
    // Fail-safe for test environments
  }
}

function flushToLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const all = Array.from(postsCache.values());
    fs.writeFileSync(filePath, JSON.stringify(all, null, 2), 'utf8');
  } catch {
    // Fail-safe for read-only environments
  }
}

function ensureLocalInitialized(): void {
  if (!isLocalInitialized) {
    loadFromLocalDisk();
    isLocalInitialized = true;
  }
}

/**
 * Persists an authoritative canonical post
 */
export async function savePostAsync(post: Post): Promise<Post> {
  if (!post || !post.id || !post.author?.walletAddress) {
    throw new Error('Invalid post payload: id and author.walletAddress are required');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Authoritative Distributed Path (Redis / Vercel KV)
  if (distributedStore.isConfigured()) {
    const postKey = `${POST_PREFIX}${post.id}`;
    const authorKey = `${AUTHOR_POSTS_SET_PREFIX}${post.author.walletAddress}`;

    // Step 1: Write primary post record (permanent, no TTL)
    const setSuccess = await distributedStore.set(postKey, JSON.stringify(post));
    if (!setSuccess) {
      throw new PostStoreUnavailableError('Failed to persist post entity to authoritative store');
    }

    // Step 2: Index in global platform:posts set
    const saddGlobalSuccess = await distributedStore.sadd(DISTRIBUTED_POSTS_SET_KEY, post.id);
    if (!saddGlobalSuccess) {
      // Compensating rollback
      await distributedStore.del(postKey).catch(() => {});
      throw new PostStoreUnavailableError('Failed to add post to global index');
    }

    // Step 3: Index in author posts set
    const saddAuthorSuccess = await distributedStore.sadd(authorKey, post.id);
    if (!saddAuthorSuccess) {
      // Compensating rollback
      await distributedStore.srem(DISTRIBUTED_POSTS_SET_KEY, post.id).catch(() => {});
      await distributedStore.del(postKey).catch(() => {});
      throw new PostStoreUnavailableError('Failed to add post to author index');
    }

    return post;
  }

  // 2. Production Fail-Closed Invariant
  if (isProduction) {
    throw new PostStoreUnavailableError('Distributed post store is not configured in production environment');
  }

  // 3. Local Development / Test Fallback
  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    postsCache.set(post.id, post);

    let authorSet = authorPostsCache.get(post.author.walletAddress);
    if (!authorSet) {
      authorSet = new Set<string>();
      authorPostsCache.set(post.author.walletAddress, authorSet);
    }
    authorSet.add(post.id);

    flushToLocalDisk();
    return post;
  });
}

/**
 * Retrieves a single post by its canonical ID
 */
export async function getPostByIdAsync(postId: string): Promise<Post | null> {
  if (!postId || typeof postId !== 'string') return null;

  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const postKey = `${POST_PREFIX}${postId}`;
    const raw = await distributedStore.get(postKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Post;
    } catch {
      return null;
    }
  }

  if (isProduction) {
    throw new PostStoreUnavailableError('Distributed post store is not configured in production environment');
  }

  ensureLocalInitialized();
  return postsCache.get(postId) || null;
}

/**
 * Retrieves all canonical posts, sorted newest first
 */
export async function getAllPostsAsync(): Promise<Post[]> {
  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const postIds = await distributedStore.smembers(DISTRIBUTED_POSTS_SET_KEY);
    if (!Array.isArray(postIds)) {
      throw new PostStoreUnavailableError('Failed to read global posts index');
    }

    if (postIds.length === 0) {
      return [];
    }

    const postPromises = postIds.map(async (id) => {
      const postKey = `${POST_PREFIX}${id}`;
      const raw = await distributedStore.get(postKey);
      if (!raw) {
        // Prune orphan index entry in background
        distributedStore.srem(DISTRIBUTED_POSTS_SET_KEY, id).catch(() => {});
        return null;
      }
      try {
        return JSON.parse(raw) as Post;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(postPromises);
    const validPosts = results.filter((p): p is Post => p !== null && typeof p.id === 'string');

    // Sort newest first
    validPosts.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    return validPosts;
  }

  if (isProduction) {
    throw new PostStoreUnavailableError('Distributed post store is not configured in production environment');
  }

  ensureLocalInitialized();
  const all = Array.from(postsCache.values());
  all.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime() || 0;
    const timeB = new Date(b.createdAt).getTime() || 0;
    return timeB - timeA;
  });
  return all;
}

/**
 * Retrieves public safe posts (excluding adult shielded & quarantined)
 */
export async function getPublicPostsAsync(): Promise<Post[]> {
  const all = await getAllPostsAsync();
  return all.filter((p) => !p.isShielded && p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
}

/**
 * Retrieves adult-authorized posts (includes adult content, excludes quarantined)
 */
export async function getAdultAuthorizedPostsAsync(): Promise<Post[]> {
  const all = await getAllPostsAsync();
  return all.filter((p) => p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
}

/**
 * Retrieves all posts by a specific author wallet
 */
export async function getPostsByAuthorAsync(authorWallet: string): Promise<Post[]> {
  if (!authorWallet || typeof authorWallet !== 'string') return [];

  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const authorKey = `${AUTHOR_POSTS_SET_PREFIX}${authorWallet}`;
    const postIds = await distributedStore.smembers(authorKey);
    if (!Array.isArray(postIds)) {
      throw new PostStoreUnavailableError('Failed to read author posts index');
    }

    const postPromises = postIds.map(async (id) => {
      const postKey = `${POST_PREFIX}${id}`;
      const raw = await distributedStore.get(postKey);
      if (!raw) {
        distributedStore.srem(authorKey, id).catch(() => {});
        return null;
      }
      try {
        return JSON.parse(raw) as Post;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(postPromises);
    const validPosts = results.filter((p): p is Post => p !== null && typeof p.id === 'string');
    validPosts.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });
    return validPosts;
  }

  if (isProduction) {
    throw new PostStoreUnavailableError('Distributed post store is not configured in production environment');
  }

  ensureLocalInitialized();
  const authorSet = authorPostsCache.get(authorWallet);
  if (!authorSet) return [];

  const posts: Post[] = [];
  for (const id of authorSet) {
    const p = postsCache.get(id);
    if (p) posts.push(p);
  }
  posts.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime() || 0;
    const timeB = new Date(b.createdAt).getTime() || 0;
    return timeB - timeA;
  });
  return posts;
}

/**
 * Quarantines a post by updating its shieldCategory
 */
export async function quarantinePostAsync(postId: string, reason: string): Promise<boolean> {
  const post = await getPostByIdAsync(postId);
  if (!post) return false;

  const updated: Post = {
    ...post,
    isShielded: true,
    shieldCategory: 'quarantined' as ShieldClassification,
    shieldReason: reason,
  };

  await savePostAsync(updated);
  return true;
}

/**
 * Test harness reset helper
 */
export function clearPostsCacheForTests(): void {
  postsCache.clear();
  authorPostsCache.clear();
  isLocalInitialized = false;
  if (distributedStore.isConfigured()) {
    distributedStore.clearLocalFallback?.();
  }
}

// Backward compatible class wrapper
export class PostsStore {
  public async getAllPosts(): Promise<Post[]> {
    return getAllPostsAsync();
  }
  public async getPublicPosts(): Promise<Post[]> {
    return getPublicPostsAsync();
  }
  public async getAdultAuthorizedPosts(): Promise<Post[]> {
    return getAdultAuthorizedPostsAsync();
  }
  public async addPost(post: Post): Promise<Post> {
    return savePostAsync(post);
  }
  public async quarantinePost(postId: string, reason: string): Promise<boolean> {
    return quarantinePostAsync(postId, reason);
  }
  public resetToDefault(): void {
    clearPostsCacheForTests();
  }
}

export const postsStore = new PostsStore();
