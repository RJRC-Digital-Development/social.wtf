import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP Recommended Argon2id Configuration:
 * - memoryCost: 19456 KB (19 MB)
 * - timeCost: 2 iterations
 * - parallelism: 1 thread
 * - algorithm: Argon2id (Algorithm.Argon2id = 2)
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
  algorithm: 2, // Argon2id
};

/**
 * Hash a plaintext password using Argon2id.
 * Throws if password is empty or invalid.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    throw new Error('Password must not exceed 128 characters');
  }

  return await hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * Returns false on mismatch or invalid hash format without throwing.
 */
export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  if (typeof hashString !== 'string' || typeof password !== 'string') {
    return false;
  }

  if (!hashString.startsWith('$argon2id$')) {
    return false;
  }

  try {
    return await verify(hashString, password);
  } catch {
    return false;
  }
}
