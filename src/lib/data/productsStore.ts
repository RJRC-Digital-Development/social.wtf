import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Product } from '../../types/index.ts';
import { sanitizePlainText, sanitizeString } from '../security/sanitize.ts';
import { distributedStore } from '../security/distributedStore.ts';
import { getProfileByWalletAsync, getProfileByWallet } from './profileStore.ts';

const DISTRIBUTED_PRODUCTS_SET_KEY = 'platform:products';
const CREATOR_PRODUCTS_SET_PREFIX = 'products:creator:';
const PRODUCT_PREFIX = 'product:';

export const VALID_PRODUCT_CATEGORIES = [
  'music_stem',
  'digital_art',
  'vip_pass',
  'preset',
  'e_goods',
  'code_script',
] as const;

export type ProductCategory = typeof VALID_PRODUCT_CATEGORIES[number];

export interface CreateProductInput {
  title: string;
  description?: string;
  priceCook: number;
  category?: ProductCategory | string;
  previewUrl?: string;
  downloadUrl?: string;
  fileSize?: string;
  fileFormat?: string;
  codeSnippet?: string;
  featured?: boolean;
}

// Ephemeral in-memory read cache for Local Development / Test Runner Fallback ONLY
const productsCache = new Map<string, Product>();
const creatorProductsCache = new Map<string, Set<string>>();
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

/**
 * Resolve local development storage file path (Dev / Offline fallback ONLY)
 */
function getStorageFilePath(): string {
  if (process.env.PRODUCTS_STORAGE_FILE) {
    return process.env.PRODUCTS_STORAGE_FILE;
  }
  return path.join(process.cwd(), '.data', 'products.json');
}

/**
 * Load persisted products from local disk into memory cache (Dev fallback only)
 */
function loadFromLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data) as Product[];
        if (Array.isArray(parsed)) {
          productsCache.clear();
          creatorProductsCache.clear();
          for (const product of parsed) {
            if (product && product.id && product.creatorWallet) {
              productsCache.set(product.id, product);
              let creatorSet = creatorProductsCache.get(product.creatorWallet);
              if (!creatorSet) {
                creatorSet = new Set<string>();
                creatorProductsCache.set(product.creatorWallet, creatorSet);
              }
              creatorSet.add(product.id);
            }
          }
        }
      }
    }
  } catch {
    // Fail-safe for test environments
  }
}

/**
 * Persist memory products to local disk (Dev fallback only)
 */
function saveToLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const products = Array.from(productsCache.values());
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
    fs.writeFileSync(tempPath, JSON.stringify(products, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      const filePath = getStorageFilePath();
      const products = Array.from(productsCache.values());
      fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf8');
    } catch {
      // Fail-safe
    }
  }
}

function ensureLocalInitialized(): void {
  if (!isLocalInitialized) {
    if (!distributedStore.isConfigured()) {
      loadFromLocalDisk();
    }
    isLocalInitialized = true;
  }
}

/**
 * Clear in-memory product caches (strictly for isolated test executions)
 */
export function clearProductsCacheForTests(): void {
  productsCache.clear();
  creatorProductsCache.clear();
  isLocalInitialized = true;
}

/**
 * Validate product creation payload
 */
export function validateProductPayload(input: CreateProductInput): {
  valid: boolean;
  error?: string;
  sanitized?: {
    title: string;
    description: string;
    priceCook: number;
    category: ProductCategory;
    previewUrl: string;
    downloadUrl?: string;
    fileSize?: string;
    fileFormat?: string;
    codeSnippet?: string;
    featured: boolean;
  };
} {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Product payload is required' };
  }

  // 1. Title validation & sanitization
  const rawTitle = typeof input.title === 'string' ? input.title.trim() : '';
  if (!rawTitle || rawTitle.length < 3 || rawTitle.length > 100) {
    return { valid: false, error: 'Product title must be between 3 and 100 characters' };
  }
  const sanitizedTitle = sanitizeString(rawTitle, 100);

  // 2. Price validation
  const rawPrice = input.priceCook;
  if (typeof rawPrice !== 'number' || isNaN(rawPrice) || !isFinite(rawPrice)) {
    return { valid: false, error: 'Product price must be a valid numeric amount' };
  }
  if (rawPrice < 0) {
    return { valid: false, error: 'Product price cannot be negative' };
  }
  if (rawPrice > 1_000_000) {
    return { valid: false, error: 'Product price cannot exceed 1,000,000 COOK' };
  }
  const priceCook = Math.round(rawPrice * 10000) / 10000;

  // 3. Category validation
  const rawCategory = typeof input.category === 'string' ? input.category.trim().toLowerCase() : 'digital_art';
  if (!VALID_PRODUCT_CATEGORIES.includes(rawCategory as ProductCategory)) {
    return {
      valid: false,
      error: `Invalid category. Must be one of: ${VALID_PRODUCT_CATEGORIES.join(', ')}`,
    };
  }
  const category = rawCategory as ProductCategory;

  // 4. Description sanitization
  const rawDesc = typeof input.description === 'string' ? input.description.trim() : '';
  const sanitizedDesc = sanitizeString(rawDesc, 2000) || 'Exclusive creator digital item.';

  // 5. Preview URL sanitization
  const rawPreview = typeof input.previewUrl === 'string' ? input.previewUrl.trim() : '';
  const sanitizedPreview =
    rawPreview.startsWith('http://') || rawPreview.startsWith('https://') || rawPreview.startsWith('ipfs://')
      ? rawPreview.slice(0, 500)
      : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';

  // 6. Optional metadata
  const fileSize = typeof input.fileSize === 'string' ? sanitizePlainText(input.fileSize, 50) : 'Instant DL';
  const fileFormat = typeof input.fileFormat === 'string' ? sanitizePlainText(input.fileFormat, 50) : 'Digital';
  const codeSnippet = typeof input.codeSnippet === 'string' ? sanitizeString(input.codeSnippet, 4000) : undefined;
  const downloadUrl = typeof input.downloadUrl === 'string' ? input.downloadUrl.trim().slice(0, 500) : undefined;
  const featured = Boolean(input.featured);

  return {
    valid: true,
    sanitized: {
      title: sanitizedTitle,
      description: sanitizedDesc,
      priceCook,
      category,
      previewUrl: sanitizedPreview,
      downloadUrl,
      fileSize,
      fileFormat,
      codeSnippet,
      featured,
    },
  };
}

/**
 * Authoritative Asynchronous Product Creation
 * Enforces server-derived identity, server UUID, and multi-key write with compensating rollback.
 */
export async function saveProductAsync(
  authenticatedWallet: string,
  input: CreateProductInput
): Promise<{ success: boolean; product?: Product; error?: string }> {
  if (!authenticatedWallet || typeof authenticatedWallet !== 'string' || authenticatedWallet.trim().length < 32) {
    return { success: false, error: 'Valid authenticated wallet is required' };
  }

  const validation = validateProductPayload(input);
  if (!validation.valid || !validation.sanitized) {
    return { success: false, error: validation.error || 'Invalid product payload' };
  }

  const clean = validation.sanitized;
  const productId = `prod_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

  // Resolve creator display info from profileStore (Handle change does NOT orphan product ownership)
  let creatorHandle = `user_${authenticatedWallet.slice(0, 4).toLowerCase()}${authenticatedWallet.slice(-4).toLowerCase()}`;
  let creatorName = `@${authenticatedWallet.slice(0, 4)}...${authenticatedWallet.slice(-4)}`;

  try {
    const profile = await getProfileByWalletAsync(authenticatedWallet);
    if (profile?.handle) {
      creatorHandle = profile.handle;
      creatorName = profile.name || `@${profile.handle}`;
    }
  } catch {
    // Non-blocking fallback to wallet-derived display
  }

  // Canonical server product record
  const canonicalProduct: Product = {
    id: productId,
    creatorId: creatorHandle,
    creatorHandle,
    creatorName,
    creatorWallet: authenticatedWallet,
    title: clean.title,
    description: clean.description,
    priceCook: clean.priceCook,
    category: clean.category,
    previewUrl: clean.previewUrl,
    downloadUrl: clean.downloadUrl,
    salesCount: 0,
    fileSize: clean.fileSize,
    fileFormat: clean.fileFormat,
    featured: clean.featured,
    codeSnippet: clean.codeSnippet,
  };

  // -------------------------------------------------------------
  // Path A: Production Authoritative Distributed Storage (Redis / KV)
  // -------------------------------------------------------------
  if (distributedStore.isConfigured()) {
    const productKey = `${PRODUCT_PREFIX}${productId}`;
    const creatorSetKey = `${CREATOR_PRODUCTS_SET_PREFIX}${authenticatedWallet}`;

    try {
      // Step 1: Write primary product record
      const primaryWritten = await distributedStore.set(productKey, JSON.stringify(canonicalProduct));
      if (!primaryWritten) {
        return {
          success: false,
          error: 'Authoritative persistence service unavailable. Please retry.',
        };
      }

      // Step 2: Index in creator set and platform catalog set
      const [creatorIndexed, platformIndexed] = await Promise.all([
        distributedStore.sadd(creatorSetKey, productId),
        distributedStore.sadd(DISTRIBUTED_PRODUCTS_SET_KEY, productId),
      ]);

      if (!creatorIndexed || !platformIndexed) {
        // Step 3: Compensating rollback on secondary index failure
        await Promise.allSettled([
          distributedStore.del(productKey),
          distributedStore.srem(creatorSetKey, productId),
          distributedStore.srem(DISTRIBUTED_PRODUCTS_SET_KEY, productId),
        ]);

        return {
          success: false,
          error: 'Authoritative persistence service unavailable. Please retry.',
        };
      }

      // Update memory cache for local read optimization
      productsCache.set(productId, canonicalProduct);
      let creatorSet = creatorProductsCache.get(authenticatedWallet);
      if (!creatorSet) {
        creatorSet = new Set<string>();
        creatorProductsCache.set(authenticatedWallet, creatorSet);
      }
      creatorSet.add(productId);

      return { success: true, product: canonicalProduct };
    } catch (err) {
      console.error('[ProductsStore] Production persistence failure:', err);
      // Attempt compensating rollback even if an exception occurred
      await Promise.allSettled([
        distributedStore.del(productKey),
        distributedStore.srem(creatorSetKey, productId),
        distributedStore.srem(DISTRIBUTED_PRODUCTS_SET_KEY, productId),
      ]).catch(() => {});

      return {
        success: false,
        error: 'Authoritative persistence service unavailable. Please retry.',
      };
    }
  }

  // -------------------------------------------------------------
  // Path B: Local Development / Testing Fallback
  // -------------------------------------------------------------
  return acquireLocalLock(async () => {
    ensureLocalInitialized();

    productsCache.set(productId, canonicalProduct);
    let creatorSet = creatorProductsCache.get(authenticatedWallet);
    if (!creatorSet) {
      creatorSet = new Set<string>();
      creatorProductsCache.set(authenticatedWallet, creatorSet);
    }
    creatorSet.add(productId);

    saveToLocalDisk();

    return { success: true, product: canonicalProduct };
  });
}

/**
 * Authoritative Asynchronous Global Catalog Retrieval with Read-Time Index Reconciliation
 */
export async function getAllProductsAsync(): Promise<{
  success: boolean;
  products?: Product[];
  error?: string;
}> {
  // -------------------------------------------------------------
  // Path A: Production Authoritative Distributed Storage
  // -------------------------------------------------------------
  if (distributedStore.isConfigured()) {
    try {
      const productIds = await distributedStore.smembers(DISTRIBUTED_PRODUCTS_SET_KEY);
      if (!productIds || productIds.length === 0) {
        return { success: true, products: [] };
      }

      const products: Product[] = [];
      const orphanIds: string[] = [];

      // Fetch each product record in parallel
      const records = await Promise.all(
        productIds.map(async (id) => {
          const raw = await distributedStore.get(`${PRODUCT_PREFIX}${id}`);
          if (!raw) {
            orphanIds.push(id);
            return null;
          }
          try {
            return JSON.parse(raw) as Product;
          } catch {
            orphanIds.push(id);
            return null;
          }
        })
      );

      for (const rec of records) {
        if (rec) {
          products.push(rec);
        }
      }

      // Read-Time Index Reconciliation: Prune orphan index entries
      if (orphanIds.length > 0) {
        Promise.allSettled(
          orphanIds.map((orphanId) => distributedStore.srem(DISTRIBUTED_PRODUCTS_SET_KEY, orphanId))
        ).catch(() => {});
      }

      return { success: true, products };
    } catch (err) {
      console.error('[ProductsStore] Production getAllProducts failure:', err);
      return {
        success: false,
        error: 'Authoritative product store is unavailable',
      };
    }
  }

  // -------------------------------------------------------------
  // Path B: Local Development / Testing Fallback
  // -------------------------------------------------------------
  ensureLocalInitialized();
  return { success: true, products: Array.from(productsCache.values()) };
}

/**
 * Authoritative Asynchronous Creator Catalog Retrieval with Read-Time Index Reconciliation
 */
export async function getProductsByCreatorAsync(
  creatorWallet: string
): Promise<{ success: boolean; products?: Product[]; error?: string }> {
  if (!creatorWallet || typeof creatorWallet !== 'string') {
    return { success: true, products: [] };
  }

  // -------------------------------------------------------------
  // Path A: Production Authoritative Distributed Storage
  // -------------------------------------------------------------
  if (distributedStore.isConfigured()) {
    const creatorSetKey = `${CREATOR_PRODUCTS_SET_PREFIX}${creatorWallet}`;
    try {
      const productIds = await distributedStore.smembers(creatorSetKey);
      if (!productIds || productIds.length === 0) {
        return { success: true, products: [] };
      }

      const products: Product[] = [];
      const orphanIds: string[] = [];

      const records = await Promise.all(
        productIds.map(async (id) => {
          const raw = await distributedStore.get(`${PRODUCT_PREFIX}${id}`);
          if (!raw) {
            orphanIds.push(id);
            return null;
          }
          try {
            return JSON.parse(raw) as Product;
          } catch {
            orphanIds.push(id);
            return null;
          }
        })
      );

      for (const rec of records) {
        if (rec) {
          products.push(rec);
        }
      }

      // Read-Time Index Reconciliation: Prune orphan index entries from creator set and global set
      if (orphanIds.length > 0) {
        Promise.allSettled(
          orphanIds.flatMap((orphanId) => [
            distributedStore.srem(creatorSetKey, orphanId),
            distributedStore.srem(DISTRIBUTED_PRODUCTS_SET_KEY, orphanId),
          ])
        ).catch(() => {});
      }

      return { success: true, products };
    } catch (err) {
      console.error('[ProductsStore] Production getProductsByCreator failure:', err);
      return {
        success: false,
        error: 'Authoritative product store is unavailable',
      };
    }
  }

  // -------------------------------------------------------------
  // Path B: Local Development / Testing Fallback
  // -------------------------------------------------------------
  ensureLocalInitialized();
  const ids = creatorProductsCache.get(creatorWallet);
  if (!ids) {
    return { success: true, products: [] };
  }
  const products: Product[] = [];
  for (const id of ids) {
    const p = productsCache.get(id);
    if (p) products.push(p);
  }
  return { success: true, products };
}

/**
 * Authoritative Asynchronous Product Lookup by ID
 */
export async function getProductByIdAsync(
  id: string
): Promise<{ success: boolean; product?: Product | null; error?: string }> {
  if (!id || typeof id !== 'string') {
    return { success: true, product: null };
  }

  // -------------------------------------------------------------
  // Path A: Production Authoritative Distributed Storage
  // -------------------------------------------------------------
  if (distributedStore.isConfigured()) {
    try {
      const raw = await distributedStore.get(`${PRODUCT_PREFIX}${id}`);
      if (!raw) {
        return { success: true, product: null };
      }
      const product = JSON.parse(raw) as Product;
      return { success: true, product };
    } catch (err) {
      console.error('[ProductsStore] Production getProductById failure:', err);
      return {
        success: false,
        error: 'Authoritative product store is unavailable',
      };
    }
  }

  // -------------------------------------------------------------
  // Path B: Local Development / Testing Fallback
  // -------------------------------------------------------------
  ensureLocalInitialized();
  return { success: true, product: productsCache.get(id) || null };
}

/**
 * Synchronous wrapper for test fixtures
 */
export function saveProduct(
  authenticatedWallet: string,
  input: CreateProductInput
): { success: boolean; product?: Product; error?: string } {
  ensureLocalInitialized();

  if (!authenticatedWallet || typeof authenticatedWallet !== 'string' || authenticatedWallet.trim().length < 32) {
    return { success: false, error: 'Valid authenticated wallet is required' };
  }

  const validation = validateProductPayload(input);
  if (!validation.valid || !validation.sanitized) {
    return { success: false, error: validation.error || 'Invalid product payload' };
  }

  const clean = validation.sanitized;
  const productId = `prod_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

  let creatorHandle = `user_${authenticatedWallet.slice(0, 4).toLowerCase()}${authenticatedWallet.slice(-4).toLowerCase()}`;
  let creatorName = `@${authenticatedWallet.slice(0, 4)}...${authenticatedWallet.slice(-4)}`;

  const profile = getProfileByWallet(authenticatedWallet);
  if (profile?.handle) {
    creatorHandle = profile.handle;
    creatorName = profile.name || `@${profile.handle}`;
  }

  const canonicalProduct: Product = {
    id: productId,
    creatorId: creatorHandle,
    creatorHandle,
    creatorName,
    creatorWallet: authenticatedWallet,
    title: clean.title,
    description: clean.description,
    priceCook: clean.priceCook,
    category: clean.category,
    previewUrl: clean.previewUrl,
    downloadUrl: clean.downloadUrl,
    salesCount: 0,
    fileSize: clean.fileSize,
    fileFormat: clean.fileFormat,
    featured: clean.featured,
    codeSnippet: clean.codeSnippet,
  };

  productsCache.set(productId, canonicalProduct);
  let creatorSet = creatorProductsCache.get(authenticatedWallet);
  if (!creatorSet) {
    creatorSet = new Set<string>();
    creatorProductsCache.set(authenticatedWallet, creatorSet);
  }
  creatorSet.add(productId);

  saveToLocalDisk();

  return { success: true, product: canonicalProduct };
}

/**
 * Synchronous retrieval for test fixtures
 */
export function getAllProducts(): Product[] {
  ensureLocalInitialized();
  return Array.from(productsCache.values());
}

/**
 * Synchronous retrieval for test fixtures
 */
export function getProductsByCreator(creatorWallet: string): Product[] {
  ensureLocalInitialized();
  const ids = creatorProductsCache.get(creatorWallet);
  if (!ids) return [];
  const prods: Product[] = [];
  for (const id of ids) {
    const p = productsCache.get(id);
    if (p) prods.push(p);
  }
  return prods;
}
