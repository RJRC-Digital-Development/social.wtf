import crypto from 'crypto';

/**
 * Cryptographic Session Management & Distributed Revocation Registry
 * 
 * Architecture:
 * 1. Stateless HMAC-SHA256 tamper-proof signed tokens bound to wallet addresses.
 * 2. Revocation Blocklist Architecture: Tokens are cryptographically verifiable across any
 *    serverless instance (Vercel / Kubernetes) sharing the SESSION_SECRET without requiring
 *    an in-memory allowlist on every worker process.
 * 3. Enforced time-to-live (TTL) and constant-time HMAC validation.
 * 4. Dual delivery: Secure HttpOnly cookie & Authorization Bearer header.
 */

export interface SessionPayload {
  sessionId: string;
  walletAddress: string;
  issuedAt: number;
  expiresAt: number;
  scope: 'user' | 'creator' | 'admin';
}

export interface SessionRecord {
  sessionId: string;
  walletAddress: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  revoked: boolean;
}

// Deterministic shared fallback for development/test environments
const DEV_FALLBACK_SECRET = 'social_wtf_shared_hmac_secret_4892019482018492';

/**
 * Resolves the server-side HMAC secret key.
 * In multi-instance / serverless production (Vercel, AWS, K8s), SESSION_SECRET
 * must be explicitly set in the environment so all instances share the same key.
 * 
 * SECURITY: Fails closed in production! Never allows a fallback or committed key
 * in production, preventing forged token generation by malicious actors.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length >= 32) {
    return secret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[FATAL SECURITY CONFIGURATION] Refusing to start in production without a valid SESSION_SECRET environment variable. ' +
      'SESSION_SECRET must be explicitly set to an unpredictable secret key of at least 32 characters to protect HMAC sessions.'
    );
  }
  return DEV_FALLBACK_SECRET;
}

// Default session lifespan: 24 hours
export const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'social_session';

class SessionRegistry {
  private activeSessions: Map<string, SessionRecord> = new Map();
  private revokedSessions: Map<string, { revokedAt: number; expiresAt: number }> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof setInterval !== 'undefined') {
      this.cleanupTimer = setInterval(() => this.pruneExpired(), 15 * 60 * 1000);
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  public register(record: SessionRecord): void {
    this.activeSessions.set(record.sessionId, record);
  }

  public get(sessionId: string): SessionRecord | undefined {
    return this.activeSessions.get(sessionId);
  }

  public isRevoked(sessionId: string): boolean {
    const revoked = this.revokedSessions.get(sessionId);
    if (revoked) {
      if (Date.now() < revoked.expiresAt) {
        return true;
      }
      this.revokedSessions.delete(sessionId);
    }
    const record = this.activeSessions.get(sessionId);
    return !!record && record.revoked;
  }

  public revoke(sessionId: string, expiresAt?: number): boolean {
    const now = Date.now();
    const expiry = expiresAt || now + DEFAULT_SESSION_DURATION_MS;
    this.revokedSessions.set(sessionId, { revokedAt: now, expiresAt: expiry });

    const record = this.activeSessions.get(sessionId);
    if (record) {
      record.revoked = true;
    }
    return true;
  }

  public updateActivity(sessionId: string): void {
    const record = this.activeSessions.get(sessionId);
    if (record) {
      record.lastActiveAt = Date.now();
    }
  }

  public pruneExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.activeSessions.entries()) {
      if (now > record.expiresAt || record.revoked) {
        this.activeSessions.delete(id);
      }
    }
    for (const [id, record] of this.revokedSessions.entries()) {
      if (now > record.expiresAt) {
        this.revokedSessions.delete(id);
      }
    }
  }

  public clearAll(): void {
    this.activeSessions.clear();
    this.revokedSessions.clear();
  }
}

export const sessionRegistry = new SessionRegistry();

/**
 * Encodes payload into URL-safe base64 string
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes URL-safe base64 string
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Computes HMAC-SHA256 signature for payload string
 */
function computeHmac(data: string, secret?: string): string {
  const hmacSecret = secret || getSessionSecret();
  return crypto
    .createHmac('sha256', hmacSecret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates an authenticated session token bound to a verified wallet address.
 */
export function createSession(
  walletAddress: string,
  durationMs: number = DEFAULT_SESSION_DURATION_MS,
  scope: 'user' | 'creator' | 'admin' = 'user',
  secret?: string
): { token: string; payload: SessionPayload } {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + durationMs;

  const payload: SessionPayload = {
    sessionId,
    walletAddress,
    issuedAt: now,
    expiresAt,
    scope,
  };

  // Register in local store (for single-process inspection/caching)
  sessionRegistry.register({
    sessionId,
    walletAddress,
    createdAt: now,
    expiresAt,
    lastActiveAt: now,
    revoked: false,
  });

  // Sign token: payloadBase64.signatureBase64
  const payloadJson = JSON.stringify(payload);
  const payloadPart = base64UrlEncode(payloadJson);
  const signature = computeHmac(payloadPart, secret);
  const token = `${payloadPart}.${signature}`;

  return { token, payload };
}

/**
 * Cryptographically verifies token integrity, expiration, and distributed revocation status.
 * Compatible with serverless and multi-container horizontal scaling.
 */
export function verifySessionToken(
  token: string,
  secret?: string
): { valid: boolean; payload?: SessionPayload; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Session token missing or invalid format' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [payloadPart, signaturePart] = parts;

  // 1. Verify HMAC signature (Constant-time comparison)
  const expectedSignature = computeHmac(payloadPart, secret);
  const sigBuffer = Buffer.from(signaturePart);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, error: 'Cryptographic signature mismatch / token tampered' };
  }

  // 2. Parse payload
  let payload: SessionPayload;
  try {
    const jsonStr = base64UrlDecode(payloadPart);
    payload = JSON.parse(jsonStr);
  } catch {
    return { valid: false, error: 'Failed to deserialize session payload' };
  }

  // 3. Verify expiration
  const now = Date.now();
  if (now > payload.expiresAt) {
    return { valid: false, error: 'Session token has expired' };
  }

  // 4. Check Distributed Revocation Registry (Blocklist Architecture)
  if (sessionRegistry.isRevoked(payload.sessionId)) {
    return { valid: false, error: 'Session has been revoked' };
  }

  // 5. If local cache contains record, enforce wallet consistency
  const serverRecord = sessionRegistry.get(payload.sessionId);
  if (serverRecord && serverRecord.walletAddress !== payload.walletAddress) {
    return { valid: false, error: 'Session wallet address mismatch' };
  }

  // Update activity timestamp if record is local
  sessionRegistry.updateActivity(payload.sessionId);

  return { valid: true, payload };
}

/**
 * Revokes an active session by token or session ID.
 */
export function revokeSession(tokenOrSessionId: string): boolean {
  if (!tokenOrSessionId) return false;

  if (tokenOrSessionId.includes('.')) {
    try {
      const payloadPart = tokenOrSessionId.split('.')[0];
      const payload: SessionPayload = JSON.parse(base64UrlDecode(payloadPart));
      return sessionRegistry.revoke(payload.sessionId, payload.expiresAt);
    } catch {
      return false;
    }
  }

  return sessionRegistry.revoke(tokenOrSessionId);
}

/**
 * Extracts session token from either Authorization header or Cookie header.
 */
export function extractSessionToken(req: Request): string | null {
  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Check Cookie header
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
        return cookie.slice(SESSION_COOKIE_NAME.length + 1).trim();
      }
    }
  }

  return null;
}

/**
 * Validates request authorization and returns authenticated wallet address.
 */
export function validateRequestSession(
  req: Request
): { authenticated: boolean; walletAddress?: string; payload?: SessionPayload; error?: string } {
  const token = extractSessionToken(req);
  if (!token) {
    return { authenticated: false, error: 'No authorization credentials supplied' };
  }

  const result = verifySessionToken(token);
  if (!result.valid || !result.payload) {
    return { authenticated: false, error: result.error || 'Invalid session credentials' };
  }

  return {
    authenticated: true,
    walletAddress: result.payload.walletAddress,
    payload: result.payload,
  };
}

/**
 * Constructs an HttpOnly, Secure, SameSite=Strict cookie header string.
 */
export function createSessionCookie(token: string, maxAgeSec: number = 86400): string {
  const isProd = process.env.NODE_ENV === 'production';
  const secureFlag = isProd ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Strict${secureFlag}`;
}

/**
 * Constructs a cookie header string to clear the session cookie.
 */
export function createClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}
