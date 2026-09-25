import { PublicKey } from '@solana/web3.js';

export const PRIMARY_PLATFORM_OWNER_WALLET = '2AhP2bqFHd35v5Vhzu4T9MJe7EY7ytNLJ7GJimQ3CUqL';
export const PRIMARY_PLATFORM_OWNER_USERNAME = 'thepros2014';

/**
 * Server-Side Authoritative Platform Owner Username Resolver
 */
export function isPlatformOwnerUsername(username?: string | null): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }

  const clean = username.trim().toLowerCase().replace(/^@+/, '');
  if (clean === PRIMARY_PLATFORM_OWNER_USERNAME.toLowerCase()) {
    return true;
  }

  const configured = process.env.PLATFORM_OWNER_USERNAME?.trim().toLowerCase().replace(/^@+/, '');
  if (configured && clean === configured) {
    return true;
  }

  return false;
}

/**
 * Server-Side Authoritative Platform Owner Resolver
 */
export function getPlatformOwnerWallet(): string | null {
  const raw = process.env.PLATFORM_OWNER_WALLET?.trim();
  if (raw) {
    try {
      const pubkey = new PublicKey(raw);
      return pubkey.toBase58();
    } catch {
      return null;
    }
  }

  // When deployed on Vercel or running in production, fallback to authoritative primary owner wallet
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    try {
      const pubkey = new PublicKey(PRIMARY_PLATFORM_OWNER_WALLET);
      return pubkey.toBase58();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validates whether a given wallet address or username matches the configured platform owner.
 */
export function isPlatformOwner(walletAddress: string): boolean {
  if (!walletAddress || typeof walletAddress !== 'string') {
    return false;
  }

  const normalized = walletAddress.trim().toLowerCase();

  // Validate Solana public key structure
  let isValidPublicKey = false;
  try {
    new PublicKey(walletAddress.trim());
    isValidPublicKey = true;
  } catch {
    isValidPublicKey = false;
  }

  if (isValidPublicKey) {
    // Check if it matches configured owner wallet
    const configuredOwner = getPlatformOwnerWallet();
    if (configuredOwner && normalized === configuredOwner.toLowerCase()) {
      return true;
    }

    const raw = process.env.PLATFORM_OWNER_WALLET?.trim();
    if (raw) {
      const list = raw.split(',').map((w) => {
        try {
          return new PublicKey(w.trim()).toBase58().toLowerCase();
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (list.includes(normalized)) {
        return true;
      }
    }

    // In production / Vercel, fallback to authoritative primary owner wallet
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      if (normalized === PRIMARY_PLATFORM_OWNER_WALLET.toLowerCase()) {
        return true;
      }
    }
  }

  // Check candidate username or user-prefixed handle
  const candidateUser = normalized.startsWith('user-') ? normalized.substring(5) : normalized;
  if (isPlatformOwnerUsername(candidateUser)) {
    return true;
  }

  return false;
}
