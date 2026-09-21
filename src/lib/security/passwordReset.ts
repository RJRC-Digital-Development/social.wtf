/**
 * Cryptographic Password Reset & Email Verification Token Authority (Cookie Chain SVM)
 *
 * Implements single-use, account-bound cryptographic tokens stored exclusively as SHA-256 digests.
 * Raw tokens are never persisted or logged.
 */

import crypto from 'crypto';
import { distributedStore } from './distributedStore.ts';

const VERIFY_EMAIL_PREFIX = 'email_verify:digest:';
const PWD_RESET_PREFIX = 'pwd_reset:digest:';

export const VERIFY_EMAIL_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const PWD_RESET_TTL_SECONDS = 15 * 60; // 15 minutes

export interface VerificationTokenRecord {
  accountId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

export interface PasswordResetTokenRecord {
  accountId: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory fallback for local development / testing
const verifyTokensCache = new Map<string, VerificationTokenRecord>();
const resetTokensCache = new Map<string, PasswordResetTokenRecord>();

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Creates a cryptographically random email verification token.
 * Returns raw token for email delivery; persists ONLY SHA-256 digest.
 */
export async function createRecoveryEmailVerificationTokenAsync(
  accountId: string,
  email: string
): Promise<string> {
  const rawToken = generateSecureToken();
  const tokenDigest = hashToken(rawToken);
  const now = Date.now();
  const expiresAt = now + VERIFY_EMAIL_TTL_SECONDS * 1000;

  const record: VerificationTokenRecord = {
    accountId,
    email: email.trim().toLowerCase(),
    createdAt: now,
    expiresAt,
  };

  if (distributedStore.isConfigured()) {
    await distributedStore.set(
      `${VERIFY_EMAIL_PREFIX}${tokenDigest}`,
      JSON.stringify(record),
      VERIFY_EMAIL_TTL_SECONDS
    );
  } else {
    verifyTokensCache.set(tokenDigest, record);
  }

  return rawToken;
}

/**
 * Atomically verifies and consumes an email verification token.
 * Uses atomic GETDEL to prevent concurrent double-consumption races.
 */
export async function verifyRecoveryEmailTokenAsync(
  rawToken: string
): Promise<{ success: boolean; accountId?: string; email?: string; error?: string }> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length !== 64 || !/^[a-f0-9]+$/i.test(rawToken)) {
    return { success: false, error: 'INVALID_TOKEN' };
  }

  const tokenDigest = hashToken(rawToken);
  let record: VerificationTokenRecord | null = null;

  if (distributedStore.isConfigured()) {
    // Atomic single-use consumption with GETDEL
    const rawData = await distributedStore.getdel(`${VERIFY_EMAIL_PREFIX}${tokenDigest}`);
    if (!rawData) {
      return { success: false, error: 'INVALID_OR_EXPIRED_TOKEN' };
    }
    try {
      record = JSON.parse(rawData);
    } catch {
      return { success: false, error: 'CORRUPTED_TOKEN' };
    }
  } else {
    record = verifyTokensCache.get(tokenDigest) || null;
    if (!record) {
      return { success: false, error: 'INVALID_OR_EXPIRED_TOKEN' };
    }
    verifyTokensCache.delete(tokenDigest);
  }

  if (!record || record.expiresAt <= Date.now()) {
    return { success: false, error: 'TOKEN_EXPIRED' };
  }

  return {
    success: true,
    accountId: record.accountId,
    email: record.email,
  };
}

/**
 * Creates a cryptographically random password reset token.
 * Returns raw token for delivery; persists ONLY SHA-256 digest.
 */
export async function createPasswordResetTokenAsync(accountId: string): Promise<string> {
  const rawToken = generateSecureToken();
  const tokenDigest = hashToken(rawToken);
  const now = Date.now();
  const expiresAt = now + PWD_RESET_TTL_SECONDS * 1000;

  const record: PasswordResetTokenRecord = {
    accountId,
    createdAt: now,
    expiresAt,
  };

  if (distributedStore.isConfigured()) {
    await distributedStore.set(
      `${PWD_RESET_PREFIX}${tokenDigest}`,
      JSON.stringify(record),
      PWD_RESET_TTL_SECONDS
    );
  } else {
    resetTokensCache.set(tokenDigest, record);
  }

  return rawToken;
}

/**
 * Atomically verifies and consumes a password reset token.
 * Uses atomic GETDEL to prevent concurrent double-consumption races.
 */
export async function consumePasswordResetTokenAsync(
  rawToken: string
): Promise<{ success: boolean; accountId?: string; error?: string }> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length !== 64 || !/^[a-f0-9]+$/i.test(rawToken)) {
    return { success: false, error: 'INVALID_TOKEN' };
  }

  const tokenDigest = hashToken(rawToken);
  let record: PasswordResetTokenRecord | null = null;

  if (distributedStore.isConfigured()) {
    // Atomic single-use consumption with GETDEL
    const rawData = await distributedStore.getdel(`${PWD_RESET_PREFIX}${tokenDigest}`);
    if (!rawData) {
      return { success: false, error: 'INVALID_OR_EXPIRED_TOKEN' };
    }
    try {
      record = JSON.parse(rawData);
    } catch {
      return { success: false, error: 'CORRUPTED_TOKEN' };
    }
  } else {
    record = resetTokensCache.get(tokenDigest) || null;
    if (!record) {
      return { success: false, error: 'INVALID_OR_EXPIRED_TOKEN' };
    }
    resetTokensCache.delete(tokenDigest);
  }

  if (!record || record.expiresAt <= Date.now()) {
    return { success: false, error: 'TOKEN_EXPIRED' };
  }

  return {
    success: true,
    accountId: record.accountId,
  };
}

/**
 * Explicitly invalidates / deletes a verification token (e.g. if mail delivery fails).
 */
export async function deleteRecoveryEmailVerificationTokenAsync(rawToken: string): Promise<void> {
  if (!rawToken || typeof rawToken !== 'string') return;
  const tokenDigest = hashToken(rawToken);
  if (distributedStore.isConfigured()) {
    await distributedStore.del(`${VERIFY_EMAIL_PREFIX}${tokenDigest}`);
  } else {
    verifyTokensCache.delete(tokenDigest);
  }
}

/**
 * Explicitly invalidates / deletes a password reset token (e.g. if mail delivery fails).
 */
export async function deletePasswordResetTokenAsync(rawToken: string): Promise<void> {
  if (!rawToken || typeof rawToken !== 'string') return;
  const tokenDigest = hashToken(rawToken);
  if (distributedStore.isConfigured()) {
    await distributedStore.del(`${PWD_RESET_PREFIX}${tokenDigest}`);
  } else {
    resetTokensCache.delete(tokenDigest);
  }
}

export function clearPasswordResetTokensForTests(): void {
  verifyTokensCache.clear();
  resetTokensCache.clear();
}
