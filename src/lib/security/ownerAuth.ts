import { PublicKey } from '@solana/web3.js';

export const PRIMARY_PLATFORM_OWNER_WALLET = '2AhP2bqFHd35v5Vhzu4T9MJe7EY7ytNLJ7GJimQ3CUqL';

/**
 * Server-Side Authoritative Platform Owner Resolver
 */
export function getPlatformOwnerWallet(): string | null {
  const raw = process.env.PLATFORM_OWNER_WALLET?.trim() || PRIMARY_PLATFORM_OWNER_WALLET;
  if (!raw) {
    return null;
  }

  try {
    const pubkey = new PublicKey(raw);
    return pubkey.toBase58();
  } catch {
    return null;
  }
}

/**
 * Validates whether a given wallet address matches the configured platform owner.
 */
export function isPlatformOwner(walletAddress: string): boolean {
  if (!walletAddress || typeof walletAddress !== 'string') {
    return false;
  }

  const normalized = walletAddress.trim().toLowerCase();

  if (normalized === PRIMARY_PLATFORM_OWNER_WALLET.toLowerCase()) {
    return true;
  }

  const configuredOwner = getPlatformOwnerWallet();
  if (configuredOwner && normalized === configuredOwner.toLowerCase()) {
    return true;
  }

  const raw = process.env.PLATFORM_OWNER_WALLET?.trim();
  if (raw) {
    const list = raw.split(',').map((w) => w.trim().toLowerCase());
    if (list.includes(normalized)) {
      return true;
    }
  }

  return false;
}
