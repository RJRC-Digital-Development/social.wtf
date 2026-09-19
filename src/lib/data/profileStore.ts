import fs from 'fs';
import path from 'path';
import { User } from '@/types';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import { distributedStore } from '@/lib/security/distributedStore';

const DISTRIBUTED_PROFILES_KEY = 'platform:profiles';

// Authoritative in-memory profile cache
const profilesByWallet = new Map<string, User>();
const walletByHandle = new Map<string, string>();
let isInitialized = false;

/**
 * Resolve local durable storage file path
 */
function getStorageFilePath(): string {
  if (process.env.PROFILES_STORAGE_FILE) {
    return process.env.PROFILES_STORAGE_FILE;
  }
  return path.join(process.cwd(), '.data', 'profiles.json');
}

/**
 * Load persisted profiles from local disk into memory cache
 */
function loadFromDisk(): void {
  try {
    const filePath = getStorageFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data) as User[];
        if (Array.isArray(parsed)) {
          profilesByWallet.clear();
          walletByHandle.clear();
          for (const profile of parsed) {
            if (profile && profile.walletAddress && profile.handle) {
              profilesByWallet.set(profile.walletAddress, profile);
              walletByHandle.set(profile.handle.toLowerCase(), profile.walletAddress);
            }
          }
        }
      }
    }
  } catch {
    // Fail-safe: maintain memory state if disk read is unavailable
  }
}

/**
 * Persist memory profiles to local disk
 */
function saveToDisk(): void {
  try {
    const filePath = getStorageFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const profiles = Array.from(profilesByWallet.values());
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
    fs.writeFileSync(tempPath, JSON.stringify(profiles, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch {
    // Fallback: direct write if atomic rename fails
    try {
      const filePath = getStorageFilePath();
      const profiles = Array.from(profilesByWallet.values());
      fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2), 'utf8');
    } catch {
      // Environments with read-only root filesystems gracefully rely on DistributedStore / memory
    }
  }
}

/**
 * Ensure storage baseline is initialized on cold start
 */
export function ensureStoreInitialized(): void {
  if (!isInitialized) {
    loadFromDisk();
    isInitialized = true;
  }
}

/**
 * Reset profile store (used in test fixtures)
 */
export function resetProfileStore(cleanDisk: boolean = false): void {
  profilesByWallet.clear();
  walletByHandle.clear();
  isInitialized = true;
  if (cleanDisk) {
    try {
      const filePath = getStorageFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
  }
}

/**
 * Sync from distributed KV store if available
 */
async function syncFromDistributedStore(): Promise<void> {
  if (!distributedStore.isConfigured()) return;
  try {
    const raw = await distributedStore.get(DISTRIBUTED_PROFILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as User[];
      if (Array.isArray(parsed)) {
        for (const profile of parsed) {
          if (profile && profile.walletAddress && profile.handle) {
            profilesByWallet.set(profile.walletAddress, profile);
            walletByHandle.set(profile.handle.toLowerCase(), profile.walletAddress);
          }
        }
        saveToDisk();
      }
    }
  } catch {
    // Graceful fallback to disk/memory
  }
}

/**
 * Sync to distributed KV store
 */
async function syncToDistributedStore(): Promise<void> {
  if (!distributedStore.isConfigured()) return;
  try {
    const profiles = Array.from(profilesByWallet.values());
    await distributedStore.set(DISTRIBUTED_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // Graceful fallback to disk/memory
  }
}

/**
 * Get all legitimate onboarded profiles
 */
export function getAllOnboardedProfiles(): User[] {
  ensureStoreInitialized();
  return Array.from(profilesByWallet.values());
}

export async function getAllOnboardedProfilesAsync(): Promise<User[]> {
  ensureStoreInitialized();
  await syncFromDistributedStore();
  return Array.from(profilesByWallet.values());
}

/**
 * Get profile by wallet address
 */
export function getProfileByWallet(walletAddress: string): User | null {
  if (!walletAddress) return null;
  ensureStoreInitialized();
  return profilesByWallet.get(walletAddress) || null;
}

export async function getProfileByWalletAsync(walletAddress: string): Promise<User | null> {
  if (!walletAddress) return null;
  ensureStoreInitialized();
  const existing = profilesByWallet.get(walletAddress);
  if (existing) return existing;
  await syncFromDistributedStore();
  return profilesByWallet.get(walletAddress) || null;
}

/**
 * Get profile by handle
 */
export function getProfileByHandle(handle: string): User | null {
  if (!handle) return null;
  ensureStoreInitialized();
  const cleanHandle = handle.toLowerCase().replace(/^@+/, '').trim();
  const wallet = walletByHandle.get(cleanHandle);
  if (!wallet) return null;
  return profilesByWallet.get(wallet) || null;
}

export async function getProfileByHandleAsync(handle: string): Promise<User | null> {
  if (!handle) return null;
  ensureStoreInitialized();
  const cleanHandle = handle.toLowerCase().replace(/^@+/, '').trim();
  let wallet = walletByHandle.get(cleanHandle);
  if (!wallet) {
    await syncFromDistributedStore();
    wallet = walletByHandle.get(cleanHandle);
  }
  if (!wallet) return null;
  return profilesByWallet.get(wallet) || null;
}

export interface OnboardProfileInput {
  handle: string;
  name: string;
  bio?: string;
  avatar?: string;
  coverImage?: string;
  isCreator?: boolean;
  isAdultContentCreator?: boolean;
  sponsorUrl?: string;
  sponsorGoal?: string;
  storeSettings?: {
    storeName?: string;
    storeDescription?: string;
    supportCookTreasuryPct?: number;
  };
}

/**
 * Authoritative Profile Creation / Update
 * Binds strictly to authenticated walletAddress from SIWS session.
 */
export function saveOnboardedProfile(
  authenticatedWallet: string,
  input: OnboardProfileInput,
  isAdminSession: boolean = false
): { success: boolean; profile?: User; error?: string } {
  ensureStoreInitialized();

  if (!authenticatedWallet || typeof authenticatedWallet !== 'string') {
    return { success: false, error: 'Valid authenticated wallet identity required' };
  }

  const rawHandle = input.handle?.trim().toLowerCase().replace(/^@+/, '') || '';
  if (!rawHandle || rawHandle.length < 3 || rawHandle.length > 30) {
    return { success: false, error: 'Handle must be between 3 and 30 characters' };
  }

  // Handle format validation (alphanumeric and underscores only)
  if (!/^[a-z0-9_]+$/.test(rawHandle)) {
    return { success: false, error: 'Handle must contain only letters, numbers, and underscores' };
  }

  // Handle uniqueness check: Cannot claim handle claimed by another wallet
  const existingOwner = walletByHandle.get(rawHandle);
  if (existingOwner && existingOwner !== authenticatedWallet) {
    return { success: false, error: 'Handle is already registered by another identity' };
  }

  const sanitizedName = sanitizePlainText(input.name?.trim() || `@${rawHandle}`, 50);
  const sanitizedBio = sanitizePlainText(input.bio?.trim() || '', 280);
  const sanitizedAvatar = input.avatar?.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${authenticatedWallet}`;
  const sanitizedCover = input.coverImage?.trim() || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop';

  const isOwner = authenticatedWallet === COOKIE_CHAIN_CONFIG.treasuryPublicKey || isAdminSession;

  // Retrieve existing profile if updating (preserves followers, verified state, etc.)
  const existingProfile = profilesByWallet.get(authenticatedWallet);

  // If user is changing their handle, release the old handle mapping
  if (existingProfile && existingProfile.handle !== rawHandle) {
    walletByHandle.delete(existingProfile.handle.toLowerCase());
  }

  const updatedProfile: User = {
    id: existingProfile?.id || `user-${authenticatedWallet}`,
    handle: rawHandle,
    name: sanitizedName,
    avatar: sanitizedAvatar,
    coverImage: sanitizedCover,
    bio: sanitizedBio,
    verified: existingProfile?.verified ?? isOwner,
    ageVerified: existingProfile?.ageVerified ?? false,
    isAdmin: isOwner,
    isAdultContentCreator: input.isAdultContentCreator ?? existingProfile?.isAdultContentCreator ?? false,
    walletAddress: authenticatedWallet, // Strictly bound to authenticated session identity
    sponsorUrl: input.sponsorUrl?.trim() || existingProfile?.sponsorUrl,
    sponsorGoal: input.sponsorGoal?.trim() || existingProfile?.sponsorGoal,
    followersCount: existingProfile?.followersCount || 0,
    followingCount: existingProfile?.followingCount || 0,
    friendsCount: existingProfile?.friendsCount || 0,
    isCreator: input.isCreator ?? existingProfile?.isCreator ?? true,
    storeSettings: {
      storeName: input.storeSettings?.storeName?.trim() || existingProfile?.storeSettings?.storeName || `${sanitizedName}'s Storefront`,
      storeDescription: input.storeSettings?.storeDescription?.trim() || existingProfile?.storeSettings?.storeDescription || 'Digital goods and community assets on Cookie Chain SVM.',
      supportCookTreasuryPct: 5,
    },
    widgets: existingProfile?.widgets || [],
  };

  profilesByWallet.set(authenticatedWallet, updatedProfile);
  walletByHandle.set(rawHandle, authenticatedWallet);

  // Persist to disk
  saveToDisk();

  // Async sync to distributed store
  syncToDistributedStore().catch(() => {});

  return { success: true, profile: updatedProfile };
}

export async function saveOnboardedProfileAsync(
  authenticatedWallet: string,
  input: OnboardProfileInput,
  isAdminSession: boolean = false
): Promise<{ success: boolean; profile?: User; error?: string }> {
  const result = saveOnboardedProfile(authenticatedWallet, input, isAdminSession);
  if (result.success) {
    await syncToDistributedStore();
  }
  return result;
}
