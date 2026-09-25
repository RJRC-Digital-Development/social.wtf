import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Product } from '../../types/index.ts';
import { sanitizePlainText, sanitizeString } from '../security/sanitize.ts';
import { distributedStore } from '../security/distributedStore.ts';
import { getProfileByWalletAsync, getProfileByWallet } from './profileStore.ts';
import { resolveCanonicalIdentityAsync, isCanonicalOrBoundAsync } from './accountStore.ts';

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
 * Validates whether a URL uses allowed protocols (HTTPS or IPFS, with optional HTTP in dev)
 */
export function isValidProductUrl(urlStr: string): boolean {
  if (typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim().toLowerCase();

  // Explicitly reject dangerous schemes
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    return false;
  }

  // Allowed production schemes
  if (trimmed.startsWith('https://') || trimmed.startsWith('ipfs://')) {
    return true;
  }

  // HTTP allowed ONLY in development
  if (process.env.NODE_ENV !== 'production' && trimmed.startsWith('http://')) {
    return true;
  }

  return false;
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

  // 5. Preview URL validation & sanitization
  let sanitizedPreview = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
  if (typeof input.previewUrl === 'string' && input.previewUrl.trim().length > 0) {
    const rawPreview = input.previewUrl.trim();
    if (!isValidProductUrl(rawPreview)) {
      return { valid: false, error: 'Preview URL must use HTTPS or IPFS protocol' };
    }
    sanitizedPreview = rawPreview.slice(0, 500);
  }

  // 6. Download URL validation & sanitization
  let sanitizedDownload: string | undefined = undefined;
  if (typeof input.downloadUrl === 'string' && input.downloadUrl.trim().length > 0) {
    const rawDownload = input.downloadUrl.trim();
    if (!isValidProductUrl(rawDownload)) {
      return { valid: false, error: 'Download URL must use HTTPS or IPFS protocol' };
    }
    sanitizedDownload = rawDownload.slice(0, 500);
  }

  // 7. Optional metadata
  const fileSize = typeof input.fileSize === 'string' ? sanitizePlainText(input.fileSize, 50) : 'Instant DL';
  const fileFormat = typeof input.fileFormat === 'string' ? sanitizePlainText(input.fileFormat, 50) : 'Digital';
  const codeSnippet = typeof input.codeSnippet === 'string' ? sanitizeString(input.codeSnippet, 4000) : undefined;
  const featured = Boolean(input.featured);

  return {
    valid: true,
    sanitized: {
      title: sanitizedTitle,
      description: sanitizedDesc,
      priceCook,
      category,
      previewUrl: sanitizedPreview,
      downloadUrl: sanitizedDownload,
      fileSize,
      fileFormat,
      codeSnippet,
      featured,
    },
  };
}

/**
 * Authoritative Asynchronous Product Creation
 * Enforces server-derived identity, crypto.randomUUID(), and multi-key write with compensating rollback.
 */
export async function saveProductAsync(
  authenticatedWallet: string,
  input: CreateProductInput
): Promise<{ success: boolean; product?: Product; error?: string }> {
  if (!authenticatedWallet || typeof authenticatedWallet !== 'string' || authenticatedWallet.trim().length < 32) {
    return { success: false, error: 'Valid authenticated wallet is required' };
  }

  const isBound = await isCanonicalOrBoundAsync(authenticatedWallet);
  if (!isBound) {
    return {
      success: false,
      error: 'Unbound legacy wallet cannot create new products. Account registration or migration required.',
    };
  }

  const validation = validateProductPayload(input);
  if (!validation.valid || !validation.sanitized) {
    return { success: false, error: validation.error || 'Invalid product payload' };
  }

  const clean = validation.sanitized;
  const productId = `prod_${crypto.randomUUID()}`;

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
  const canonicalCreator = await resolveCanonicalIdentityAsync(authenticatedWallet);

  if (distributedStore.isConfigured()) {
    const productKey = `${PRODUCT_PREFIX}${productId}`;
    const creatorSetKey = `${CREATOR_PRODUCTS_SET_PREFIX}${canonicalCreator}`;

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

      if (canonicalCreator !== authenticatedWallet) {
        await distributedStore.sadd(`${CREATOR_PRODUCTS_SET_PREFIX}${authenticatedWallet}`, productId).catch(() => {});
      }

      // Update memory cache for local read optimization
      productsCache.set(productId, canonicalProduct);
      let creatorSet = creatorProductsCache.get(canonicalCreator);
      if (!creatorSet) {
        creatorSet = new Set<string>();
        creatorProductsCache.set(canonicalCreator, creatorSet);
      }
      creatorSet.add(productId);

      if (canonicalCreator !== authenticatedWallet) {
        let legacySet = creatorProductsCache.get(authenticatedWallet);
        if (!legacySet) {
          legacySet = new Set<string>();
          creatorProductsCache.set(authenticatedWallet, legacySet);
        }
        legacySet.add(productId);
      }

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
  // Production Invariant: If KV unconfigured in production -> FAIL CLOSED
  // -------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      error: 'Authoritative product store is unavailable',
    };
  }

  // -------------------------------------------------------------
  // Path B: Local Development / Testing Fallback
  // -------------------------------------------------------------
  return acquireLocalLock(async () => {
    ensureLocalInitialized();

    productsCache.set(productId, canonicalProduct);
    let creatorSet = creatorProductsCache.get(canonicalCreator);
    if (!creatorSet) {
      creatorSet = new Set<string>();
      creatorProductsCache.set(canonicalCreator, creatorSet);
    }
    creatorSet.add(productId);

    if (canonicalCreator !== authenticatedWallet) {
      let legacySet = creatorProductsCache.get(authenticatedWallet);
      if (!legacySet) {
        legacySet = new Set<string>();
        creatorProductsCache.set(authenticatedWallet, legacySet);
      }
      legacySet.add(productId);
    }

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
  // Production Invariant: If KV unconfigured in production -> FAIL CLOSED
  // -------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      error: 'Authoritative product store is unavailable',
    };
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

  const canonicalCreator = await resolveCanonicalIdentityAsync(creatorWallet);

  // -------------------------------------------------------------
  // Path A: Production Authoritative Distributed Storage
  // -------------------------------------------------------------
  if (distributedStore.isConfigured()) {
    const creatorSetKey = `${CREATOR_PRODUCTS_SET_PREFIX}${canonicalCreator}`;
    try {
      let productIds = await distributedStore.smembers(creatorSetKey);
      if (creatorWallet !== canonicalCreator) {
        const legacyIds = await distributedStore.smembers(`${CREATOR_PRODUCTS_SET_PREFIX}${creatorWallet}`);
        if (Array.isArray(legacyIds) && legacyIds.length > 0) {
          productIds = Array.from(new Set([...(Array.isArray(productIds) ? productIds : []), ...legacyIds]));
        }
      }
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
  // Production Invariant: If KV unconfigured in production -> FAIL CLOSED
  // -------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      error: 'Authoritative product store is unavailable',
    };
  }

  // -------------------------------------------------------------
  // Path B: Local Development / Testing Fallback
  // -------------------------------------------------------------
  ensureLocalInitialized();
  const ids = creatorProductsCache.get(canonicalCreator) || creatorProductsCache.get(creatorWallet);
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
  // Production Invariant: If KV unconfigured in production -> FAIL CLOSED
  // -------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      error: 'Authoritative product store is unavailable',
    };
  }

  // -------------------------------------------------------------
  // Path B: Local Development / Testing Fallback
  // -------------------------------------------------------------
  ensureLocalInitialized();
  return { success: true, product: productsCache.get(id) || null };
}

/**
 * Authoritative Asynchronous Product Update
 */
export async function updateProductAsync(
  productId: string,
  authenticatedWallet: string,
  input: Partial<CreateProductInput>
): Promise<{ success: boolean; product?: Product; error?: string }> {
  if (!productId || typeof productId !== 'string') {
    return { success: false, error: 'Valid product ID is required' };
  }
  if (!authenticatedWallet || typeof authenticatedWallet !== 'string') {
    return { success: false, error: 'Valid authenticated wallet is required' };
  }

  const lookup = await getProductByIdAsync(productId);
  if (!lookup.success || !lookup.product) {
    return { success: false, error: lookup.error || 'Product not found' };
  }

  const existing = lookup.product;

  const canonicalCreator = await resolveCanonicalIdentityAsync(existing.creatorWallet);
  const canonicalUpdater = await resolveCanonicalIdentityAsync(authenticatedWallet);

  if (canonicalCreator !== canonicalUpdater && existing.creatorWallet !== authenticatedWallet) {
    return { success: false, error: 'Unauthorized: You can only edit your own products' };
  }

  const updatedTitle = typeof input.title === 'string' && input.title.trim().length >= 3
    ? sanitizeString(input.title.trim(), 100)
    : existing.title;

  let updatedPrice = existing.priceCook;
  if (typeof input.priceCook === 'number' && !isNaN(input.priceCook) && isFinite(input.priceCook) && input.priceCook >= 0 && input.priceCook <= 1_000_000) {
    updatedPrice = Math.round(input.priceCook * 10000) / 10000;
  }

  let updatedCategory = existing.category;
  if (typeof input.category === 'string' && VALID_PRODUCT_CATEGORIES.includes(input.category.toLowerCase() as ProductCategory)) {
    updatedCategory = input.category.toLowerCase() as Product['category'];
  }

  const updatedDesc = typeof input.description === 'string'
    ? sanitizeString(input.description.trim(), 2000)
    : existing.description;

  let updatedPreview = existing.previewUrl;
  if (typeof input.previewUrl === 'string' && input.previewUrl.trim().length > 0) {
    if (isValidProductUrl(input.previewUrl.trim())) {
      updatedPreview = input.previewUrl.trim().slice(0, 500);
    }
  }

  let updatedDownload = existing.downloadUrl;
  if (typeof input.downloadUrl === 'string' && input.downloadUrl.trim().length > 0) {
    if (isValidProductUrl(input.downloadUrl.trim())) {
      updatedDownload = input.downloadUrl.trim().slice(0, 500);
    }
  }

  const updatedFileSize = typeof input.fileSize === 'string' ? sanitizePlainText(input.fileSize, 50) : existing.fileSize;
  const updatedFileFormat = typeof input.fileFormat === 'string' ? sanitizePlainText(input.fileFormat, 50) : existing.fileFormat;
  const updatedCodeSnippet = typeof input.codeSnippet === 'string' ? sanitizeString(input.codeSnippet, 4000) : existing.codeSnippet;
  const updatedFeatured = input.featured !== undefined ? Boolean(input.featured) : existing.featured;

  const updatedProduct: Product = {
    ...existing,
    title: updatedTitle,
    description: updatedDesc,
    priceCook: updatedPrice,
    category: updatedCategory,
    previewUrl: updatedPreview,
    downloadUrl: updatedDownload,
    fileSize: updatedFileSize,
    fileFormat: updatedFileFormat,
    codeSnippet: updatedCodeSnippet,
    featured: updatedFeatured,
  };

  if (distributedStore.isConfigured()) {
    try {
      const productKey = `${PRODUCT_PREFIX}${productId}`;
      const written = await distributedStore.set(productKey, JSON.stringify(updatedProduct));
      if (!written) {
        return { success: false, error: 'Authoritative persistence service unavailable. Please retry.' };
      }
      productsCache.set(productId, updatedProduct);
      return { success: true, product: updatedProduct };
    } catch (err) {
      console.error('[ProductsStore] Update failure:', err);
      return { success: false, error: 'Authoritative product store is unavailable' };
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return { success: false, error: 'Authoritative product store is unavailable' };
  }

  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    productsCache.set(productId, updatedProduct);
    saveToLocalDisk();
    return { success: true, product: updatedProduct };
  });
}

/**
 * Authoritative Asynchronous Product Deletion
 */
export async function deleteProductAsync(
  productId: string,
  authenticatedWallet: string,
  isAdmin: boolean = false
): Promise<{ success: boolean; error?: string }> {
  if (!productId || typeof productId !== 'string') {
    return { success: false, error: 'Valid product ID is required' };
  }
  if (!authenticatedWallet || typeof authenticatedWallet !== 'string') {
    return { success: false, error: 'Valid authenticated wallet is required' };
  }

  const lookup = await getProductByIdAsync(productId);
  if (!lookup.success || !lookup.product) {
    return { success: false, error: 'Product not found or already deleted' };
  }

  const existing = lookup.product;
  const canonicalCreator = await resolveCanonicalIdentityAsync(existing.creatorWallet);
  const canonicalCaller = await resolveCanonicalIdentityAsync(authenticatedWallet);

  if (!isAdmin && canonicalCreator !== canonicalCaller && existing.creatorWallet !== authenticatedWallet) {
    return { success: false, error: 'Unauthorized: You can only delete your own products' };
  }

  if (distributedStore.isConfigured()) {
    const productKey = `${PRODUCT_PREFIX}${productId}`;
    const creatorSetKey = `${CREATOR_PRODUCTS_SET_PREFIX}${canonicalCreator}`;

    try {
      await Promise.allSettled([
        distributedStore.del(productKey),
        distributedStore.srem(creatorSetKey, productId),
        distributedStore.srem(DISTRIBUTED_PRODUCTS_SET_KEY, productId),
        distributedStore.srem(`${CREATOR_PRODUCTS_SET_PREFIX}${existing.creatorWallet}`, productId),
      ]);

      productsCache.delete(productId);
      const creatorSet = creatorProductsCache.get(canonicalCreator);
      if (creatorSet) creatorSet.delete(productId);
      const legacySet = creatorProductsCache.get(existing.creatorWallet);
      if (legacySet) legacySet.delete(productId);

      return { success: true };
    } catch (err) {
      console.error('[ProductsStore] Delete failure:', err);
      return { success: false, error: 'Authoritative product store is unavailable' };
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return { success: false, error: 'Authoritative product store is unavailable' };
  }

  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    productsCache.delete(productId);
    const creatorSet = creatorProductsCache.get(canonicalCreator);
    if (creatorSet) creatorSet.delete(productId);
    const legacySet = creatorProductsCache.get(existing.creatorWallet);
    if (legacySet) legacySet.delete(productId);
    saveToLocalDisk();
    return { success: true };
  });
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
  const productId = `prod_${crypto.randomUUID()}`;

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

export function resetProductsStore(): void {
  productsCache.clear();
  creatorProductsCache.clear();
  isLocalInitialized = false;
  if (distributedStore.isConfigured()) {
    distributedStore.clearLocalFallback?.();
  }
}
