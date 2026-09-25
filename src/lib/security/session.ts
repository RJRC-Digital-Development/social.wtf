import { distributedStore } from './distributedStore.ts';
import crypto from 'crypto';
import type { Account, AccountRole } from '../../types/account.ts';

export type SessionScope = 'user' | 'creator' | 'admin';

export interface SessionPayload {
  sessionId: string;
  accountId: string;
  username: string;
  walletAddress: string;
  issuedAt: number;
  expiresAt: number;
  roles?: AccountRole[];
  scope: SessionScope;
}

export interface SessionRecord {
  sessionId: string;
  accountId: string;
  username: string;
  walletAddress?: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  revoked: boolean;
}

export const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;
const TOKEN_VERSION = 'v2';
const LEGACY_TOKEN_VERSION = 'v1';

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      '[SECURITY] SESSION_SECRET must be configured and contain at least 32 characters.'
    );
  }

  return secret;
}

function isSessionScope(value: unknown): value is SessionScope {
  return value === 'user' || value === 'creator' || value === 'admin';
}

function isValidAccountId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= 128;
}

function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 64;
}

function isValidSessionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validateSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Record<string, unknown>;

  if (!isValidSessionId(payload.sessionId)) return false;
  if (!isValidAccountId(payload.accountId)) return false;
  if (!isValidUsername(payload.username)) return false;
  if (!isValidTimestamp(payload.issuedAt)) return false;
  if (!isValidTimestamp(payload.expiresAt)) return false;
  if (!isSessionScope(payload.scope)) return false;

  if (payload.expiresAt <= payload.issuedAt) return false;

  return true;
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

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export class SessionRegistry {
  private readonly activeSessions = new Map<string, SessionRecord>();
  private readonly revokedSessions = new Map<string, number>();
  private readonly accountRevocationCutoffs = new Map<string, number>();

  register(record: SessionRecord): void {
    this.activeSessions.set(record.sessionId, record);
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.activeSessions.get(sessionId);
  }

  isRevoked(sessionId: string): boolean {
    const expiresAt = this.revokedSessions.get(sessionId);

    if (expiresAt === undefined) {
      return false;
    }

    if (expiresAt <= Date.now()) {
      this.revokedSessions.delete(sessionId);
      return false;
    }

    return true;
  }

  isAccountSessionRevoked(accountId: string, issuedAt: number): boolean {
    const cutoff = this.accountRevocationCutoffs.get(accountId);
    if (cutoff !== undefined && issuedAt <= cutoff) {
      return true;
    }
    return false;
  }

  revoke(sessionId: string, expiresAt: number): void {
    this.revokedSessions.set(sessionId, expiresAt);

    const record = this.activeSessions.get(sessionId);
    if (record) {
      record.revoked = true;
    }
  }

  revokeAllAccountSessions(accountId: string, cutoff: number = Date.now()): void {
    this.accountRevocationCutoffs.set(accountId, cutoff);
    for (const record of this.activeSessions.values()) {
      if (record.accountId === accountId && record.createdAt <= cutoff) {
        record.revoked = true;
      }
    }
  }

  updateActivity(sessionId: string): void {
    const record = this.activeSessions.get(sessionId);

    if (record && !record.revoked) {
      record.lastActiveAt = Date.now();
    }
  }

  clearAll(): void {
    this.activeSessions.clear();
    this.revokedSessions.clear();
    this.accountRevocationCutoffs.clear();
  }
}

export const sessionRegistry = new SessionRegistry();

/**
 * Account-First Session Creation
 */
export function createAccountSession(
  account: { accountId: string; username: string; primaryWalletAddress?: string },
  roles: AccountRole[] = ['ROLE_USER'],
  scope: SessionScope = 'user',
  durationMs = DEFAULT_SESSION_DURATION_MS
): string {
  const now = Date.now();
  const sessionId = crypto.randomUUID();

  const payload: SessionPayload = {
    sessionId,
    accountId: account.accountId,
    username: account.username,
    walletAddress: account.primaryWalletAddress || account.accountId,
    issuedAt: now,
    expiresAt: now + durationMs,
    roles,
    scope: roles.includes('ROLE_ADMIN') || roles.includes('ROLE_PLATFORM_OWNER') ? 'admin' : scope,
  };

  sessionRegistry.register({
    sessionId,
    accountId: account.accountId,
    username: account.username,
    walletAddress: account.primaryWalletAddress || account.accountId,
    createdAt: now,
    expiresAt: payload.expiresAt,
    lastActiveAt: now,
    revoked: false,
  });

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(`${TOKEN_VERSION}.${encodedPayload}`);

  return `${TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

import { bindTestSessionWallet, getAccountByIdAsync } from '../data/accountStore.ts';

/**
 * Legacy/Bridge Session Creator (for tests and SIWS bridge)
 */
export function createSession(
  walletAddress: string,
  scope: SessionScope = 'user',
  durationMs = DEFAULT_SESSION_DURATION_MS
): string {
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const accountId = `user-${walletAddress}`;
  const username = walletAddress.substring(0, 8);

  bindTestSessionWallet(walletAddress, accountId);

  const payload: SessionPayload = {
    sessionId,
    accountId,
    username,
    walletAddress,
    issuedAt: now,
    expiresAt: now + durationMs,
    roles: scope === 'admin' ? ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER'] : ['ROLE_USER'],
    scope,
  };

  sessionRegistry.register({
    sessionId,
    accountId,
    username,
    walletAddress,
    createdAt: now,
    expiresAt: payload.expiresAt,
    lastActiveAt: now,
    revoked: false,
  });

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(`${TOKEN_VERSION}.${encodedPayload}`);

  return `${TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(
  token: string
):
  | {
      valid: true;
      payload: SessionPayload;
    }
  | {
      valid: false;
      reason: string;
    } {
  try {
    if (typeof token !== 'string' || token.length > 4096) {
      return {
        valid: false,
        reason: 'Invalid session token.',
      };
    }

    const parts = token.split('.');

    if (parts.length !== 3) {
      return {
        valid: false,
        reason: 'Invalid session token format.',
      };
    }

    const [version, encodedPayload, suppliedSignature] = parts;

    if (version !== TOKEN_VERSION && version !== LEGACY_TOKEN_VERSION) {
      return {
        valid: false,
        reason: 'Unsupported session token version.',
      };
    }

    if (!encodedPayload || !suppliedSignature) {
      return {
        valid: false,
        reason: 'Invalid session token.',
      };
    }

    const expectedSignature = sign(`${version}.${encodedPayload}`);

    if (!safeEqual(suppliedSignature, expectedSignature)) {
      return {
        valid: false,
        reason: 'Invalid session token signature.',
      };
    }

    const rawPayload = decodeBase64Url(encodedPayload);
    const parsedPayload: any = JSON.parse(rawPayload);

    // Support legacy payload upgrade
    if (version === LEGACY_TOKEN_VERSION || !parsedPayload.accountId) {
      parsedPayload.accountId = parsedPayload.walletAddress ? `user-${parsedPayload.walletAddress}` : parsedPayload.sessionId;
      parsedPayload.username = parsedPayload.username || parsedPayload.walletAddress?.substring(0, 8) || 'user';
    }

    if (!validateSessionPayload(parsedPayload)) {
      return {
        valid: false,
        reason: 'Invalid session token payload.',
      };
    }

    const now = Date.now();

    if (parsedPayload.expiresAt <= now) {
      return {
        valid: false,
        reason: 'Session expired.',
      };
    }

    if (parsedPayload.issuedAt > now + 60_000) {
      return {
        valid: false,
        reason: 'Invalid session issue time.',
      };
    }

    if (sessionRegistry.isRevoked(parsedPayload.sessionId)) {
      return {
        valid: false,
        reason: 'Session revoked.',
      };
    }

    if (sessionRegistry.isAccountSessionRevoked(parsedPayload.accountId, parsedPayload.issuedAt)) {
      return {
        valid: false,
        reason: 'Session revoked.',
      };
    }

    const localRecord = sessionRegistry.get(parsedPayload.sessionId);

    if (localRecord) {
      if (localRecord.accountId !== parsedPayload.accountId) {
        return {
          valid: false,
          reason: 'Session account mismatch.',
        };
      }

      if (localRecord.revoked) {
        return {
          valid: false,
          reason: 'Session revoked.',
        };
      }

      sessionRegistry.updateActivity(parsedPayload.sessionId);
    }

    return {
      valid: true,
      payload: parsedPayload,
    };
  } catch {
    return {
      valid: false,
      reason: 'Invalid session token.',
    };
  }
}

export function revokeSession(token: string): boolean {
  const verification = verifySessionToken(token);

  if (!verification.valid) {
    return false;
  }

  const { sessionId, expiresAt } = verification.payload;
  sessionRegistry.revoke(sessionId, expiresAt);
  return true;
}

export function extractSessionToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');

  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      const candidate = match[1].trim();
      // Only treat candidate as bearer token if it is not an empty/placeholder value
      // and conforms to token format (3 dot-separated segments)
      if (
        candidate &&
        candidate !== 'null' &&
        candidate !== 'undefined' &&
        candidate !== '""' &&
        candidate !== "''" &&
        candidate.split('.').length === 3
      ) {
        return candidate;
      }
    }
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator === -1) continue;

    const name = cookie.slice(0, separator).trim();
    if (name !== 'session') continue;

    const val = decodeURIComponent(cookie.slice(separator + 1).trim());
    if (val && val !== 'null' && val !== 'undefined') {
      return val;
    }
  }

  return null;
}

export function validateRequestSession(
  request: Request
):
  | {
      authenticated: true;
      payload: SessionPayload;
    }
  | {
      authenticated: false;
      reason: string;
    } {
  const token = extractSessionToken(request);

  if (!token) {
    return {
      authenticated: false,
      reason: 'Authentication required.',
    };
  }

  const verification = verifySessionToken(token);

  if (!verification.valid) {
    return {
      authenticated: false,
      reason: verification.reason,
    };
  }

  return {
    authenticated: true,
    payload: verification.payload,
  };
}

export function createSessionCookie(token: string, expiresAt: number): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return [
    `session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure,
  ]
    .filter(Boolean)
    .join('; ');
}

export function createClearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return [
    'session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    secure,
  ]
    .filter(Boolean)
    .join('; ');
}

export async function revokeSessionAsync(token: string): Promise<boolean> {
  const localSuccess = revokeSession(token);
  if (!localSuccess) return false;

  const verification = verifySessionToken(token);
  if (verification.valid) {
    const ttlSeconds = Math.max(0, Math.ceil((verification.payload.expiresAt - Date.now()) / 1000));
    await distributedStore.set(`revoked_session:${verification.payload.sessionId}`, '1', ttlSeconds);
  }

  return true;
}

export async function revokeAllAccountSessionsAsync(
  accountId: string,
  cutoff: number = Date.now()
): Promise<boolean> {
  sessionRegistry.revokeAllAccountSessions(accountId, cutoff);

  const ttlSeconds = Math.ceil(DEFAULT_SESSION_DURATION_MS / 1000);
  const ok = await distributedStore.set(`account:revoked_before:${accountId}`, cutoff.toString(), ttlSeconds);
  if (!ok) {
    throw new Error('Failed to persist account revocation cutoff to distributed store.');
  }

  return true;
}

export async function validateSessionTokenAsync(
  token: string
): Promise<
  | {
      valid: true;
      payload: SessionPayload;
    }
  | {
      valid: false;
      reason: string;
    }
> {
  const syncResult = verifySessionToken(token);
  if (!syncResult.valid) {
    return syncResult;
  }

  // Account security epoch check: ensure session was issued AFTER the latest password/security update
  const account = await getAccountByIdAsync(syncResult.payload.accountId);
  if (account) {
    if (account.status === 'SUSPENDED' || account.status === 'DEACTIVATED') {
      return {
        valid: false,
        reason: 'Account is not active.',
      };
    }
    const epoch = account.securityEpoch || account.passwordChangedAt;
    if (epoch && syncResult.payload.issuedAt < epoch) {
      sessionRegistry.revoke(syncResult.payload.sessionId, syncResult.payload.expiresAt);
      return {
        valid: false,
        reason: 'Session revoked due to credential update.',
      };
    }
  }

  const isRevoked = await distributedStore.get(`revoked_session:${syncResult.payload.sessionId}`);
  if (isRevoked) {
    sessionRegistry.revoke(syncResult.payload.sessionId, syncResult.payload.expiresAt);
    return {
      valid: false,
      reason: 'Session revoked.',
    };
  }

  const cutoffStr = await distributedStore.get(`account:revoked_before:${syncResult.payload.accountId}`);
  if (cutoffStr) {
    const cutoff = parseInt(cutoffStr, 10);
    if (!isNaN(cutoff) && syncResult.payload.issuedAt <= cutoff) {
      sessionRegistry.revokeAllAccountSessions(syncResult.payload.accountId, cutoff);
      return {
        valid: false,
        reason: 'Session revoked.',
      };
    }
  }

  return syncResult;
}

export async function validateRequestSessionAsync(request: Request): Promise<
  | {
      authenticated: true;
      payload: SessionPayload;
    }
  | {
      authenticated: false;
      reason: string;
    }
> {
  const token = extractSessionToken(request);

  if (!token) {
    return {
      authenticated: false,
      reason: 'Authentication required.',
    };
  }

  const tokenValidation = await validateSessionTokenAsync(token);
  if (!tokenValidation.valid) {
    return {
      authenticated: false,
      reason: tokenValidation.reason,
    };
  }

  return {
    authenticated: true,
    payload: tokenValidation.payload,
  };
}
