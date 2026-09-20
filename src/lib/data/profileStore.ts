import fs from 'fs';
import path from 'path';
import type { User } from '../../types/index.ts';
import { sanitizePlainText } from '../security/sanitize.ts';
import { distributedStore } from '../security/distributedStore.ts';
import { isCanonicalOrBoundAsync } from './accountStore.ts';

const DISTRIBUTED_WALLETS_SET_KEY = 'platform:profiles:wallets';
const HANDLE_PREFIX = 'profile:handle:';
const WALLET_PREFIX = 'profile:wallet:';

// Ephemeral in-memory read cache
const profilesCache = new Map<string, User>();
const handleCache = new Map<string, string>();
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
  if (process.env.PROFILES_STORAGE_FILE) {
    return process.env.PROFILES_STORAGE_FILE;
  }
  return path.join(process.cwd(), '.data', 'profiles.json');
}

/**
 * Load persisted profiles from local disk into memory cache (Dev fallback only)
 */
function loadFromLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data) as User[];
        if (Array.isArray(parsed)) {
          profilesCache.clear();
          handleCache.clear();
          for (const profile of parsed) {
            if (profile && profile.walletAddress && profile.handle) {
              profilesCache.set(profile.walletAddress, profile);
              handleCache.set(profile.handle.toLowerCase(), profile.walletAddress);
            }
          }
        }
      }
    }
  } catch {
    // Fail-safe
  }
}

/**
 * Persist memory profiles to local disk (Dev fallback only)
 */
function saveToLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const profiles = Array.from(profilesCache.values());
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
    fs.writeFileSync(tempPath, JSON.stringify(profiles, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      const filePath = getStorageFilePath();
      const profiles = Array.from(profilesCache.values());
      fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2), 'utf8');
    } catch {}
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
 * Reset profile store (used in test fixtures)
 */
export function resetProfileStore(cleanDisk: boolean = false): void {
  profilesCache.clear();
  handleCache.clear();
  isLocalInitialized = true;
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
 * Set authoritative profile directly (for testing privileged states)
 */
export function setAuthoritativeProfileForTests(profile: User): void {
  ensureLocalInitialized();
  profilesCache.set(profile.walletAddress, profile);
  handleCache.set(profile.handle.toLowerCase(), profile.walletAddress);
  saveToLocalDisk();
}

/**
 * Get all legitimate onboarded profiles
 */
export function getAllOnboardedProfiles(): User[] {
  ensureLocalInitialized();
  return Array.from(profilesCache.values());
}

export async function getAllOnboardedProfilesAsync(): Promise<User[]> {
  if (distributedStore.isConfigured()) {
    try {
      const wallets = await distributedStore.smembers(DISTRIBUTED_WALLETS_SET_KEY);
      const profiles: User[] = [];
      for (const wallet of wallets) {
        const raw = await distributedStore.get(`${WALLET_PREFIX}${wallet}`);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as User;
            profiles.push(parsed);
            profilesCache.set(parsed.walletAddress, parsed);
            handleCache.set(parsed.handle.toLowerCase(), parsed.walletAddress);
          } catch {}
        }
      }
      return profiles;
    } catch {
      // In production, if distributed store fails during fetch, fallback to memory cache
      return Array.from(profilesCache.values());
    }
  }

  ensureLocalInitialized();
  return Array.from(profilesCache.values());
}

/**
 * Get profile by wallet address
 */
export function getProfileByWallet(walletAddress: string): User | null {
  if (!walletAddress) return null;
  ensureLocalInitialized();
  return profilesCache.get(walletAddress) || null;
}

export async function getProfileByWalletAsync(walletAddress: string): Promise<User | null> {
  if (!walletAddress) return null;

  if (distributedStore.isConfigured()) {
    try {
      const raw = await distributedStore.get(`${WALLET_PREFIX}${walletAddress}`);
      if (raw) {
        const parsed = JSON.parse(raw) as User;
        profilesCache.set(parsed.walletAddress, parsed);
        handleCache.set(parsed.handle.toLowerCase(), parsed.walletAddress);
        return parsed;
      }
      return null;
    } catch {
      return profilesCache.get(walletAddress) || null;
    }
  }

  ensureLocalInitialized();
  return profilesCache.get(walletAddress) || null;
}

/**
 * Get profile by handle
 */
export function getProfileByHandle(handle: string): User | null {
  if (!handle) return null;
  ensureLocalInitialized();
  const cleanHandle = handle.toLowerCase().replace(/^@+/, '').trim();
  const wallet = handleCache.get(cleanHandle);
  if (!wallet) return null;
  return profilesCache.get(wallet) || null;
}

export async function getProfileByHandleAsync(handle: string): Promise<User | null> {
  if (!handle) return null;
  const cleanHandle = handle.toLowerCase().replace(/^@+/, '').trim();

  if (distributedStore.isConfigured()) {
    try {
      const wallet = await distributedStore.get(`${HANDLE_PREFIX}${cleanHandle}`);
      if (wallet) {
        return getProfileByWalletAsync(wallet);
      }
      return null;
    } catch {
      const localWallet = handleCache.get(cleanHandle);
      if (!localWallet) return null;
      return profilesCache.get(localWallet) || null;
    }
  }

  ensureLocalInitialized();
  const wallet = handleCache.get(cleanHandle);
  if (!wallet) return null;
  return profilesCache.get(wallet) || null;
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
 * Save / Onboard Profile (Asynchronous & Authoritative)
 * 
 * Enforces:
 * 1. Strict SIWS authenticated wallet binding.
 * 2. Atomic handle claim via SETNX.
 * 3. Fail-closed production persistence.
 * 4. Zero fake profiles.
 */
export async function saveOnboardedProfileAsync(
  authenticatedWallet: string,
  input: OnboardProfileInput,
  isAdminSession: boolean = false
): Promise<{ success: boolean; profile?: User; error?: string }> {
  if (!authenticatedWallet || typeof authenticatedWallet !== 'string') {
    return { success: false, error: 'Valid authenticated wallet identity required' };
  }

  const isBound = await isCanonicalOrBoundAsync(authenticatedWallet);
  if (!isBound && !isAdminSession) {
    return {
      success: false,
      error: 'Unbound legacy wallet cannot create or mutate profile. Account registration or migration required.',
    };
  }

  const rawHandle = input.handle?.trim().toLowerCase().replace(/^@+/, '') || '';
  if (!rawHandle || rawHandle.length < 3 || rawHandle.length > 30) {
    return { success: false, error: 'Handle must be between 3 and 30 characters' };
  }

  if (!/^[a-z0-9_]+$/.test(rawHandle)) {
    return { success: false, error: 'Handle must contain only letters, numbers, and underscores' };
  }

  const sanitizedName = sanitizePlainText(input.name?.trim() || `@${rawHandle}`, 50);
  const sanitizedBio = sanitizePlainText(input.bio?.trim() || '', 280);
  const sanitizedAvatar = input.avatar?.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${authenticatedWallet}`;
  const sanitizedCover = input.coverImage?.trim() || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop';
  const isOwner = Boolean(isAdminSession);

  // -------------------------------------------------------------
  // Path A: Production Authoritative Distributed Store (Upstash / KV)
  // -------------------------------------------------------------
  if (distributedStore.isConfigured()) {
    try {
      const handleKey = `${HANDLE_PREFIX}${rawHandle}`;
      const walletKey = `${WALLET_PREFIX}${authenticatedWallet}`;

      // 1. Check existing profile for this wallet
      const rawExisting = await distributedStore.get(walletKey);
      let existingProfile: User | null = null;
      if (rawExisting) {
        try { existingProfile = JSON.parse(rawExisting); } catch {}
      }

      const isSameHandle = existingProfile && existingProfile.handle.toLowerCase() === rawHandle;
      let newlyClaimedHandle = false;

      // 2. Atomic Handle Claim (SETNX) if handle is new or being changed
      if (!isSameHandle) {
        const claimed = await distributedStore.setnx(handleKey, authenticatedWallet);
        if (!claimed) {
          // Double-check if the key currently belongs to this wallet
          const currentOwner = await distributedStore.get(handleKey);
          if (currentOwner === null) {
            return {
              success: false,
              error: 'Authoritative persistence service unavailable. Please retry.',
            };
          }
          if (currentOwner !== authenticatedWallet) {
            return { success: false, error: 'Handle is already registered by another identity' };
          }
        } else {
          newlyClaimedHandle = true;
        }
      }

      // 3. Construct updated profile
      const updatedProfile: User = {
        id: existingProfile?.id || `user-${authenticatedWallet}`,
        handle: rawHandle,
        name: sanitizedName,
        avatar: sanitizedAvatar,
        coverImage: sanitizedCover,
        bio: sanitizedBio,
        verified: existingProfile?.verified ?? false,
        ageVerified: existingProfile?.ageVerified ?? false,
        isAdmin: isOwner,
        isAdultContentCreator: input.isAdultContentCreator ?? existingProfile?.isAdultContentCreator ?? false,
        walletAddress: authenticatedWallet,
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

      // 4. Persist profile data to authoritative store
      const profilePersisted = await distributedStore.set(walletKey, JSON.stringify(updatedProfile));
      if (!profilePersisted) {
        // Rollback newly claimed handle to prevent orphan state
        if (newlyClaimedHandle) {
          await distributedStore.del(handleKey);
        }
        return {
          success: false,
          error: 'Authoritative persistence service unavailable. Please retry.',
        };
      }

      // 5. Add to registered wallets directory set
      await distributedStore.sadd(DISTRIBUTED_WALLETS_SET_KEY, authenticatedWallet);

      // 6. If user changed handle, release old handle atomically
      if (existingProfile && existingProfile.handle.toLowerCase() !== rawHandle) {
        const oldHandleKey = `${HANDLE_PREFIX}${existingProfile.handle.toLowerCase()}`;
        await distributedStore.del(oldHandleKey);
        handleCache.delete(existingProfile.handle.toLowerCase());
      }

      // 7. Update memory cache
      profilesCache.set(authenticatedWallet, updatedProfile);
      handleCache.set(rawHandle, authenticatedWallet);

      return { success: true, profile: updatedProfile };
    } catch (err) {
      console.error('[ProfileStore] Production persistence failure:', err);
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

    const existingOwner = handleCache.get(rawHandle);
    if (existingOwner && existingOwner !== authenticatedWallet) {
      return { success: false, error: 'Handle is already registered by another identity' };
    }

    const existingProfile = profilesCache.get(authenticatedWallet);
    if (existingProfile && existingProfile.handle !== rawHandle) {
      handleCache.delete(existingProfile.handle.toLowerCase());
    }

    const updatedProfile: User = {
      id: existingProfile?.id || `user-${authenticatedWallet}`,
      handle: rawHandle,
      name: sanitizedName,
      avatar: sanitizedAvatar,
      coverImage: sanitizedCover,
      bio: sanitizedBio,
      verified: existingProfile?.verified ?? false,
      ageVerified: existingProfile?.ageVerified ?? false,
      isAdmin: isOwner,
      isAdultContentCreator: input.isAdultContentCreator ?? existingProfile?.isAdultContentCreator ?? false,
      walletAddress: authenticatedWallet,
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

    profilesCache.set(authenticatedWallet, updatedProfile);
    handleCache.set(rawHandle, authenticatedWallet);
    saveToLocalDisk();

    return { success: true, profile: updatedProfile };
  });
}

/**
 * Synchronous wrapper for backward compatibility in test fixtures
 */
export function saveOnboardedProfile(
  authenticatedWallet: string,
  input: OnboardProfileInput,
  isAdminSession: boolean = false
): { success: boolean; profile?: User; error?: string } {
  ensureLocalInitialized();

  const rawHandle = input.handle?.trim().toLowerCase().replace(/^@+/, '') || '';
  if (!rawHandle || rawHandle.length < 3 || rawHandle.length > 30) {
    return { success: false, error: 'Handle must be between 3 and 30 characters' };
  }

  if (!/^[a-z0-9_]+$/.test(rawHandle)) {
    return { success: false, error: 'Handle must contain only letters, numbers, and underscores' };
  }

  const existingOwner = handleCache.get(rawHandle);
  if (existingOwner && existingOwner !== authenticatedWallet) {
    return { success: false, error: 'Handle is already registered by another identity' };
  }

  const sanitizedName = sanitizePlainText(input.name?.trim() || `@${rawHandle}`, 50);
  const sanitizedBio = sanitizePlainText(input.bio?.trim() || '', 280);
  const sanitizedAvatar = input.avatar?.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${authenticatedWallet}`;
  const sanitizedCover = input.coverImage?.trim() || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop';
  const isOwner = Boolean(isAdminSession);

  const existingProfile = profilesCache.get(authenticatedWallet);
  if (existingProfile && existingProfile.handle !== rawHandle) {
    handleCache.delete(existingProfile.handle.toLowerCase());
  }

  const updatedProfile: User = {
    id: existingProfile?.id || `user-${authenticatedWallet}`,
    handle: rawHandle,
    name: sanitizedName,
    avatar: sanitizedAvatar,
    coverImage: sanitizedCover,
    bio: sanitizedBio,
    verified: existingProfile?.verified ?? false,
    ageVerified: existingProfile?.ageVerified ?? false,
    isAdmin: isOwner,
    isAdultContentCreator: input.isAdultContentCreator ?? existingProfile?.isAdultContentCreator ?? false,
    walletAddress: authenticatedWallet,
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

  profilesCache.set(authenticatedWallet, updatedProfile);
  handleCache.set(rawHandle, authenticatedWallet);
  saveToLocalDisk();

  return { success: true, profile: updatedProfile };
}
