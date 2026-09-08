import crypto from 'crypto';

export type SessionScope = 'user' | 'creator' | 'admin';

export interface SessionPayload {
  sessionId: string;
  walletAddress: string;
  issuedAt: number;
  expiresAt: number;
  scope: SessionScope;
}

export interface SessionRecord {
  sessionId: string;
  walletAddress: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  revoked: boolean;
}

export const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;
const TOKEN_VERSION = 'v1';

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

function isValidWalletAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  // Solana public keys are base58 and normally 32 bytes.
  // Avoid accepting arbitrarily large attacker-controlled strings.
  if (value.length < 32 || value.length > 44) return false;

  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value);
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0;
}

function validateSessionPayload(
  value: unknown
): value is SessionPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Record<string, unknown>;

  if (!isValidSessionId(payload.sessionId)) return false;
  if (!isValidWalletAddress(payload.walletAddress)) return false;
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

  revoke(sessionId: string, expiresAt: number): void {
    this.revokedSessions.set(sessionId, expiresAt);

    const record = this.activeSessions.get(sessionId);

    if (record) {
      record.revoked = true;
    }
  }

  updateActivity(sessionId: string): void {
    const record = this.activeSessions.get(sessionId);

    if (record && !record.revoked) {
      record.lastActiveAt = Date.now();
    }
  }

  pruneExpired(now = Date.now()): void {
    for (const [sessionId, record] of this.activeSessions) {
      if (record.expiresAt <= now) {
        this.activeSessions.delete(sessionId);
      }
    }

    for (const [sessionId, expiresAt] of this.revokedSessions) {
      if (expiresAt <= now) {
        this.revokedSessions.delete(sessionId);
      }
    }
  }

  clearAll(): void {
    this.activeSessions.clear();
    this.revokedSessions.clear();
  }
}

export const sessionRegistry = new SessionRegistry();

export function createSession(
  walletAddress: string,
  scope: SessionScope = 'user',
  durationMs = DEFAULT_SESSION_DURATION_MS
): string {
  if (!isValidWalletAddress(walletAddress)) {
    throw new Error('Invalid wallet address.');
  }

  if (!isSessionScope(scope)) {
    throw new Error('Invalid session scope.');
  }

  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > DEFAULT_SESSION_DURATION_MS
  ) {
    throw new Error('Invalid session duration.');
  }

  const now = Date.now();

  const sessionId = crypto.randomUUID();

  const payload: SessionPayload = {
    sessionId,
    walletAddress,
    issuedAt: now,
    expiresAt: now + durationMs,
    scope,
  };

  sessionRegistry.register({
    sessionId,
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

    if (version !== TOKEN_VERSION) {
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
    const parsedPayload: unknown = JSON.parse(rawPayload);

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

    const localRecord = sessionRegistry.get(parsedPayload.sessionId);

    if (localRecord) {
      if (
        localRecord.walletAddress !== parsedPayload.walletAddress
      ) {
        return {
          valid: false,
          reason: 'Session wallet mismatch.',
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

export function revokeSession(
  token: string
): boolean {
  const verification = verifySessionToken(token);

  if (!verification.valid) {
    return false;
  }

  const { sessionId, expiresAt } = verification.payload;

  sessionRegistry.revoke(sessionId, expiresAt);

  return true;
}

export function extractSessionToken(
  request: Request
): string | null {
  const authorization = request.headers.get('authorization');

  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (match?.[1]) {
      return match[1].trim();
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

    return decodeURIComponent(
      cookie.slice(separator + 1).trim()
    );
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

export function createSessionCookie(
  token: string,
  expiresAt: number
): string {
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt - Date.now()) / 1000)
  );

  const secure = process.env.NODE_ENV === 'production'
    ? '; Secure'
    : '';

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
  const secure = process.env.NODE_ENV === 'production'
    ? '; Secure'
    : '';

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
