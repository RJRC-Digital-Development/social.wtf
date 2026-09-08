import assert from 'assert';
import crypto from 'crypto';

console.log('--- RUNNING CRYPTOGRAPHIC SESSION & REVOCATION REGISTRY TESTS ---');

const SESSION_SECRET = 'test_secret_' + crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE_NAME = 'social_session';

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

  revoke(sessionId, expiresAt) {
    const now = Date.now();
    const expiry = expiresAt || now + 86400000;
    this.revokedSessions.set(sessionId, { revokedAt: now, expiresAt: expiry });
    const record = this.activeSessions.get(sessionId);
    if (record) {
      record.revoked = true;
    }
    return true;
  }

  updateActivity(sessionId) {
    const record = this.activeSessions.get(sessionId);
    if (record) {
      record.lastActiveAt = Date.now();
    }
  }

  pruneExpired() {
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

  clearAll() {
    this.activeSessions.clear();
    this.revokedSessions.clear();
  }
}

const sessionRegistry = new SessionRegistry();

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function computeHmac(data, secret = SESSION_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createSession(walletAddress, durationMs = 86400000, scope = 'user', secret = SESSION_SECRET, registry = sessionRegistry) {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + durationMs;

  const payload = {
    sessionId,
    walletAddress,
    issuedAt: now,
    expiresAt,
    scope,
  };

  registry.register({
    sessionId,
    walletAddress,
    createdAt: now,
    expiresAt,
    lastActiveAt: now,
    revoked: false,
  });

  const payloadJson = JSON.stringify(payload);
  const payloadPart = base64UrlEncode(payloadJson);
  const signature = computeHmac(payloadPart, secret);
  const token = `${payloadPart}.${signature}`;

  return { token, payload };
}

function verifySessionToken(token, secret = SESSION_SECRET, registry = sessionRegistry) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Session token missing or invalid format' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [payloadPart, signaturePart] = parts;

  const expectedSignature = computeHmac(payloadPart, secret);
  const sigBuffer = Buffer.from(signaturePart);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, error: 'Cryptographic signature mismatch / token tampered' };
  }

  let payload;
  try {
    const jsonStr = base64UrlDecode(payloadPart);
    payload = JSON.parse(jsonStr);
  } catch {
    return { valid: false, error: 'Failed to deserialize session payload' };
  }

  const now = Date.now();
  if (now > payload.expiresAt) {
    return { valid: false, error: 'Session token has expired' };
  }

  // Blocklist check: token is valid across instances unless explicitly revoked
  if (registry.isRevoked(payload.sessionId)) {
    return { valid: false, error: 'Session has been revoked' };
  }

  const serverRecord = registry.get(payload.sessionId);
  if (serverRecord && serverRecord.walletAddress !== payload.walletAddress) {
    return { valid: false, error: 'Session wallet address mismatch' };
  }

  registry.updateActivity(payload.sessionId);
  return { valid: true, payload };
}

function revokeSession(tokenOrSessionId, registry = sessionRegistry) {
  if (!tokenOrSessionId) return false;

  if (tokenOrSessionId.includes('.')) {
    try {
      const payloadPart = tokenOrSessionId.split('.')[0];
      const payload = JSON.parse(base64UrlDecode(payloadPart));
      return registry.revoke(payload.sessionId, payload.expiresAt);
    } catch {
      return false;
    }
  }

  return registry.revoke(tokenOrSessionId);
}

function extractSessionToken(headers) {
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = headers['cookie'] || headers['Cookie'];
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

function createSessionCookie(token, maxAgeSec = 86400) {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Strict`;
}

function createClearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}

// ======================== TEST SUITES ========================

// Test 1: Valid Session Creation and Verification
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const { token, payload } = createSession(wallet);

  assert.ok(token.includes('.'), 'Token must be composed of payload.signature');
  const result = verifySessionToken(token);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.payload.walletAddress, wallet);
  assert.strictEqual(result.payload.sessionId, payload.sessionId);
  console.log('✓ Test 1: Authentic session token created and verified successfully');
}

// Test 2: Cryptographic Tampering and Forgery Detection
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const { token } = createSession(wallet);
  const [payloadPart, sigPart] = token.split('.');

  // 2a. Modify payload (attacker tries to change wallet address)
  const decodedPayload = JSON.parse(base64UrlDecode(payloadPart));
  decodedPayload.walletAddress = 'AttackerAddress111111111111111111111111111';
  const forgedPayloadPart = base64UrlEncode(JSON.stringify(decodedPayload));
  const forgedToken = `${forgedPayloadPart}.${sigPart}`;

  const tamperResult = verifySessionToken(forgedToken);
  assert.strictEqual(tamperResult.valid, false);
  assert.strictEqual(tamperResult.error, 'Cryptographic signature mismatch / token tampered');

  // 2b. Modify signature byte
  const corruptedSig = sigPart.slice(0, -1) + (sigPart.endsWith('a') ? 'b' : 'a');
  const corruptSigToken = `${payloadPart}.${corruptedSig}`;
  const corruptResult = verifySessionToken(corruptSigToken);
  assert.strictEqual(corruptResult.valid, false);

  // 2c. Token signed by attacker's secret key
  const attackerSecret = 'attacker_secret_key_1234567890';
  const forgedWithAttackerKey = createSession(wallet, 86400000, 'user', attackerSecret);
  const rogueResult = verifySessionToken(forgedWithAttackerKey.token);
  assert.strictEqual(rogueResult.valid, false);
  assert.strictEqual(rogueResult.error, 'Cryptographic signature mismatch / token tampered');

  console.log('✓ Test 2: Payload tampering, signature corruption, and attacker keys rejected');
}

// Test 3: Expiration Enforcement
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const { token } = createSession(wallet, -10000);

  const result = verifySessionToken(token);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.error, 'Session token has expired');
  console.log('✓ Test 3: Expired session token rejected');
}

// Test 4: Server-Side Revocation Registry (Logout)
{
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  const { token, payload } = createSession(wallet);

  assert.strictEqual(verifySessionToken(token).valid, true);

  const revoked = revokeSession(token);
  assert.strictEqual(revoked, true);

  const afterRevoke = verifySessionToken(token);
  assert.strictEqual(afterRevoke.valid, false);
  assert.strictEqual(afterRevoke.error, 'Session has been revoked');

  console.log('✓ Test 4: Server-side session revocation & immediate invalidation verified');
}

// Test 5: Session Registry Pruning
{
  sessionRegistry.clearAll();
  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';

  const { token: activeToken, payload: activePayload } = createSession(wallet, 100000);
  const { token: expiredToken, payload: expiredPayload } = createSession(wallet, -1000);
  const { token: revokedToken, payload: revokedPayload } = createSession(wallet, 100000);
  revokeSession(revokedToken);

  sessionRegistry.pruneExpired();

  assert.ok(sessionRegistry.get(activePayload.sessionId) !== undefined, 'Active session must remain');
  assert.strictEqual(sessionRegistry.get(expiredPayload.sessionId), undefined, 'Expired session must be pruned');

  console.log('✓ Test 5: Registry pruning cleanly purges expired sessions');
}

// Test 6: Wallet Address Binding Enforcement
{
  const walletA = 'WalletAAAA1111111111111111111111111111111111';
  const walletB = 'WalletBBBB2222222222222222222222222222222222';
  const { token, payload } = createSession(walletA);

  const record = sessionRegistry.get(payload.sessionId);
  record.walletAddress = walletB;

  const result = verifySessionToken(token);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.error, 'Session wallet address mismatch');

  console.log('✓ Test 6: Cryptographic wallet binding strictly enforced against address tampering');
}

// Test 7: Token Extraction from Headers and Cookies
{
  const token = 'sample.payload.signature';

  const authHeaders = { authorization: `Bearer ${token}` };
  assert.strictEqual(extractSessionToken(authHeaders), token);

  const cookieHeaders = { cookie: `theme=dark; ${SESSION_COOKIE_NAME}=${token}; visitor_id=42` };
  assert.strictEqual(extractSessionToken(cookieHeaders), token);

  assert.strictEqual(extractSessionToken({}), null);

  console.log('✓ Test 7: Dual Bearer and HttpOnly Cookie credential extraction verified');
}

// Test 8: Cookie Header Formatting
{
  const token = 'test.token.val';
  const sessionCookie = createSessionCookie(token);
  assert.ok(sessionCookie.includes(`${SESSION_COOKIE_NAME}=${token}`));
  assert.ok(sessionCookie.includes('HttpOnly'));
  assert.ok(sessionCookie.includes('SameSite=Strict'));
  assert.ok(sessionCookie.includes('Max-Age=86400'));

  const clearCookie = createClearSessionCookie();
  assert.ok(clearCookie.includes(`${SESSION_COOKIE_NAME}=;`));
  assert.ok(clearCookie.includes('Max-Age=0'));

  console.log('✓ Test 8: HttpOnly / SameSite=Strict cookie headers generated correctly');
}

// Test 9: Serverless / Multi-Instance Cross-Worker Verification (Vercel / Lambda Test)
{
  const sharedSecret = 'shared_production_secret_key_88192048';
  const instanceARegistry = new SessionRegistry();
  const instanceBRegistry = new SessionRegistry(); // completely separate memory heap!

  const wallet = 'CookDegen7xG4kQYv8rT3mP9wLs2eKnBh6ZaF1cD';
  
  // Instance A issues token
  const { token, payload } = createSession(wallet, 86400000, 'user', sharedSecret, instanceARegistry);

  // Instance B receives the request — memory has zero entries from Instance A
  assert.strictEqual(instanceBRegistry.get(payload.sessionId), undefined);

  // Instance B verifies statelessly via HMAC + expiration + blocklist
  const crossInstanceResult = verifySessionToken(token, sharedSecret, instanceBRegistry);
  assert.strictEqual(crossInstanceResult.valid, true);
  assert.strictEqual(crossInstanceResult.payload.walletAddress, wallet);
  assert.strictEqual(crossInstanceResult.payload.sessionId, payload.sessionId);

  // Revoke token on Instance B
  instanceBRegistry.revoke(payload.sessionId);
  const afterRevokeResult = verifySessionToken(token, sharedSecret, instanceBRegistry);
  assert.strictEqual(afterRevokeResult.valid, false);
  assert.strictEqual(afterRevokeResult.error, 'Session has been revoked');

  console.log('✓ Test 9: Serverless cross-instance verification passes without in-memory dependency');
}

console.log('ALL CRYPTOGRAPHIC SESSION TESTS PASSED!\n');
