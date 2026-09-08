import crypto from 'crypto';

/**
 * Cryptographic Session Management & Server-Side Revocation Registry
 * 
 * Implements:
 * 1. HMAC-SHA256 tamper-proof signed session tokens bound to wallet addresses.
 * 2. Server-side session registry with active revocation (logout) capability.
 * 3. Enforced time-to-live (TTL) and activity timestamp tracking.
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

// Server-side secret key for HMAC signing (persisted in env or generated on instance start)
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'social_wtf_session_hmac_secret_' + crypto.randomBytes(32).toString('hex');

// Default session lifespan: 24 hours
export const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'social_session';

class SessionRegistry {
  private sessions: Map<string, SessionRecord> = new Map();
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
    this.sessions.set(record.sessionId, record);
  }

  public get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  public revoke(sessionId: string): boolean {
    const record = this.sessions.get(sessionId);
    if (record) {
      record.revoked = true;
      return true;
    }
    return false;
  }

  public updateActivity(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (record) {
      record.lastActiveAt = Date.now();
    }
  }

  public pruneExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.sessions.entries()) {
      if (now > record.expiresAt || record.revoked) {
        this.sessions.delete(id);
      }
    }
  }

  public clearAll(): void {
    this.sessions.clear();
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
function computeHmac(data: string, secret: string = SESSION_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
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
  scope: 'user' | 'creator' | 'admin' = 'user'
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

  // Register in stateful server-side store
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
  const signature = computeHmac(payloadPart);
  const token = `${payloadPart}.${signature}`;

  return { token, payload };
}

/**
 * Cryptographically verifies token integrity, expiration, and server-side revocation status.
 */
export function verifySessionToken(
  token: string,
  secret: string = SESSION_SECRET
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

  // 4. Check server-side revocation registry
  const serverRecord = sessionRegistry.get(payload.sessionId);
  if (!serverRecord) {
    return { valid: false, error: 'Session not found in server registry' };
  }

  if (serverRecord.revoked) {
    return { valid: false, error: 'Session has been revoked' };
  }

  if (serverRecord.walletAddress !== payload.walletAddress) {
    return { valid: false, error: 'Session wallet address mismatch' };
  }

  // Update activity timestamp
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
      return sessionRegistry.revoke(payload.sessionId);
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
