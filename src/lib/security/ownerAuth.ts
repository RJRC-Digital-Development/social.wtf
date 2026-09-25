import { PublicKey } from '@solana/web3.js';

/**
 * Server-Side Authoritative Platform Owner Resolver
 * 
 * Invariants:
 * 1. Resolves exclusively from process.env.PLATFORM_OWNER_WALLET.
 * 2. Trims leading/trailing whitespace.
 * 3. Missing, empty, or whitespace-only values resolve to null (zero implicit admins).
 * 4. Malformed / invalid Solana public keys resolve to null without throwing.
 * 5. Valid keys resolve to canonical Base58 public key string.
 * 6. NEVER falls back to COOKIE_CHAIN_CONFIG.treasuryPublicKey.
 * 7. NEVER reads owner authority from client state, profile, or localStorage.
 * 8. Never exposed to client bundles (server-only).
 */

export function getPlatformOwnerWallet(): string | null {
  const raw = process.env.PLATFORM_OWNER_WALLET?.trim();
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

  const configuredOwner = getPlatformOwnerWallet();
  if (configuredOwner && walletAddress.trim().toLowerCase() === configuredOwner.toLowerCase()) {
    return true;
  }

  const raw = process.env.PLATFORM_OWNER_WALLET?.trim();
  if (raw) {
    const list = raw.split(',').map((w) => w.trim().toLowerCase());
    if (list.includes(walletAddress.trim().toLowerCase())) {
      return true;
    }
  }

  return false;
}
