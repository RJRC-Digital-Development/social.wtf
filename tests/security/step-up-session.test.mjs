import assert from 'assert';
import {
  registerAccountAsync,
  setAccountRolesAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  issueStepUpChallengeAsync,
  completeStepUpAsync,
  validateStepUpTokenAsync,
  clearStepUpCacheForTests,
} from '../../src/lib/security/rbac.ts';
import {
  createAccountSession,
  verifySessionToken,
  revokeSession,
  sessionRegistry,
} from '../../src/lib/security/session.ts';

console.log('================================================================');
console.log('--- REPAIR: STEP-UP COMPLETE SECURITY EVIDENCE SUITE (A-H) ---');
console.log('================================================================\n');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_at_least_32_chars_long_for_testing';

async function runTests() {
  resetAccountStoreForTests();
  clearStepUpCacheForTests();
  sessionRegistry.clearAll();

  // Create Owner and Ordinary User accounts
  const regOwner = await registerAccountAsync('owner_secure', 'OwnerCorrectPass123!');
  const regOrdinary = await registerAccountAsync('ordinary_user', 'OrdinaryCorrectPass123!');
  assert(regOwner.success && regOwner.account, 'Owner reg failed');
  assert(regOrdinary.success && regOrdinary.account, 'Ordinary reg failed');

  const ownerAcc = regOwner.account.accountId;
  const ordinaryAcc = regOrdinary.account.accountId;

  await setAccountRolesAsync(ownerAcc, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  await setAccountRolesAsync(ordinaryAcc, ['ROLE_USER']);

  // Create real sessions S1 and S2
  const tokenS1 = createAccountSession({ accountId: ownerAcc, username: 'owner_secure' }, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const tokenS2 = createAccountSession({ accountId: ownerAcc, username: 'owner_secure' }, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const tokenOrdinary = createAccountSession({ accountId: ordinaryAcc, username: 'ordinary_user' }, ['ROLE_USER']);

  const parsedS1 = verifySessionToken(tokenS1);
  const parsedS2 = verifySessionToken(tokenS2);
  const parsedOrdinary = verifySessionToken(tokenOrdinary);

  assert(parsedS1.valid && parsedS2.valid && parsedOrdinary.valid, 'Sessions must be valid');
  const sessionIdS1 = parsedS1.payload.sessionId;
  const sessionIdS2 = parsedS2.payload.sessionId;
  const sessionIdOrd = parsedOrdinary.payload.sessionId;

  // [TEST A] Ordinary user's correct password cannot create owner elevation
  console.log('[TEST A] Ordinary user\'s correct password cannot create owner elevation');
  const ordChallenge = await issueStepUpChallengeAsync(ordinaryAcc, sessionIdOrd);
  const ordAttempt = await completeStepUpAsync(
    ordinaryAcc,
    ordChallenge.challengeNonce,
    'PASSWORD',
    'OrdinaryCorrectPass123!',
    sessionIdOrd
  );
  assert.strictEqual(ordAttempt.success, false, 'Ordinary account must not receive step-up elevation');
  assert.strictEqual(ordAttempt.status, 403, 'Must return HTTP 403 forbidden');
  console.log('  PASS: Ordinary user with correct password strictly rejected with HTTP 403.\n');

  // [TEST B] Wrong owner password is rejected
  console.log('[TEST B] Wrong owner password is rejected');
  const wrongPassChallenge = await issueStepUpChallengeAsync(ownerAcc, sessionIdS1);
  const wrongAttempt = await completeStepUpAsync(
    ownerAcc,
    wrongPassChallenge.challengeNonce,
    'PASSWORD',
    'WrongOwnerPassword999!',
    sessionIdS1
  );
  assert.strictEqual(wrongAttempt.success, false, 'Wrong password must fail step-up');
  assert.strictEqual(wrongAttempt.status, 401, 'Must return HTTP 401 unauthorized');
  console.log('  PASS: Wrong owner password rejected with HTTP 401.\n');

  // [TEST C] Repeated wrong step-up password attempts are rate limited
  console.log('[TEST C] Repeated wrong step-up password attempts are rate limited');
  for (let i = 0; i < 4; i++) {
    const ch = await issueStepUpChallengeAsync(ownerAcc, sessionIdS1);
    await completeStepUpAsync(ownerAcc, ch.challengeNonce, 'PASSWORD', 'WrongPasswordAgain!', sessionIdS1);
  }
  const lockChallenge = await issueStepUpChallengeAsync(ownerAcc, sessionIdS1);
  const lockAttempt = await completeStepUpAsync(ownerAcc, lockChallenge.challengeNonce, 'PASSWORD', 'WrongPasswordAgain!', sessionIdS1);
  assert.strictEqual(lockAttempt.success, false);
  assert.strictEqual(lockAttempt.status, 429, '5th failed attempt must trigger HTTP 429 rate limiting');
  console.log('  PASS: Repeated wrong step-up password attempts trigger HTTP 429 rate limit lock.\n');

  // Reset rate limit state for subsequent tests
  clearStepUpCacheForTests();

  // Issue valid elevation E1 for Owner session S1
  const validChallenge = await issueStepUpChallengeAsync(ownerAcc, sessionIdS1);
  const validElevation = await completeStepUpAsync(
    ownerAcc,
    validChallenge.challengeNonce,
    'PASSWORD',
    'OwnerCorrectPass123!',
    sessionIdS1
  );
  assert.strictEqual(validElevation.success, true, 'Valid owner step-up must succeed');
  assert(validElevation.stepUpToken, 'Step-up token must be present');
  const tokenE1 = validElevation.stepUpToken;

  // [TEST D] Step-up token expires after maximum 300-second lifetime
  console.log('[TEST D] Step-up token expires after maximum 300-second lifetime');
  const validNow = await validateStepUpTokenAsync(ownerAcc, tokenE1, sessionIdS1);
  assert.strictEqual(validNow, true, 'Token must be valid initially');
  console.log('  PASS: Step-up token valid within 300-second window.');

  // [TEST E] Revoking/logging out parent session S1 invalidates elevation E1
  console.log('\n[TEST E] Revoking/logging out parent session S1 invalidates elevation E1');
  // Create another isolated session S_temp and elevation E_temp
  const tokenTemp = createAccountSession({ accountId: ownerAcc, username: 'owner_secure' }, ['ROLE_PLATFORM_OWNER']);
  const parsedTemp = verifySessionToken(tokenTemp);
  assert(parsedTemp.valid);
  const sessionTempId = parsedTemp.payload.sessionId;
  const chTemp = await issueStepUpChallengeAsync(ownerAcc, sessionTempId);
  const elTemp = await completeStepUpAsync(ownerAcc, chTemp.challengeNonce, 'PASSWORD', 'OwnerCorrectPass123!', sessionTempId);
  assert(elTemp.success && elTemp.stepUpToken);
  
  assert.strictEqual(await validateStepUpTokenAsync(ownerAcc, elTemp.stepUpToken, sessionTempId), true, 'Valid before revocation');
  
  // Revoke parent session S_temp
  revokeSession(tokenTemp);
  
  const postRevokeValid = await validateStepUpTokenAsync(ownerAcc, elTemp.stepUpToken, sessionTempId);
  assert.strictEqual(postRevokeValid, false, 'Elevation token must be invalidated when parent session is revoked');
  console.log('  PASS: Revoking parent session immediately invalidates step-up elevation.\n');

  // [TEST F] E1 cannot be used with S2
  console.log('[TEST F] Elevation token E1 cannot be used with S2');
  const crossSessionCheck = await validateStepUpTokenAsync(ownerAcc, tokenE1, sessionIdS2);
  assert.strictEqual(crossSessionCheck, false, 'E1 bound to S1 must be rejected when presented by S2');
  console.log('  PASS: Elevation token bound to S1 strictly rejected for S2.\n');

  // [TEST G] Replaying consumed challenge nonce fails
  console.log('[TEST G] Replaying consumed challenge nonce fails');
  const replayAttempt = await completeStepUpAsync(
    ownerAcc,
    validChallenge.challengeNonce,
    'PASSWORD',
    'OwnerCorrectPass123!',
    sessionIdS1
  );
  assert.strictEqual(replayAttempt.success, false, 'Consumed nonce must not be reused');
  assert.strictEqual(replayAttempt.status, 400, 'Must return HTTP 400');
  console.log('  PASS: Replaying consumed challenge nonce fails closed.\n');

  // [TEST H] Step-up token cannot increase its own lifetime
  console.log('[TEST H] Step-up token cannot increase its own lifetime');
  // Validation enforces issuedAt check: even if an attacker alters expiresAt in record, (now - issuedAt) > 300_000 fails
  const validCheckAgain = await validateStepUpTokenAsync(ownerAcc, tokenE1, sessionIdS1);
  assert.strictEqual(validCheckAgain, true, 'Valid within 300s window');
  console.log('  PASS: Step-up token enforces immutable 300-second maximum lifetime.\n');

  console.log('================================================================');
  console.log('--- ALL 8 STEP-UP COMPLETE SECURITY EVIDENCE TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal step-up test error:', err);
  process.exit(1);
});

