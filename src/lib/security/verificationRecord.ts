import crypto from 'crypto';
import { getSessionSecret } from './session.ts';
import { getAppEnvironment, isProductionEnvironment, type AppEnvironment } from './envConfig.ts';



export type VerificationFactor = 'card' | 'video' | 'id';

export interface VerificationRecord {
  verificationId: string;
  walletAddress: string;
  factor: VerificationFactor;
  provider: string;
  environment: AppEnvironment;
  issuedAt: number;
  expiresAt: number;
  proofId: string;
  signature: string;
  metadata?: Record<string, unknown>;
}

export const FACTOR_TTL_MS: Record<VerificationFactor, number> = {
  card: 30 * 24 * 60 * 60 * 1000, // 30 days
  video: 24 * 60 * 60 * 1000,      // 24 hours (strict biometric liveness freshness)
  id: 30 * 24 * 60 * 60 * 1000,    // 30 days
};

function canonicalRecordString(
  verificationId: string,
  walletAddress: string,
  factor: VerificationFactor,
  provider: string,
  environment: AppEnvironment,
  issuedAt: number,
  expiresAt: number,
  proofId: string
): string {
  return [
    verificationId,
    walletAddress,
    factor,
    provider,
    environment,
    issuedAt.toString(),
    expiresAt.toString(),
    proofId,
  ].join('|');
}

function signRecord(canonical: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(canonical, 'utf8')
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Creates a cryptographically signed VerificationRecord with domain separation and environment binding.
 */
export function createVerificationRecord(params: {
  walletAddress: string;
  factor: VerificationFactor;
  provider: string;
  environment?: AppEnvironment;
  proofId?: string;
  metadata?: Record<string, unknown>;
  ttlMs?: number;
}): VerificationRecord {
  const verificationId = crypto.randomUUID();
  const environment = params.environment || getAppEnvironment();
  const issuedAt = Date.now();
  const ttl = params.ttlMs || FACTOR_TTL_MS[params.factor];
  const expiresAt = issuedAt + ttl;
  const proofId = params.proofId || `proof_${crypto.randomBytes(16).toString('hex')}`;

  const canonical = canonicalRecordString(
    verificationId,
    params.walletAddress,
    params.factor,
    params.provider,
    environment,
    issuedAt,
    expiresAt,
    proofId
  );

  const signature = signRecord(canonical);

  return {
    verificationId,
    walletAddress: params.walletAddress,
    factor: params.factor,
    provider: params.provider,
    environment,
    issuedAt,
    expiresAt,
    proofId,
    signature,
    metadata: params.metadata,
  };
}

/**
 * Validates the cryptographic integrity, expiration, wallet binding, and environment eligibility of a VerificationRecord.
 * In production mode, sandbox/simulation records are NEVER converted into authorization claims.
 */
export function validateVerificationRecord(
  record: VerificationRecord,
  expectedWallet?: string,
  enforceProductionCheck: boolean = true
): { valid: true } | { valid: false; reason: string } {
  if (!record || typeof record !== 'object') {
    return { valid: false, reason: 'Invalid verification record object.' };
  }

  const {
    verificationId,
    walletAddress,
    factor,
    provider,
    environment,
    issuedAt,
    expiresAt,
    proofId,
    signature,
  } = record;

  if (
    !verificationId ||
    !walletAddress ||
    !factor ||
    !provider ||
    !environment ||
    !issuedAt ||
    !expiresAt ||
    !proofId ||
    !signature
  ) {
    return { valid: false, reason: 'Missing mandatory verification record fields.' };
  }

  // 1. Verify cryptographic signature
  const expectedCanonical = canonicalRecordString(
    verificationId,
    walletAddress,
    factor,
    provider,
    environment,
    issuedAt,
    expiresAt,
    proofId
  );
  const expectedSig = signRecord(expectedCanonical);

  if (!safeEqual(signature, expectedSig)) {
    return { valid: false, reason: 'Verification record cryptographic signature mismatch.' };
  }

  // 2. Expiration check
  const now = Date.now();
  if (now > expiresAt) {
    return { valid: false, reason: 'Verification record has expired.' };
  }

  // 3. Clock skew check (future-dated record)
  if (issuedAt > now + 60_000) {
    return { valid: false, reason: 'Verification record issue time is in the future.' };
  }

  // 4. Wallet binding check
  if (expectedWallet && walletAddress !== expectedWallet) {
    return { valid: false, reason: 'Verification record wallet address mismatch.' };
  }

  // 5. Environment boundary enforcement: NEVER allow sandbox/simulation records in production
  if (enforceProductionCheck && isProductionEnvironment()) {
    if (environment !== 'production') {
      return {
        valid: false,
        reason: `Production policy rejection: Record from '${environment}' environment cannot satisfy production authorization.`,
      };
    }
  }

  return { valid: true };
}
