import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  bindVerifiedWalletAsync,
  registerAccountAsync,
  resetAccountStoreForTests,
  setAccountRolesAsync,
} from '../../src/lib/data/accountStore.ts';
import { createAuditRequestHeaders } from '../../src/lib/security/auditHeaders.ts';
import { extractAuditContext } from '../../src/lib/security/auditContext.ts';
import {
  clearStepUpCacheForTests,
  completeStepUpAsync,
  getStepUpChallengeCountForTests,
} from '../../src/lib/security/rbac.ts';
import { requestStepUpChallengeAsync } from '../../src/lib/security/stepUpChallenge.ts';
import {
  createAccountSession,
  sessionRegistry,
  verifySessionToken,
} from '../../src/lib/security/session.ts';

process.env.SESSION_SECRET = ['nova', 'security', 'hardening', 'test', 'secret', '2026'].join('_');

function sessionRequest(token, body = {}) {
  return new Request('http://localhost/api/owner/step-up/challenge', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-client-role': 'ROLE_PLATFORM_OWNER',
      'x-is-admin': 'true',
    },
    body: JSON.stringify({
      accountId: 'attacker-selected-account',
      role: 'ROLE_PLATFORM_OWNER',
      isAdmin: true,
      ...body,
    }),
  });
}

function auditHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function runTests() {
  resetAccountStoreForTests();
  clearStepUpCacheForTests();
  sessionRegistry.clearAll();

  const owner = (await registerAccountAsync('nova_owner', 'OwnerPassword123!')).account;
  const admin = (await registerAccountAsync('nova_admin', 'AdminPassword123!')).account;
  const ordinary = (await registerAccountAsync('nova_user', 'UserPassword123!')).account;
  await setAccountRolesAsync(owner.accountId, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  await setAccountRolesAsync(admin.accountId, ['ROLE_ADMIN', 'ROLE_USER']);
  await setAccountRolesAsync(ordinary.accountId, ['ROLE_USER']);

  const ownerToken = createAccountSession(owner, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const ownerToken2 = createAccountSession(owner, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const adminToken = createAccountSession(admin, ['ROLE_ADMIN', 'ROLE_USER']);
  const forgedOrdinaryToken = createAccountSession(ordinary, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN']);

  console.log('[TEST 1] Challenge endpoint rejects unauthenticated and unauthorized requests before persistence');
  let result = await requestStepUpChallengeAsync(new Request('http://localhost/api/owner/step-up/challenge', { method: 'POST' }));
  assert.equal(result.status, 401);
  assert.equal(getStepUpChallengeCountForTests(), 0);

  result = await requestStepUpChallengeAsync(sessionRequest(forgedOrdinaryToken));
  assert.equal(result.status, 403, 'Server RBAC must ignore signed-session role claims and forged client authority fields');
  assert.equal(getStepUpChallengeCountForTests(), 0, 'Unauthorized request must not create a challenge');

  const walletAddress = 'WalletOwnershipDoesNotConferOwnerAuthority111';
  assert.equal((await bindVerifiedWalletAsync(ordinary.accountId, walletAddress, 'digest', 'audit-id')).success, true);
  result = await requestStepUpChallengeAsync(sessionRequest(forgedOrdinaryToken, { walletAddress }));
  assert.equal(result.status, 403, 'Verified wallet ownership alone must not confer privileged RBAC capability');
  assert.equal(getStepUpChallengeCountForTests(), 0);
  console.log('  PASS: 401/403 behavior and pre-persistence authorization confirmed.');

  console.log('[TEST 2] Admin and owner capability authorization permits account/session-bound challenges');
  const adminResult = await requestStepUpChallengeAsync(sessionRequest(adminToken));
  assert.equal(adminResult.status, 200);
  const ownerResult = await requestStepUpChallengeAsync(sessionRequest(ownerToken));
  assert.equal(ownerResult.status, 200);

  const ownerSession2 = verifySessionToken(ownerToken2);
  assert.equal(ownerSession2.valid, true);
  const crossSession = await completeStepUpAsync(
    owner.accountId,
    ownerResult.body.challengeNonce,
    'PASSWORD',
    'OwnerPassword123!',
    ownerSession2.payload.sessionId
  );
  assert.equal(crossSession.success, false);
  assert.equal(crossSession.status, 403, 'Challenge must remain bound to its issuing session');
  console.log('  PASS: Privileged issuance and session binding confirmed.');

  console.log('[TEST 3] Password verification, success, and challenge anti-replay remain intact');
  const wrongChallenge = await requestStepUpChallengeAsync(sessionRequest(ownerToken));
  const ownerSession = verifySessionToken(ownerToken);
  assert.equal(ownerSession.valid, true);
  const wrongPassword = await completeStepUpAsync(
    owner.accountId,
    wrongChallenge.body.challengeNonce,
    'PASSWORD',
    'WrongPassword123!',
    ownerSession.payload.sessionId
  );
  assert.equal(wrongPassword.success, false);
  assert.equal(wrongPassword.status, 401);

  const validChallenge = await requestStepUpChallengeAsync(sessionRequest(ownerToken));
  const valid = await completeStepUpAsync(
    owner.accountId,
    validChallenge.body.challengeNonce,
    'PASSWORD',
    'OwnerPassword123!',
    ownerSession.payload.sessionId
  );
  assert.equal(valid.success, true);
  assert.ok(valid.stepUpToken);
  const replay = await completeStepUpAsync(
    owner.accountId,
    validChallenge.body.challengeNonce,
    'PASSWORD',
    'OwnerPassword123!',
    ownerSession.payload.sessionId
  );
  assert.equal(replay.success, false);
  assert.equal(replay.status, 400);
  console.log('  PASS: Wrong passwords fail; valid privileged verification succeeds; replay fails.');

  console.log('[TEST 4] Middleware audit headers overwrite spoofed values and remain hashed downstream');
  const incoming = new Headers({
    'x-client-ip-for-audit': 'attacker-ip',
    'x-client-ua-for-audit': 'attacker-ua',
    'x-forwarded-for': '203.0.113.42, 10.0.0.1',
    'user-agent': 'Trusted Browser/1.0',
  });
  const forwarded = createAuditRequestHeaders(incoming);
  assert.equal(forwarded.get('x-client-ip-for-audit'), '203.0.113.42');
  assert.equal(forwarded.get('x-client-ua-for-audit'), 'Trusted Browser/1.0');
  const auditContext = extractAuditContext(new Request('http://localhost/api/owner/audit', { headers: forwarded }));
  assert.deepEqual(auditContext, {
    ipHash: auditHash('203.0.113.42'),
    userAgentHash: auditHash('Trusted Browser/1.0'),
  });
  assert.notEqual(auditContext.ipHash, '203.0.113.42');
  assert.notEqual(auditContext.userAgentHash, 'Trusted Browser/1.0');
  console.log('  PASS: Spoofed internal headers cannot override trusted, hashed audit context.');
}

runTests().catch((error) => {
  console.error('Nova hardening regression failure:', error);
  process.exit(1);
});
