import crypto from 'crypto';
import { distributedStore } from './distributedStore';
import {
  SessionPayload,
  SessionScope,
  getSessionSecret,
  validateRequestSessionAsync,
  extractSessionToken,
} from './session';

import { FACTOR_TTL_MS, VerificationRecord } from './verificationRecord';

export interface AuthorizationClaims {
  walletAddress: string;
  scope: SessionScope;
  isCardVerified: boolean;
  cardBrand?: string;
  cardLast4?: string;
  cardVerifiedAt?: number;
  isVideoVerified: boolean;
  estimatedAge?: number;
  isUnder25Flagged: boolean;
  videoVerifiedAt?: number;
  isIdVerified: boolean;
  idDocumentType?: string;
  idVerifiedAt?: number;
  isAdultAuthorized: boolean;
  authorizedAt: number;
  expiresAt: number;
  verificationRecords?: Record<string, VerificationRecord>;
}

export interface AuthorizationPolicy {
  requiredScope?: SessionScope;
  requireAdultAccess?: boolean;
  requireWalletMatch?: string;
}

const AUTH_TOKEN_VERSION = 'auth_v1';
const DEFAULT_AUTH_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Derives adult entertainment access strictly according to platform policy:
 * 1. Payment card verification ($0 authorization) confirms cardholder adulthood (30 day TTL).
 * 2. AI Sentinel Live video verification confirms active biometric human presence (24 hour TTL).
 * 3. Anyone estimated under 25 MUST produce a valid Driver's License or Government ID (30 day TTL).
 */
export function calculateAdultAuthorization(
  claims: Pick<
    AuthorizationClaims,
    | 'isCardVerified'
    | 'isVideoVerified'
    | 'isUnder25Flagged'
    | 'isIdVerified'
    | 'cardVerifiedAt'
    | 'videoVerifiedAt'
    | 'idVerifiedAt'
  >,
  now: number = Date.now()
): boolean {
  const cardValid =
    claims.isCardVerified &&
    (claims.cardVerifiedAt ? now - claims.cardVerifiedAt <= FACTOR_TTL_MS.card : true);
  const videoValid =
    claims.isVideoVerified &&
    (claims.videoVerifiedAt ? now - claims.videoVerifiedAt <= FACTOR_TTL_MS.video : true);
  const idValid =
    claims.isIdVerified &&
    (claims.idVerifiedAt ? now - claims.idVerifiedAt <= FACTOR_TTL_MS.id : true);

  return Boolean(cardValid && videoValid && (!claims.isUnder25Flagged || idValid));
}


function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');
}

function sign(data: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(data, 'utf8')
    .digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Creates a cryptographically signed Authorization Grant Token
 */
export function createAuthorizationToken(claims: AuthorizationClaims): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(claims));
  const signature = sign(`${AUTH_TOKEN_VERSION}.${encodedPayload}`);
  return `${AUTH_TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

/**
 * Verifies the cryptographic integrity and expiration of an Authorization Grant Token
 */
export function verifyAuthorizationToken(
  token: string
): { valid: true; claims: AuthorizationClaims } | { valid: false; reason: string } {
  try {
    if (typeof token !== 'string' || token.length > 8192) {
      return { valid: false, reason: 'Invalid token structure.' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'Invalid token format.' };
    }

    const [version, encodedPayload, suppliedSignature] = parts;
    if (version !== AUTH_TOKEN_VERSION) {
      return { valid: false, reason: 'Unsupported token version.' };
    }

    const expectedSignature = sign(`${version}.${encodedPayload}`);
    if (!safeEqual(suppliedSignature, expectedSignature)) {
      return { valid: false, reason: 'Cryptographic signature mismatch.' };
    }

    const claims = JSON.parse(decodeBase64Url(encodedPayload)) as AuthorizationClaims;
    if (claims.expiresAt <= Date.now()) {
      return { valid: false, reason: 'Authorization token expired.' };
    }

    return { valid: true, claims };
  } catch {
    return { valid: false, reason: 'Malformed authorization token.' };
  }
}

/**
 * Retrieves authorization claims for a wallet from the distributed store,
 * falling back to default baseline claims if none exist.
 */
export async function getAuthorizationClaimsAsync(
  walletAddress: string,
  scope: SessionScope = 'user'
): Promise<AuthorizationClaims> {
  const cacheKey = `auth_claims:${walletAddress}`;
  const raw = await distributedStore.get(cacheKey);

  if (raw) {
    try {
      const claims = JSON.parse(raw) as AuthorizationClaims;
      // Re-verify adult authorization status dynamically
      claims.isAdultAuthorized = calculateAdultAuthorization(claims);
      return claims;
    } catch {
      // Invalid cache entry; regenerate
    }
  }

  const now = Date.now();
  const defaultClaims: AuthorizationClaims = {
    walletAddress,
    scope,
    isCardVerified: false,
    isVideoVerified: false,
    isUnder25Flagged: false,
    isIdVerified: false,
    isAdultAuthorized: false,
    authorizedAt: now,
    expiresAt: now + DEFAULT_AUTH_TTL_SECONDS * 1000,
  };

  return defaultClaims;
}

/**
 * Atomically updates authorization claims for a wallet and persists to distributed store.
 */
export async function updateAuthorizationClaimsAsync(
  walletAddress: string,
  updates: Partial<AuthorizationClaims>,
  scope: SessionScope = 'user'
): Promise<AuthorizationClaims> {
  const current = await getAuthorizationClaimsAsync(walletAddress, scope);
  const now = Date.now();

  const merged: AuthorizationClaims = {
    ...current,
    ...updates,
    walletAddress, // Immutable binding
    scope: updates.scope || current.scope,
    authorizedAt: now,
    expiresAt: now + DEFAULT_AUTH_TTL_SECONDS * 1000,
  };

  // Re-derive adult authorization status strictly based on rules
  merged.isAdultAuthorized = calculateAdultAuthorization(merged);

  const cacheKey = `auth_claims:${walletAddress}`;
  await distributedStore.set(cacheKey, JSON.stringify(merged), DEFAULT_AUTH_TTL_SECONDS);

  return merged;
}

/**
 * Scope hierarchy check: admin > creator > user
 */
export function isScopeSufficient(userScope: SessionScope, requiredScope: SessionScope): boolean {
  if (userScope === 'admin') return true;
  if (userScope === 'creator' && requiredScope !== 'admin') return true;
  return userScope === requiredScope;
}

export type AuthorizationResult =
  | {
      authorized: true;
      claims: AuthorizationClaims;
      session: SessionPayload;
    }
  | {
      authorized: false;
      status: 401 | 403;
      error: string;
      code:
        | 'AUTH_REQUIRED'
        | 'SCOPE_INSUFFICIENT'
        | 'ADULT_AUTH_REQUIRED'
        | 'CARD_REQUIRED'
        | 'VIDEO_REQUIRED'
        | 'UNDER25_ID_REQUIRED'
        | 'WALLET_MISMATCH';
    };

/**
 * High-level server-side route authorization guard.
 * Validates session, extracts or initializes authorization claims, and enforces policy.
 */
export async function authorizeRequest(
  request: Request,
  policy: AuthorizationPolicy = {}
): Promise<AuthorizationResult> {
  // 1. Session authentication
  const sessionResult = await validateRequestSessionAsync(request);
  if (!sessionResult.authenticated) {
    return {
      authorized: false,
      status: 401,
      error: sessionResult.reason || 'Authentication required.',
      code: 'AUTH_REQUIRED',
    };
  }

  const session = sessionResult.payload;

  // 2. Fetch or load authorization claims for the authenticated wallet
  const claims = await getAuthorizationClaimsAsync(session.walletAddress, session.scope);

  // 3. Wallet ownership match policy (if specified)
  if (policy.requireWalletMatch && policy.requireWalletMatch !== session.walletAddress) {
    return {
      authorized: false,
      status: 403,
      error: 'Wallet address does not match requested resource ownership.',
      code: 'WALLET_MISMATCH',
    };
  }

  // 4. Role / Scope authorization policy
  if (policy.requiredScope && !isScopeSufficient(claims.scope, policy.requiredScope)) {
    return {
      authorized: false,
      status: 403,
      error: `Insufficient role authorization. Required scope: ${policy.requiredScope}, active: ${claims.scope}.`,
      code: 'SCOPE_INSUFFICIENT',
    };
  }

  // 5. 18+ Adult Entertainment authorization policy
  if (policy.requireAdultAccess) {
    if (!claims.isCardVerified) {
      return {
        authorized: false,
        status: 403,
        error: '18+ Adult Entertainment access requires payment card authorization ($0 age check).',
        code: 'CARD_REQUIRED',
      };
    }

    if (!claims.isVideoVerified) {
      return {
        authorized: false,
        status: 403,
        error: '18+ Adult Entertainment access requires AI Sentinel live video liveness verification.',
        code: 'VIDEO_REQUIRED',
      };
    }

    if (claims.isUnder25Flagged && !claims.isIdVerified) {
      return {
        authorized: false,
        status: 403,
        error:
          'Under-25 safeguard active: AI estimated age under 25. A valid Driver’s License or Government ID card is strictly required to access Adult Entertainment.',
        code: 'UNDER25_ID_REQUIRED',
      };
    }

    if (!claims.isAdultAuthorized) {
      return {
        authorized: false,
        status: 403,
        error: '18+ Adult Entertainment authorization requirements not satisfied.',
        code: 'ADULT_AUTH_REQUIRED',
      };
    }
  }

  return {
    authorized: true,
    claims,
    session,
  };
}
