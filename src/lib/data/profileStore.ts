import { User } from '@/types';
import { sanitizeString, sanitizePlainText } from '@/lib/security/sanitize';
import { COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';

// Authoritative in-memory profile registry
const profilesByWallet = new Map<string, User>();
const walletByHandle = new Map<string, string>();

/**
 * Reset profile store (used in test fixtures)
 */
export function resetProfileStore(): void {
  profilesByWallet.clear();
  walletByHandle.clear();
}

/**
 * Get all legitimate onboarded profiles
 */
export function getAllOnboardedProfiles(): User[] {
  return Array.from(profilesByWallet.values());
}

/**
 * Get profile by wallet address
 */
export function getProfileByWallet(walletAddress: string): User | null {
  if (!walletAddress) return null;
  return profilesByWallet.get(walletAddress) || null;
}

/**
 * Get profile by handle
 */
export function getProfileByHandle(handle: string): User | null {
  if (!handle) return null;
  const cleanHandle = handle.toLowerCase().replace(/^@+/, '').trim();
  const wallet = walletByHandle.get(cleanHandle);
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

  return { success: true, profile: updatedProfile };
}
