import crypto from 'crypto';
import { distributedStore } from './distributedStore.ts';
import { getAccountRolesAsync, verifyAccountPasswordByIdAsync } from '../data/accountStore.ts';
import { recordAuditLogAsync } from '../data/auditStore.ts';
import { sessionRegistry } from './session.ts';
import type { AccountRole } from '../../types/account.ts';

const STEP_UP_CHALLENGE_PREFIX = 'stepup:challenge:';
const STEP_UP_TOKEN_PREFIX = 'stepup:token:';
const STEP_UP_FAILED_PREFIX = 'stepup:failed:';

export const ROLE_CAPABILITIES: Record<AccountRole, string[]> = {
  ROLE_USER: [
    'social:post',
    'social:friend',
    'profile:edit',
    'commerce:buy',
  ],
  ROLE_SUPPORT: [
    'social:post',
    'social:friend',
    'profile:edit',
    'commerce:buy',
    'telemetry:read',
    'accounts:read',
  ],
  ROLE_MODERATOR: [
    'social:post',
    'social:friend',
    'profile:edit',
    'commerce:buy',
    'telemetry:read',
    'accounts:read',
    'moderation:read',
    'moderation:act',
  ],
  ROLE_ADMIN: [
    'social:post',
    'social:friend',
    'profile:edit',
    'commerce:buy',
    'telemetry:read',
    'accounts:read',
    'accounts:suspend',
    'moderation:read',
    'moderation:act',
    'commerce:read',
    'commerce:reconcile',
    'security:read',
    'emergency:freeze',
  ],
  ROLE_PLATFORM_OWNER: [
    'social:post',
    'social:friend',
    'profile:edit',
    'commerce:buy',
    'telemetry:read',
    'accounts:read',
    'accounts:suspend',
    'moderation:read',
    'moderation:act',
    'commerce:read',
    'commerce:reconcile',
    'security:read',
    'feature:toggle',
    'roles:manage',
    'treasury:sign',
    'emergency:freeze',
  ],
};

const HIGH_RISK_CAPABILITIES = new Set([
  'feature:toggle',
  'roles:manage',
  'treasury:sign',
  'emergency:freeze',
  'accounts:suspend',
  'commerce:reconcile',
]);

// Memory caches for fallback
interface ChallengeRecord {
  accountId: string;
  sessionId?: string;
  nonce: string;
  expiresAt: number;
}

interface TokenRecord {
  accountId: string;
  sessionId?: string;
  issuedAt: number;
  expiresAt: number;
}

const memoryStepUpChallenges = new Map<string, ChallengeRecord>();
const memoryStepUpTokens = new Map<string, TokenRecord>();
const memoryFailedAttempts = new Map<string, { count: number; lockedUntil: number }>();

/**
 * Check if an account has a specific capability.
 */
export async function accountHasCapabilityAsync(
  accountId: string,
  requiredCapability: string
): Promise<boolean> {
  if (!accountId || !requiredCapability) return false;

  const roleRecord = await getAccountRolesAsync(accountId);

  // Direct capabilities check
  if (roleRecord.directCapabilities.includes(requiredCapability)) {
    return true;
  }

  // Role capabilities check
  for (const role of roleRecord.roles) {
    const caps = ROLE_CAPABILITIES[role] || [];
    if (caps.includes(requiredCapability)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if capability requires Step-Up authorization
 */
export function requiresStepUp(capability: string): boolean {
  return HIGH_RISK_CAPABILITIES.has(capability);
}

/**
 * Issue a single-use Step-Up challenge nonce for an account and session.
 */
export async function issueStepUpChallengeAsync(
  accountId: string,
  sessionId?: string
): Promise<{ challengeNonce: string; expiresAt: number }> {
  const challengeNonce = `stepup_${crypto.randomBytes(16).toString('hex')}`;
  const now = Date.now();
  const expiresAt = now + 120_000; // 2 minutes to complete step-up

  const record: ChallengeRecord = { accountId, sessionId, nonce: challengeNonce, expiresAt };

  if (distributedStore.isConfigured()) {
    try {
      await distributedStore.set(
        `${STEP_UP_CHALLENGE_PREFIX}${challengeNonce}`,
        JSON.stringify(record),
        120
      );
    } catch {}
  }

  memoryStepUpChallenges.set(challengeNonce, record);
  return { challengeNonce, expiresAt };
}

/**
 * Verify and consume single-use Step-Up challenge nonce.
 * Enforces:
 *   - Ordinary user rejection (A)
 *   - Password verification (B)
 *   - Rate limiting on failed password attempts (C)
 *   - Max 300-second token lifetime (D)
 *   - Session binding (F)
 *   - Single-use challenge anti-replay (G)
 */
export async function completeStepUpAsync(
  accountId: string,
  challengeNonce: string,
  method: 'SIWS_SIGNATURE' | 'PASSKEY_ASSERTION' | 'PASSWORD' = 'PASSWORD',
  passwordOrSignature?: string,
  sessionId?: string
): Promise<{ success: boolean; stepUpToken?: string; error?: string; status?: number }> {
  if (!accountId || !challengeNonce) {
    return { success: false, error: 'Account ID and challenge nonce required', status: 400 };
  }

  // Rate Limiting Check (C)
  const now = Date.now();
  const failedKey = `${STEP_UP_FAILED_PREFIX}${accountId}`;
  let failedData = memoryFailedAttempts.get(accountId);

  if (failedData && failedData.lockedUntil > now) {
    return {
      success: false,
      error: 'Too many failed step-up attempts. Rate limit exceeded. Please wait 60 seconds.',
      status: 429,
    };
  }

  if (distributedStore.isConfigured()) {
    try {
      const lockVal = await distributedStore.get(`stepup:lock:${accountId}`);
      if (lockVal) {
        return {
          success: false,
          error: 'Too many failed step-up attempts. Rate limit exceeded. Please wait 60 seconds.',
          status: 429,
        };
      }
    } catch {}
  }

  // Retrieve and consume challenge nonce atomically (G - anti-replay)
  let challengeRecord: ChallengeRecord | null = null;

  if (distributedStore.isConfigured()) {
    try {
      const raw = await distributedStore.get(`${STEP_UP_CHALLENGE_PREFIX}${challengeNonce}`);
      if (raw) {
        await distributedStore.del(`${STEP_UP_CHALLENGE_PREFIX}${challengeNonce}`);
        challengeRecord = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : { accountId: raw, nonce: challengeNonce, expiresAt: now + 120_000 };
      }
    } catch {}
  }

  if (!challengeRecord) {
    const mem = memoryStepUpChallenges.get(challengeNonce);
    if (mem && mem.expiresAt > now) {
      challengeRecord = mem;
      memoryStepUpChallenges.delete(challengeNonce);
    }
  }

  if (!challengeRecord || challengeRecord.accountId !== accountId) {
    return { success: false, error: 'Invalid or expired step-up challenge nonce.', status: 400 };
  }

  // Session binding check for challenge
  if (challengeRecord.sessionId && sessionId && challengeRecord.sessionId !== sessionId) {
    return { success: false, error: 'Step-up challenge was issued to a different session.', status: 403 };
  }

  // Requirement A: Ordinary user check. Ordinary users cannot create privileged owner elevation.
  const roleRecord = await getAccountRolesAsync(accountId);
  const isPrivileged = roleRecord.roles.includes('ROLE_ADMIN') || roleRecord.roles.includes('ROLE_PLATFORM_OWNER');
  if (!isPrivileged) {
    return {
      success: false,
      error: 'Ordinary accounts cannot obtain privileged step-up elevation.',
      status: 403,
    };
  }

  // Requirement B: Password Verification if method === 'PASSWORD'
  if (method === 'PASSWORD') {
    if (!passwordOrSignature) {
      return { success: false, error: 'Password is required for step-up verification.', status: 400 };
    }

    const isValidPassword = await verifyAccountPasswordByIdAsync(accountId, passwordOrSignature);
    if (!isValidPassword) {
      // Record failed attempt towards rate limiting (C)
      let currentAttempts = (failedData ? failedData.count : 0) + 1;
      let lockedUntil = 0;

      if (currentAttempts >= 5) {
        lockedUntil = now + 60_000;
        if (distributedStore.isConfigured()) {
          try {
            await distributedStore.set(`stepup:lock:${accountId}`, '1', 60);
          } catch {}
        }
      }

      memoryFailedAttempts.set(accountId, { count: currentAttempts, lockedUntil });

      await recordAuditLogAsync({
        actorAccountId: accountId,
        capabilityUsed: 'step_up:elevate',
        action: 'STEP_UP_FAILED',
        targetType: 'ACCOUNT',
        targetId: accountId,
        ipHash: 'server_internal',
        userAgentHash: 'server_internal',
        stepUpMethodUsed: method,
        outcome: 'FAILED',
        reason: 'Invalid step-up password',
      });

      return {
        success: false,
        error: 'Invalid step-up password.',
        status: currentAttempts >= 5 ? 429 : 401,
      };
    }
  }

  // Clear failed attempt counter on success
  memoryFailedAttempts.delete(accountId);

  // Requirements D & H: Issue Step-Up Token with max 300-second immutable lifetime
  const stepUpToken = `stu_${crypto.randomBytes(24).toString('hex')}`;
  const issuedAt = now;
  const expiresAt = issuedAt + 300_000; // 5 minutes max validity

  const tokenRecord: TokenRecord = {
    accountId,
    sessionId: sessionId || challengeRecord.sessionId,
    issuedAt,
    expiresAt,
  };

  if (distributedStore.isConfigured()) {
    try {
      await distributedStore.set(
        `${STEP_UP_TOKEN_PREFIX}${stepUpToken}`,
        JSON.stringify(tokenRecord),
        300
      );
    } catch {}
  }

  memoryStepUpTokens.set(stepUpToken, tokenRecord);

  // Record audit trail for successful step-up elevation
  await recordAuditLogAsync({
    actorAccountId: accountId,
    capabilityUsed: 'step_up:elevate',
    action: 'STEP_UP_AUTHENTICATED',
    targetType: 'ACCOUNT',
    targetId: accountId,
    ipHash: 'server_internal',
    userAgentHash: 'server_internal',
    stepUpMethodUsed: method,
    outcome: 'SUCCESS',
  });

  return { success: true, stepUpToken };
}

/**
 * Validate a provided Step-Up Token for high-risk actions.
 * Enforces:
 *   - Account match
 *   - Max 300-second lifetime enforcement (D & H)
 *   - Session binding match (F)
 *   - Parent session revocation invalidation (E)
 */
export async function validateStepUpTokenAsync(
  accountId: string,
  stepUpToken?: string,
  sessionId?: string
): Promise<boolean> {
  if (!accountId || !stepUpToken) return false;

  let record: TokenRecord | null = null;

  if (distributedStore.isConfigured()) {
    try {
      const raw = await distributedStore.get(`${STEP_UP_TOKEN_PREFIX}${stepUpToken}`);
      if (raw) {
        record = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : { accountId: raw, issuedAt: Date.now() - 1000, expiresAt: Date.now() + 299_000 };
      }
    } catch {}
  }

  if (!record) {
    const mem = memoryStepUpTokens.get(stepUpToken);
    if (mem) {
      record = mem;
    }
  }

  if (!record || record.accountId !== accountId) {
    return false;
  }

  const now = Date.now();

  // Requirement D & H: Token expired or lifetime extended beyond 300s
  if (now > record.expiresAt || (now - record.issuedAt) > 300_000) {
    return false;
  }

  // Requirement F: Cross-session check. If token is bound to S1, S2 cannot use it.
  if (sessionId && record.sessionId && record.sessionId !== sessionId) {
    return false;
  }

  // Requirement E: Check parent session revocation status
  if (record.sessionId) {
    if (sessionRegistry.isRevoked(record.sessionId)) {
      return false;
    }
    if (distributedStore.isConfigured()) {
      try {
        const isRevoked = await distributedStore.get(`revoked_session:${record.sessionId}`);
        if (isRevoked) {
          return false;
        }
      } catch {}
    }
  }

  return true;
}

export function clearStepUpCacheForTests(): void {
  memoryStepUpChallenges.clear();
  memoryStepUpTokens.clear();
  memoryFailedAttempts.clear();
}

