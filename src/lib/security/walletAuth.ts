import { PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import crypto from 'crypto';

/**
 * Cryptographic Wallet Authentication (SIWS - Sign-In with Solana Standard)
 * Defends against wallet address spoofing, replay attacks, and unauthorized session hijacking.
 */

export interface AuthChallenge {
  nonce: string;
  walletAddress: string;
  domain: string;
  statement: string;
  issuedAt: number;
  expiresAt: number;
}

// In-memory active nonces map: nonce -> AuthChallenge
const activeChallenges = new Map<string, AuthChallenge>();

// Nonce validity duration: 5 minutes
const NONCE_TTL_MS = 5 * 60 * 1000;

/**
 * Generate a secure cryptographic challenge message for a wallet to sign.
 */
export function generateAuthChallenge(
  walletAddress: string,
  domain: string = 'social.wtf'
): AuthChallenge {
  // Validate public key format
  new PublicKey(walletAddress);

  const nonce = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + NONCE_TTL_MS;
  const statement = 'Sign this message to authenticate your wallet identity and session on Social.wtf.';

  const challenge: AuthChallenge = {
    nonce,
    walletAddress,
    domain,
    statement,
    issuedAt: now,
    expiresAt,
  };

  activeChallenges.set(nonce, challenge);

  return challenge;
}

/**
 * Formats a challenge object into the canonical human-readable SIWS message format.
 */
export function formatChallengeMessage(challenge: AuthChallenge): string {
  return [
    `${challenge.domain} wants you to sign in with your Solana account:`,
    `${challenge.walletAddress}`,
    '',
    `${challenge.statement}`,
    '',
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${new Date(challenge.issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(challenge.expiresAt).toISOString()}`,
  ].join('\n');
}

/**
 * Cryptographically verifies that the provided signature matches the wallet address and challenge message.
 * Strictly consumes the nonce to prevent replay attacks.
 */
export function verifyWalletChallenge({
  walletAddress,
  nonce,
  signatureBase58,
}: {
  walletAddress: string;
  nonce: string;
  signatureBase58: string;
}): { verified: boolean; error?: string } {
  // 1. Retrieve challenge from active store
  const challenge = activeChallenges.get(nonce);
  if (!challenge) {
    return { verified: false, error: 'Challenge nonce not found or already consumed' };
  }

  // 2. Consume nonce immediately (Anti-Replay)
  activeChallenges.delete(nonce);

  // 3. Check expiration
  if (Date.now() > challenge.expiresAt) {
    return { verified: false, error: 'Challenge has expired' };
  }

  // 4. Verify wallet address matches challenge recipient
  if (challenge.walletAddress !== walletAddress) {
    return { verified: false, error: 'Wallet address does not match challenge target' };
  }

  try {
    // 5. Reconstruct canonical message
    const message = formatChallengeMessage(challenge);
    const messageBytes = new TextEncoder().encode(message);

    // 6. Decode public key and signature
    const publicKeyBytes = new PublicKey(walletAddress).toBytes();
    const signatureBytes = bs58.decode(signatureBase58);

    if (signatureBytes.length !== 64) {
      return { verified: false, error: 'Invalid signature byte length' };
    }

    // 7. Verify Ed25519 signature
    const isValid = ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);

    if (!isValid) {
      return { verified: false, error: 'Cryptographic signature verification failed' };
    }

    return { verified: true };
  } catch (err: any) {
    return { verified: false, error: `Verification error: ${err.message}` };
  }
}
