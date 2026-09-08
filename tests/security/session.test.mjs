import assert from 'assert';
import crypto from 'crypto';

console.log('--- RUNNING CRYPTOGRAPHIC SESSION & REVOCATION REGISTRY TESTS ---');

const DEFAULT_TEST_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || DEFAULT_TEST_SECRET;

const MIN_SECRET_LENGTH = 32;
const TOKEN_VERSION = 'v1';

function getSessionSecret(env = process.env) {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      '[SECURITY] SESSION_SECRET must be configured and contain at least 32 characters.'
    );
  }
  return secret;
}

function isSessionScope(value) {
  return value === 'user' || value === 'creator' || value === 'admin';
}

function isValidWalletAddress(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 32 || value.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

function isValidSessionId(value) {
  return typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value);
}

function isValidTimestamp(value) {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0;
}

function validateSessionPayload(value) {
  if (!value || typeof value !== 'object') return false;
  const payload = value;
  if (!isValidSessionId(payload.sessionId)) return false;
  if (!isValidWalletAddress(payload.walletAddress)) return false;
  if (!isValidTimestamp(payload.issuedAt)) return false;
  if (!isValidTimestamp(payload.expiresAt)) return false;
  if (!isSessionScope(payload.scope)) return false;
  if (payload.expiresAt <= payload.issuedAt) return false;
  return true;
}

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  return Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');
}

function sign(data, secret = getSessionSecret()) {
  return crypto
    .createHmac('sha256', secret)
    .update(data, 'utf8')
    .digest('base64url');
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

class SessionRegistry {
  constructor() {
    this.activeSessions = new Map();
    this.revokedSessions = new Map();
  }

  register(record) {
    this.activeSessions.set(record.sessionId, record);
  }

  get(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  isRevoked(sessionId) {
    const expiresAt = this.revokedSessions.get(sessionId);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      this.revokedSessions.delete(sessionId);
      return false;
    }
    return true;
  }

  revoke(sessionId, expiresAt) {
    this.revokedSessions.set(sessionId, expiresAt);
    const record = this.activeSessions.get(sessionId);
    if (record) {
      record.revoked = true;
    }
  }

  updateActivity(sessionId) {
    const record = this.activeSessions.get(sessionId);
    if (record && !record.revoked) {
      record.lastActiveAt = Date.now();
    }
  }

  pruneExpired(now = Date.now()) {
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

  clearAll() {
    this.activeSessions.clear();
    this.revokedSessions.clear();
  }
}

const sessionRegistry = new SessionRegistry();

function createSession(
  walletAddress,
  scope = 'user',
  durationMs = 24 * 60 * 60 * 1000,
  secret = getSessionSecret(),
  registry = sessionRegistry
) {
  if (!isValidWalletAddress(walletAddress)) {
    throw new Error('Invalid wallet address.');
  }
  if (!isSessionScope(scope)) {
    throw new Error('Invalid session scope.');
  }
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
    throw new Error('Invalid session duration.');
  }

  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const payload = {
    sessionId,
    walletAddress,
    issuedAt: now,
    expiresAt: now + durationMs,
    scope,
  };

  registry.register({
    sessionId,
    walletAddress,
    createdAt: now,
    expiresAt: payload.expiresAt,
    lastActiveAt: now,
    revoked: false,
  });

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(`${TOKEN_VERSION}.${encodedPayload}`, secret);

  return `${TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

function verifySessionToken(token, secret = getSessionSecret(), registry = sessionRegistry) {
  try {
    if (typeof token !== 'string' || token.length > 4096) {
      return { valid: false, reason: 'Invalid session token.' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'Invalid session token format.' };
    }

    const [version, encodedPayload, suppliedSignature] = parts;
    if (version !== TOKEN_VERSION) {
      return { valid: false, reason: 'Unsupported session token version.' };
    }

    if (!encodedPayload || !suppliedSignature) {
      return { valid: false, reason: 'Invalid session token.' };
    }

    const expectedSignature = sign(`${version}.${encodedPayload}`, secret);
    if (!safeEqual(suppliedSignature, expectedSignature)) {
      return { valid: false, reason: 'Invalid session token signature.' };
    }

    const rawPayload = decodeBase64Url(encodedPayload);
    const parsedPayload = JSON.parse(rawPayload);

    if (!validateSessionPayload(parsedPayload)) {
      return { valid: false, reason: 'Invalid session token payload.' };
    }

    const now = Date.now();
    if (parsedPayload.expiresAt <= now) {
      return { valid: false, reason: 'Session expired.' };
    }

    if (parsedPayload.issuedAt > now + 60_000) {
      return { valid: false, reason: 'Invalid session issue time.' };
    }

    if (registry.isRevoked(parsedPayload.sessionId)) {
      return { valid: false, reason: 'Session revoked.' };
    }

    const localRecord = registry.get(parsedPayload.sessionId);
    if (localRecord) {
      if (localRecord.walletAddress !== parsedPayload.walletAddress) {
        return { valid: false, reason: 'Session wallet mismatch.' };
      }
      if (localRecord.revoked) {
        return { valid: false, reason: 'Session revoked.' };
      }
      registry.updateActivity(parsedPayload.sessionId);
    }

    return { valid: true, payload: parsedPayload };
  } catch {
    return { valid: false, reason: 'Invalid session token.' };
  }
}

function revokeSession(token, secret = getSessionSecret(), registry = sessionRegistry) {
  const verification = verifySessionToken(token, secret, registry);
  if (!verification.valid) {
    return false;
  }
  const { sessionId, expiresAt } = verification.payload;
  registry.revoke(sessionId, expiresAt);
  return true;
}

function extractSessionToken(headers) {
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const cookieHeader = headers['cookie'] || headers['Cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const separator = cookie.indexOf('=');
      if (separator === -1) continue;
      const name = cookie.slice(0, separator).trim();
      if (name !== 'session') continue;
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }

  return null;
}

function createSessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function createClearSessionCookie() {
  return 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

// ======================== TEST SUITES ========================

// Test 1: Valid Session Creation and Verification
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const token = createSession(wallet, 'user');

  const parts = token.split('.');
  assert.strictEqual(parts.length, 3, 'Token must have 3 parts: v1.payload.signature');
  assert.strictEqual(parts[0], 'v1');

  const result = verifySessionToken(token);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.payload.walletAddress, wallet);
  assert.strictEqual(result.payload.scope, 'user');
  console.log('✓ Test 1: Authentic session token created and verified successfully');
}

// Test 2: Cryptographic Tampering and Forgery Detection
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const token = createSession(wallet, 'user');
  const [version, payloadPart, sigPart] = token.split('.');

  // 2a. Modify payload (attacker tries to change wallet address)
  const decodedPayload = JSON.parse(decodeBase64Url(payloadPart));
  decodedPayload.walletAddress = 'AttackerAddress111111111111111111111111111';
  const forgedPayloadPart = encodeBase64Url(JSON.stringify(decodedPayload));
  const forgedToken = `${version}.${forgedPayloadPart}.${sigPart}`;

  const tamperResult = verifySessionToken(forgedToken);
  assert.strictEqual(tamperResult.valid, false);
  assert.strictEqual(tamperResult.reason, 'Invalid session token signature.');

  // 2b. Modify signature byte
  const corruptedSig = sigPart.slice(0, -1) + (sigPart.endsWith('a') ? 'b' : 'a');
  const corruptSigToken = `${version}.${payloadPart}.${corruptedSig}`;
  const corruptResult = verifySessionToken(corruptSigToken);
  assert.strictEqual(corruptResult.valid, false);
  assert.strictEqual(corruptResult.reason, 'Invalid session token signature.');

  // 2c. Token signed by rogue secret key
  const rogueSecret = 'rogue_attacker_secret_key_32_characters_long_12345';
  const forgedWithRogueKey = createSession(wallet, 'user', 86400000, rogueSecret);
  const rogueResult = verifySessionToken(forgedWithRogueKey);
  assert.strictEqual(rogueResult.valid, false);
  assert.strictEqual(rogueResult.reason, 'Invalid session token signature.');

  console.log('✓ Test 2: Payload tampering, signature corruption, and attacker keys rejected');
}

// Test 3: Expiration Enforcement
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  // Create an expired payload directly
  const expiredPayload = {
    sessionId: crypto.randomUUID(),
    walletAddress: wallet,
    issuedAt: Date.now() - 100000,
    expiresAt: Date.now() - 50000,
    scope: 'user'
  };
  const encoded = encodeBase64Url(JSON.stringify(expiredPayload));
  const sig = sign(`${TOKEN_VERSION}.${encoded}`);
  const expiredToken = `${TOKEN_VERSION}.${encoded}.${sig}`;

  const result = verifySessionToken(expiredToken);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, 'Session expired.');
  console.log('✓ Test 3: Expired session token rejected');
}

// Test 4: Server-Side Revocation Registry (Logout)
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const token = createSession(wallet, 'user');

  assert.strictEqual(verifySessionToken(token).valid, true);

  const revoked = revokeSession(token);
  assert.strictEqual(revoked, true);

  const afterRevoke = verifySessionToken(token);
  assert.strictEqual(afterRevoke.valid, false);
  assert.strictEqual(afterRevoke.reason, 'Session revoked.');

  console.log('✓ Test 4: Server-side session revocation & immediate invalidation verified');
}

// Test 5: Session Registry Pruning
{
  sessionRegistry.clearAll();
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';

  const activeToken = createSession(wallet, 'user', 100000);
  const vActive = verifySessionToken(activeToken);

  const expiredSessionId = crypto.randomUUID();
  sessionRegistry.register({
    sessionId: expiredSessionId,
    walletAddress: wallet,
    createdAt: Date.now() - 2000,
    expiresAt: Date.now() - 1000,
    lastActiveAt: Date.now() - 2000,
    revoked: false,
  });

  sessionRegistry.pruneExpired();

  assert.ok(sessionRegistry.get(vActive.payload.sessionId) !== undefined, 'Active session must remain');
  assert.strictEqual(sessionRegistry.get(expiredSessionId), undefined, 'Expired session must be pruned');

  console.log('✓ Test 5: Registry pruning cleanly purges expired sessions');
}

// Test 6: Wallet Address Binding Enforcement
{
  const walletA = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const walletB = 'Soc1aLwtfWaLLetAddress1111111111111111111';
  const token = createSession(walletA, 'user');
  const v = verifySessionToken(token);

  const record = sessionRegistry.get(v.payload.sessionId);
  record.walletAddress = walletB;

  const result = verifySessionToken(token);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, 'Session wallet mismatch.');

  console.log('✓ Test 6: Cryptographic wallet binding strictly enforced against address tampering');
}

// Test 7: Token Extraction from Headers and Cookies
{
  const token = 'v1.samplePayload.sampleSig';

  const authHeaders = { authorization: `Bearer ${token}` };
  assert.strictEqual(extractSessionToken(authHeaders), token);

  const cookieHeaders = { cookie: `theme=dark; session=${token}; visitor_id=42` };
  assert.strictEqual(extractSessionToken(cookieHeaders), token);

  assert.strictEqual(extractSessionToken({}), null);

  console.log('✓ Test 7: Dual Bearer and HttpOnly Cookie credential extraction verified');
}

// Test 8: Cookie Header Formatting
{
  const token = 'v1.testToken.val';
  const expiresAt = Date.now() + 86400000;
  const sessionCookie = createSessionCookie(token, expiresAt);
  assert.ok(sessionCookie.includes(`session=${encodeURIComponent(token)}`));
  assert.ok(sessionCookie.includes('HttpOnly'));
  assert.ok(sessionCookie.includes('SameSite=Strict'));
  assert.ok(sessionCookie.includes('Max-Age='));

  const clearCookie = createClearSessionCookie();
  assert.ok(clearCookie.includes('session=;'));
  assert.ok(clearCookie.includes('Max-Age=0'));

  console.log('✓ Test 8: HttpOnly / SameSite=Strict cookie headers generated correctly');
}

// Test 9: Serverless / Multi-Instance Cross-Worker Verification (Vercel / Lambda Test)
{
  const sharedSecret = 'shared_production_secret_key_8819204812345678';
  const instanceARegistry = new SessionRegistry();
  const instanceBRegistry = new SessionRegistry(); // completely separate memory heap!

  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  
  // Instance A issues token
  const token = createSession(wallet, 'user', 86400000, sharedSecret, instanceARegistry);
  const parsed = verifySessionToken(token, sharedSecret, instanceARegistry);

  // Instance B receives the request — memory has zero entries from Instance A
  assert.strictEqual(instanceBRegistry.get(parsed.payload.sessionId), undefined);

  // Instance B verifies statelessly via HMAC signature
  const crossInstanceResult = verifySessionToken(token, sharedSecret, instanceBRegistry);
  assert.strictEqual(crossInstanceResult.valid, true);
  assert.strictEqual(crossInstanceResult.payload.walletAddress, wallet);
  assert.strictEqual(crossInstanceResult.payload.sessionId, parsed.payload.sessionId);

  // Revoke token on Instance B
  revokeSession(token, sharedSecret, instanceBRegistry);
  const afterRevokeResult = verifySessionToken(token, sharedSecret, instanceBRegistry);
  assert.strictEqual(afterRevokeResult.valid, false);
  assert.strictEqual(afterRevokeResult.reason, 'Session revoked.');

  console.log('✓ Test 9: Serverless cross-instance verification passes without in-memory dependency');
}

// Test 10: Fail-Closed Secret Enforcement
{
  assert.throws(
    () => {
      getSessionSecret({ SESSION_SECRET: '' });
    },
    /\[SECURITY\] SESSION_SECRET must be configured and contain at least 32 characters\./,
    'Must fail closed if SESSION_SECRET is not configured'
  );

  assert.throws(
    () => {
      getSessionSecret({ SESSION_SECRET: 'short_key_under_32_chars' });
    },
    /\[SECURITY\] SESSION_SECRET must be configured and contain at least 32 characters\./,
    'Must fail closed if SESSION_SECRET is too short (< 32 chars)'
  );

  const validSecret = 'super_secret_production_key_1234567890123456';
  assert.strictEqual(
    getSessionSecret({ SESSION_SECRET: validSecret }),
    validSecret
  );

  console.log('✓ Test 10: Production and development fail-closed secret enforcement strictly verified');
}

console.log('ALL CRYPTOGRAPHIC SESSION TESTS PASSED!\n');
