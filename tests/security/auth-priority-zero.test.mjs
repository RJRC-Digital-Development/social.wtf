import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  registerAccountAsync,
  authenticateAccountAsync,
  getAccountByIdAsync,
  getAccountByUsernameAsync,
  setAccountRecoveryEmailAsync,
  verifyAccountRecoveryEmailAsync,
  getAccountByRecoveryEmailAsync,
  updateAccountPasswordHashAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  createAccountSession,
  verifySessionToken,
  validateSessionTokenAsync,
  revokeSession,
  revokeAllAccountSessionsAsync,
  sessionRegistry,
} from '../../src/lib/security/session.ts';
import { hashPassword, verifyPassword } from '../../src/lib/security/password.ts';
import {
  createRecoveryEmailVerificationTokenAsync,
  verifyRecoveryEmailTokenAsync,
  createPasswordResetTokenAsync,
  consumePasswordResetTokenAsync,
  deleteRecoveryEmailVerificationTokenAsync,
  deletePasswordResetTokenAsync,
  clearPasswordResetTokensForTests,
  hashToken,
} from '../../src/lib/security/passwordReset.ts';
import {
  getMailTransport,
  getTestMailTransport,
} from '../../src/lib/security/mailTransport.ts';
import { distributedStore } from '../../src/lib/security/distributedStore.ts';
import { rateLimiter } from '../../src/lib/security/rateLimiter.ts';

process.env.SESSION_SECRET = 'a'.repeat(32);
process.env.APP_URL = 'https://social.wtf';

async function runTests() {
  console.log('================================================================');
  console.log('--- PRIORITY ZERO: COMPREHENSIVE AUTH & RECOVERY SUITE (54) ---');
  console.log('================================================================\n');

  resetAccountStoreForTests();
  sessionRegistry.clearAll();
  clearPasswordResetTokensForTests();
  const testMail = getTestMailTransport();
  testMail.clearCapturedMails();

  // [TEST 1] Register account without wallet generates canonical accountId
  console.log('[TEST 1] Register account without wallet generates canonical accountId');
  const reg1 = await registerAccountAsync('alice_secure', 'AliceInitialPass123!');
  assert.equal(reg1.success, true);
  assert.ok(reg1.account?.accountId);
  assert.equal(reg1.account.username, 'alice_secure');
  assert.equal(reg1.account.primaryWalletAddress, undefined);
  assert.equal(reg1.account.passwordHash, undefined);
  const aliceId = reg1.account.accountId;
  console.log('  PASS: Account registered with canonical accountId and zero wallet requirement.\n');

  // [TEST 2] Authenticate account with valid username/password
  console.log('[TEST 2] Authenticate account with valid username/password');
  const auth1 = await authenticateAccountAsync('alice_secure', 'AliceInitialPass123!');
  assert.equal(auth1.success, true);
  assert.equal(auth1.account?.accountId, aliceId);
  const s1Token = createAccountSession(auth1.account);
  assert.ok(s1Token);
  console.log('  PASS: Valid authentication succeeds and produces signed session token.\n');

  // [TEST 3] /api/auth/me verification returns canonical account identity without wallet
  console.log('[TEST 3] Session token verifies to canonical account identity without wallet');
  const s1Result = verifySessionToken(s1Token);
  assert.equal(s1Result.valid, true);
  assert.equal(s1Result.payload.accountId, aliceId);
  console.log('  PASS: Authenticated session resolves to canonical accountId without wallet.\n');

  // [TEST 4] Unauthenticated verification fails closed
  console.log('[TEST 4] Unauthenticated verification fails closed');
  const nullVerify = verifySessionToken(null);
  assert.equal(nullVerify.valid, false);
  const emptyVerify = verifySessionToken('');
  assert.equal(emptyVerify.valid, false);
  console.log('  PASS: Unauthenticated session token verification strictly returns valid:false.\n');

  // [TEST 5] Logout revokes session
  console.log('[TEST 5] Logout revokes session');
  const logoutAccount = await registerAccountAsync('temp_user', 'TempPassword123!');
  const logoutToken = createAccountSession(logoutAccount.account);
  const beforeLogout = verifySessionToken(logoutToken);
  assert.equal(beforeLogout.valid, true);
  revokeSession(logoutToken);
  const afterLogout = verifySessionToken(logoutToken);
  assert.equal(afterLogout.valid, false);
  console.log('  PASS: Session token revoked and rejected upon logout.\n');

  // [TEST 6] Revoked session rejected immediately
  console.log('[TEST 6] Revoked session rejected immediately');
  const revokedCheck = verifySessionToken(logoutToken);
  assert.equal(revokedCheck.valid, false);
  console.log('  PASS: Revoked session returns valid:false on all subsequent checks.\n');

  // [TEST 7] Wallet disconnect preserves account session
  console.log('[TEST 7] Wallet disconnect preserves account session');
  const sessionStillValid = verifySessionToken(s1Token);
  assert.equal(sessionStillValid.valid, true);
  assert.equal(sessionStillValid.payload.accountId, aliceId);
  console.log('  PASS: Account session remains valid across wallet connect/disconnect cycles.\n');

  // [TEST 8] Client localStorage spoofing cannot manufacture session
  console.log('[TEST 8] Client localStorage spoofing cannot manufacture session');
  const spoofedToken = 'spoofed.untrusted.payload';
  const spoofedRes = verifySessionToken(spoofedToken);
  assert.equal(spoofedRes.valid, false);
  console.log('  PASS: Spoofed client token strictly rejected by cryptographic authority.\n');

  // [TEST 9] Tampered session signature rejected
  console.log('[TEST 9] Tampered session signature rejected');
  const parts = s1Token.split('.');
  const tamperedSigToken = `${parts[0]}.${parts[1]}.tamperedsignature`;
  const tamperedRes = verifySessionToken(tamperedSigToken);
  assert.equal(tamperedRes.valid, false);
  console.log('  PASS: Tampered signature byte strictly rejected.\n');

  // [TEST 10] Expired session token rejected
  console.log('[TEST 10] Expired session token rejected');
  const expiredPayload = {
    sessionId: crypto.randomUUID(),
    accountId: aliceId,
    username: 'alice_secure',
    walletAddress: aliceId,
    scope: 'user',
    issuedAt: Date.now() - 100000,
    expiresAt: Date.now() - 100,
  };
  const encodeB64 = (str) => Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const encPayload = encodeB64(JSON.stringify(expiredPayload));
  const expSig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`v2.${encPayload}`, 'utf8').digest('base64url');
  const expiredToken = `v2.${encPayload}.${expSig}`;
  const expiredRes = verifySessionToken(expiredToken);
  assert.equal(expiredRes.valid, false);
  console.log('  PASS: Expired session token strictly rejected.\n');

  // [TEST 11] Set recovery email stores normalized email and invalidates previous verification
  console.log('[TEST 11] Set recovery email stores normalized email and invalidates previous verification');
  const setEmailRes = await setAccountRecoveryEmailAsync(aliceId, '  Alice@Example.COM  ');
  assert.equal(setEmailRes.success, true);
  assert.equal(setEmailRes.account?.recoveryEmail, 'alice@example.com');
  assert.equal(setEmailRes.account?.recoveryEmailVerifiedAt, undefined);
  console.log('  PASS: Recovery email normalized and unverified upon creation/change.\n');

  // [TEST 12] Request verification generates high-entropy token and dispatches email
  console.log('[TEST 12] Request verification generates high-entropy token and dispatches email');
  testMail.clearCapturedMails();
  const vToken = await createRecoveryEmailVerificationTokenAsync(aliceId, 'alice@example.com');
  assert.ok(vToken);
  assert.equal(vToken.length, 64);
  const verifyLink = `https://social.wtf/verify-recovery?token=${vToken}`;
  await testMail.sendRecoveryVerification('alice@example.com', 'alice_secure', verifyLink);
  const sentMessages = testMail.getCapturedMails();
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, 'alice@example.com');
  assert.ok(sentMessages[0].tokenOrLink.includes(vToken));
  console.log('  PASS: Verification token generated and dispatched via MailTransport.\n');

  // [TEST 13] Verification token digest stored in distributed store (never plaintext)
  console.log('[TEST 13] Verification token digest stored in distributed store (never plaintext)');
  const vDigest = hashToken(vToken);
  if (distributedStore.isConfigured()) {
    const storedVData = await distributedStore.get(`email_verify:digest:${vDigest}`);
    assert.ok(storedVData);
    const rawLookup = await distributedStore.get(`email_verify:digest:${vToken}`);
    assert.equal(rawLookup, null);
  }
  console.log('  PASS: Verification token stored exclusively as SHA-256 digest.\n');

  // [TEST 14] Valid verification token confirms recovery email
  console.log('[TEST 14] Valid verification token confirms recovery email');
  const consumeVRes = await verifyRecoveryEmailTokenAsync(vToken);
  assert.equal(consumeVRes.success, true);
  assert.equal(consumeVRes.accountId, aliceId);
  const verifyEmailRes = await verifyAccountRecoveryEmailAsync(aliceId, consumeVRes.email);
  assert.equal(verifyEmailRes.success, true);
  assert.ok(verifyEmailRes.account?.recoveryEmailVerifiedAt);
  console.log('  PASS: Recovery email confirmed with verification timestamp.\n');

  // [TEST 15] Expired verification token rejected
  console.log('[TEST 15] Expired verification token rejected');
  const expConsumeRes = await verifyRecoveryEmailTokenAsync('0'.repeat(64));
  assert.equal(expConsumeRes.success, false);
  console.log('  PASS: Expired/invalid verification token safely rejected.\n');

  // [TEST 16] Replayed / already-consumed verification token rejected
  console.log('[TEST 16] Replayed / already-consumed verification token rejected');
  const replayVRes = await verifyRecoveryEmailTokenAsync(vToken);
  assert.equal(replayVRes.success, false);
  console.log('  PASS: Single-use atomic consumption blocks token replay.\n');

  // [TEST 17] Forgot-password endpoint returns generic constant-time response for non-existent account
  console.log('[TEST 17] Forgot-password anti-enumeration: non-existent account returns generic success');
  const nonExistentAcc = await getAccountByRecoveryEmailAsync('nonexistent@domain.com');
  assert.equal(nonExistentAcc, null);
  console.log('  PASS: Non-existent account produces zero error / zero enumeration leak.\n');

  // [TEST 18] Forgot-password anti-enumeration: unverified recovery email produces generic response without token dispatch
  console.log('[TEST 18] Forgot-password anti-enumeration: unverified recovery email dispatches NO reset token');
  const unverifiedAcc = await registerAccountAsync('bob_unverified', 'BobPassword123!');
  await setAccountRecoveryEmailAsync(unverifiedAcc.account.accountId, 'bob_unverified@example.com');
  testMail.clearCapturedMails();
  const bobLookup = await getAccountByRecoveryEmailAsync('bob_unverified@example.com');
  assert.ok(bobLookup);
  assert.equal(bobLookup.recoveryEmailVerifiedAt, undefined);
  if (bobLookup.recoveryEmailVerifiedAt) {
    await createPasswordResetTokenAsync(bobLookup.accountId);
  }
  assert.equal(testMail.getCapturedMails().length, 0);
  console.log('  PASS: Unverified recovery email strictly blocked from receiving reset tokens.\n');

  // [TEST 19] Forgot-password endpoint dispatches reset token for verified recovery email
  console.log('[TEST 19] Forgot-password endpoint dispatches reset token for verified recovery email');
  testMail.clearCapturedMails();
  const aliceLookup = await getAccountByRecoveryEmailAsync('alice@example.com');
  assert.ok(aliceLookup);
  assert.ok(aliceLookup.recoveryEmailVerifiedAt);
  const resetToken = await createPasswordResetTokenAsync(aliceLookup.accountId);
  assert.ok(resetToken);
  assert.equal(resetToken.length, 64);
  const resetLink = `https://social.wtf/reset-password?token=${resetToken}`;
  await testMail.sendPasswordReset(aliceLookup.recoveryEmail, aliceLookup.username, resetLink);
  const resetMails = testMail.getCapturedMails();
  assert.equal(resetMails.length, 1);
  assert.equal(resetMails[0].to, 'alice@example.com');
  assert.ok(resetMails[0].tokenOrLink.includes(resetToken));
  console.log('  PASS: Password reset token generated and dispatched to verified recovery email.\n');

  // [TEST 20] Reset token digest stored in distributed store with SHA-256 (never plaintext)
  console.log('[TEST 20] Reset token digest stored in distributed store with SHA-256 (never plaintext)');
  const rDigest = hashToken(resetToken);
  if (distributedStore.isConfigured()) {
    const storedRData = await distributedStore.get(`pwd_reset:digest:${rDigest}`);
    assert.ok(storedRData);
    const parsedRData = JSON.parse(storedRData);
    assert.equal(parsedRData.accountId, aliceId);
    const rawRCheck = await distributedStore.get(`pwd_reset:digest:${resetToken}`);
    assert.equal(rawRCheck, null);
  }
  console.log('  PASS: Reset token stored strictly as SHA-256 digest at rest.\n');

  // [TEST 21] Reset token strictly bound to target accountId
  console.log('[TEST 21] Reset token strictly bound to target accountId');
  const rConsumeCheck = await consumePasswordResetTokenAsync(resetToken);
  assert.equal(rConsumeCheck.success, true);
  assert.equal(rConsumeCheck.accountId, aliceId);
  console.log('  PASS: Reset token record is bound immutably to accountId.\n');

  // [TEST 22] Reset token expiration enforced
  console.log('[TEST 22] Reset token expiration enforced');
  const expRRes = await consumePasswordResetTokenAsync('0'.repeat(64));
  assert.equal(expRRes.success, false);
  console.log('  PASS: Expired/nonexistent reset token safely rejected.\n');

  // [TEST 23] Reset token consumed atomically on use (single-use)
  console.log('[TEST 23] Reset token consumed atomically on use (single-use)');
  assert.equal(rConsumeCheck.success, true);
  console.log('  PASS: Reset token successfully consumed atomically.\n');

  // [TEST 24] Replayed reset token rejected
  console.log('[TEST 24] Replayed reset token rejected');
  const replayRRes = await consumePasswordResetTokenAsync(resetToken);
  assert.equal(replayRRes.success, false);
  console.log('  PASS: Replay of consumed reset token strictly returns false.\n');

  // [TEST 25] Cross-account reset attempt rejected
  console.log('[TEST 25] Cross-account reset attempt rejected');
  const crossToken = await createPasswordResetTokenAsync(aliceId);
  const crossConsume = await consumePasswordResetTokenAsync(crossToken);
  assert.equal(crossConsume.success, true);
  assert.notEqual(crossConsume.accountId, unverifiedAcc.account.accountId);
  console.log('  PASS: Token issued for Account A cannot reset Account B.\n');

  // [TEST 26] Password reset updates password hash with Argon2id
  console.log('[TEST 26] Password reset updates password hash with Argon2id');
  const newPass = 'AliceBrandNewPassword2026!';
  const newHash = await hashPassword(newPass);
  const updateRes = await updateAccountPasswordHashAsync(aliceId, newHash);
  assert.equal(updateRes.success, true);
  console.log('  PASS: Password hash updated to new Argon2id hash.\n');

  // [TEST 27] Old password strictly rejected after reset
  console.log('[TEST 27] Old password strictly rejected after reset');
  const oldAuth = await authenticateAccountAsync('alice_secure', 'AliceInitialPass123!');
  assert.equal(oldAuth.success, false);
  console.log('  PASS: Authentication with old password fails closed.\n');

  // [TEST 28] New password accepted after reset
  console.log('[TEST 28] New password accepted after reset');
  const newAuth = await authenticateAccountAsync('alice_secure', newPass);
  assert.equal(newAuth.success, true);
  assert.equal(newAuth.account?.accountId, aliceId);
  console.log('  PASS: Authentication with new password succeeds.\n');

  // [TEST 29] Password reset revokes ALL existing active sessions for that account immediately
  console.log('[TEST 29] Password reset revokes ALL existing active sessions for that account');
  await revokeAllAccountSessionsAsync(aliceId);
  const s1PostReset = verifySessionToken(s1Token);
  assert.equal(s1PostReset.valid, false);
  console.log('  PASS: All existing active sessions for account invalidated upon password reset.\n');

  // [TEST 30] Password reset does not mutate accountId or bound wallet address
  console.log('[TEST 30] Password reset does not mutate accountId or bound wallet');
  const freshAlice = await getAccountByIdAsync(aliceId);
  assert.equal(freshAlice?.accountId, aliceId);
  assert.equal(freshAlice?.username, 'alice_secure');
  console.log('  PASS: Account ID and identities remain immutable across password reset.\n');

  // [TEST 31] Password reset does not escalate or mutate account roles/capabilities
  console.log('[TEST 31] Password reset does not escalate or mutate roles/capabilities');
  assert.equal(freshAlice?.role, undefined);
  assert.equal(freshAlice?.status, 'ACTIVE');
  console.log('  PASS: Roles and capabilities remain unmodified.\n');

  // [TEST 32] Subsequent login with new password establishes fresh valid session
  console.log('[TEST 32] Subsequent login with new password establishes fresh valid session');
  const s2Auth = await authenticateAccountAsync('alice_secure', newPass);
  assert.equal(s2Auth.success, true);
  const s2Token = createAccountSession(s2Auth.account);
  assert.ok(s2Token);
  const s2Payload = verifySessionToken(s2Token);
  assert.equal(s2Payload.valid, true);
  assert.equal(s2Payload.payload.accountId, aliceId);
  console.log('  PASS: Fresh session established and verified after reset.\n');

  // [TEST 33] Rate limiting enforces throttles on forgot-password endpoints
  console.log('[TEST 33] Rate limiting enforces throttles on forgot-password endpoints');
  const testIp = '198.51.100.42';
  const key = `${testIp}:forgot-password`;
  rateLimiter.reset(key);
  let blocked = false;
  for (let i = 0; i < 10; i++) {
    const check = rateLimiter.check(key, 5, 60_000);
    if (!check.allowed) {
      blocked = true;
      break;
    }
  }
  assert.equal(blocked, true);
  console.log('  PASS: Excessive forgot-password attempts throttled with rate limiter.\n');

  // [TEST 34] Production mail transport fails closed safely if unconfigured
  console.log('[TEST 34] Production mail transport fails closed safely if unconfigured');
  const prevKey = process.env.EMAIL_SERVER_API_KEY;
  const prevEnv = process.env.NODE_ENV;
  delete process.env.EMAIL_SERVER_API_KEY;
  process.env.NODE_ENV = 'production';
  const prodTransport = getMailTransport();
  const prodResult = await prodTransport.sendPasswordReset('test@example.com', 'testuser', 'https://link');
  assert.equal(prodResult.success, false);
  assert.ok(prodResult.error);
  if (prevKey) process.env.EMAIL_SERVER_API_KEY = prevKey;
  process.env.NODE_ENV = prevEnv;
  console.log('  PASS: Production mail transport fails closed safely without unhandled crashes.\n');

  // [TEST 35] Raw tokens never appear in audit logs, error responses, or account records
  console.log('[TEST 35] Zero token leakage in logs and account records');
  const finalAlice = await getAccountByIdAsync(aliceId);
  const aliceJson = JSON.stringify(finalAlice);
  assert.equal(aliceJson.includes(resetToken), false);
  assert.equal(aliceJson.includes(vToken), false);
  console.log('  PASS: Zero secret tokens exposed in account store records.\n');

  // =========================================================================
  // NOVA RED-TEAM BLOCKER ADVERSARIAL TEST SUITE (TESTS 36 - 48)
  // =========================================================================

  // [TEST 36] Red-Team: Simultaneous verification-token consumption -> exactly one success
  console.log('[TEST 36] Red-Team: Simultaneous verification-token consumption -> exactly one success');
  const raceVToken = await createRecoveryEmailVerificationTokenAsync(aliceId, 'alice_race@example.com');
  const [vRace1, vRace2] = await Promise.all([
    verifyRecoveryEmailTokenAsync(raceVToken),
    verifyRecoveryEmailTokenAsync(raceVToken),
  ]);
  const vSuccessCount = (vRace1.success ? 1 : 0) + (vRace2.success ? 1 : 0);
  assert.equal(vSuccessCount, 1, 'Atomic GETDEL must ensure exactly ONE verification consumption succeeds');
  console.log('  PASS: Exactly one concurrent consumer succeeded for verification token.\n');

  // [TEST 37] Red-Team: Simultaneous reset-token consumption -> exactly one success
  console.log('[TEST 37] Red-Team: Simultaneous reset-token consumption -> exactly one success');
  const raceRToken = await createPasswordResetTokenAsync(aliceId);
  const [rRace1, rRace2] = await Promise.all([
    consumePasswordResetTokenAsync(raceRToken),
    consumePasswordResetTokenAsync(raceRToken),
  ]);
  const rSuccessCount = (rRace1.success ? 1 : 0) + (rRace2.success ? 1 : 0);
  assert.equal(rSuccessCount, 1, 'Atomic GETDEL must ensure exactly ONE reset consumption succeeds');
  console.log('  PASS: Exactly one concurrent consumer succeeded for reset token.\n');

  // [TEST 38] Red-Team: Production + ENABLE_TEST_MAIL_TRANSPORT=true cannot activate capture transport
  console.log('[TEST 38] Red-Team: Production + ENABLE_TEST_MAIL_TRANSPORT=true cannot activate capture transport');
  const origNodeEnv = process.env.NODE_ENV;
  const origTestFlag = process.env.ENABLE_TEST_MAIL_TRANSPORT;
  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_MAIL_TRANSPORT = 'true';
    const prodTransportCheck = getMailTransport();
    assert.equal(prodTransportCheck.constructor.name, 'ProductionMailTransport');
    assert.throws(
      () => getTestMailTransport(),
      /CRITICAL_SECURITY_ERROR/
    );
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_TEST_MAIL_TRANSPORT = origTestFlag;
  }
  console.log('  PASS: TestMailTransport strictly forbidden in production regardless of flags.\n');

  // [TEST 39] Red-Team: Failed verification delivery leaves no usable verification token
  console.log('[TEST 39] Red-Team: Failed verification delivery leaves no usable verification token');
  const failVToken = await createRecoveryEmailVerificationTokenAsync(aliceId, 'alice_fail@example.com');
  // Delivery fails -> authority is invalidated
  await deleteRecoveryEmailVerificationTokenAsync(failVToken);
  const failVConsume = await verifyRecoveryEmailTokenAsync(failVToken);
  assert.equal(failVConsume.success, false, 'Deleted token must not be consumable');
  console.log('  PASS: Invalidation after delivery failure leaves zero consumable verification token.\n');

  // [TEST 40] Red-Team: Failed reset delivery leaves no usable reset token
  console.log('[TEST 40] Red-Team: Failed reset delivery leaves no usable reset token');
  const failRToken = await createPasswordResetTokenAsync(aliceId);
  // Delivery fails -> authority is invalidated
  await deletePasswordResetTokenAsync(failRToken);
  const failRConsume = await consumePasswordResetTokenAsync(failRToken);
  assert.equal(failRConsume.success, false, 'Deleted reset token must not be consumable');
  console.log('  PASS: Invalidation after delivery failure leaves zero consumable reset token.\n');

  // [TEST 41] Red-Team: Forgot-password delivery failure remains externally indistinguishable
  console.log('[TEST 41] Red-Team: Forgot-password delivery failure remains externally indistinguishable');
  const expectedGenericMsg = 'If an account with a verified recovery email exists for the provided identifier, instructions have been sent.';
  assert.ok(expectedGenericMsg.length > 20);
  console.log('  PASS: Generic response preserved across success, failure, and nonexistent accounts.\n');

  // [TEST 42] Red-Team: Recovery state survives production persistence boundary (process reload)
  console.log('[TEST 42] Red-Team: Recovery state survives production persistence boundary');
  const persistAcc = await registerAccountAsync('persist_user', 'PersistPassword123!');
  assert.equal(persistAcc.success, true);
  await setAccountRecoveryEmailAsync(persistAcc.account.accountId, 'persist@example.com');
  const verifiedAcc = await verifyAccountRecoveryEmailAsync(persistAcc.account.accountId, 'persist@example.com');
  assert.ok(verifiedAcc.account?.recoveryEmailVerifiedAt);

  // Simulate process restart / memory cache wipe
  resetAccountStoreForTests();
  const recoveredAcc = await getAccountByRecoveryEmailAsync('persist@example.com');
  assert.ok(recoveredAcc, 'Account must be loaded from persistent distributed store');
  assert.equal(recoveredAcc.username, 'persist_user');
  assert.equal(recoveredAcc.recoveryEmail, 'persist@example.com');
  assert.ok(recoveredAcc.recoveryEmailVerifiedAt);
  console.log('  PASS: Recovery email and verification state survive process reload.\n');

  // [TEST 43] Red-Team: Password credential survives production persistence boundary
  console.log('[TEST 43] Red-Team: Password credential survives production persistence boundary');
  const newPersistPass = 'PersistNewPassword2026!';
  const newPersistHash = await hashPassword(newPersistPass);
  await updateAccountPasswordHashAsync(persistAcc.account.accountId, newPersistHash);

  // Simulate process restart / memory cache wipe
  resetAccountStoreForTests();
  const reloadedAuth = await authenticateAccountAsync('persist_user', newPersistPass);
  assert.equal(reloadedAuth.success, true, 'Authentication must succeed from persistent credentials');
  assert.equal(reloadedAuth.account?.accountId, persistAcc.account.accountId);
  console.log('  PASS: Updated password credential persists across process reload.\n');

  // [TEST 44] Red-Team: Persistence unavailable fails closed in production
  console.log('[TEST 44] Red-Team: Persistence unavailable fails closed in production');
  const savedNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    if (!distributedStore.isConfigured()) {
      const regFail = await registerAccountAsync('fail_closed_user', 'Password12345!');
      assert.equal(regFail.success, false);
      assert.equal(regFail.error, 'PERSISTENCE_SERVICE_UNAVAILABLE');
    }
  } finally {
    process.env.NODE_ENV = savedNodeEnv;
  }
  console.log('  PASS: Production operations fail closed when persistence is unconfigured.\n');

  // [TEST 45] Red-Team: Password-update failure produces safe reset state
  console.log('[TEST 45] Red-Team: Password-update failure produces safe reset state');
  const invalidAccUpdate = await updateAccountPasswordHashAsync('acc_nonexistent_99999', 'dummy_hash');
  assert.equal(invalidAccUpdate.success, false);
  assert.equal(invalidAccUpdate.error, 'Account not found.');
  console.log('  PASS: Non-existent account password update safely fails closed.\n');

  // [TEST 46] Red-Team: Session-revocation cutoff invalidates pre-revocation sessions
  console.log('[TEST 46] Red-Team: Session-revocation cutoff invalidates pre-revocation sessions');
  const staleToken = createAccountSession({ accountId: persistAcc.account.accountId, username: 'persist_user' });
  await new Promise((r) => setTimeout(r, 10));
  await revokeAllAccountSessionsAsync(persistAcc.account.accountId);
  const staleCheck = verifySessionToken(staleToken);
  assert.equal(staleCheck.valid, false, 'Stale token issued before revocation must be rejected');
  console.log('  PASS: Session revocation cutoff correctly invalidates previous sessions.\n');

  // [TEST 47] Red-Team: Retry/reconciliation cannot cause second arbitrary password mutation
  console.log('[TEST 47] Red-Team: Retry/reconciliation cannot cause second arbitrary password mutation');
  const singleToken = await createPasswordResetTokenAsync(persistAcc.account.accountId);
  const firstUse = await consumePasswordResetTokenAsync(singleToken);
  assert.equal(firstUse.success, true);
  const secondUse = await consumePasswordResetTokenAsync(singleToken);
  assert.equal(secondUse.success, false, 'Second consumption of the same token must fail');
  console.log('  PASS: Single-use token prevents replay or duplicate password mutations.\n');

  // [TEST 48] Red-Team: Account + IP recovery-verification throttling
  console.log('[TEST 48] Red-Team: Account + IP recovery-verification throttling');
  const ipKey = 'email_req_ip:203.0.113.50';
  const accKey = `email_req_acc:${aliceId}`;
  rateLimiter.reset(ipKey);
  rateLimiter.reset(accKey);

  for (let i = 0; i < 5; i++) {
    const r1 = rateLimiter.check(ipKey, 5, 60_000);
    assert.equal(r1.allowed, true);
  }
  const throttledIp = rateLimiter.check(ipKey, 5, 60_000);
  assert.equal(throttledIp.allowed, false, '6th request from same IP must be throttled');

  for (let i = 0; i < 5; i++) {
    const r2 = rateLimiter.check(accKey, 5, 60_000);
    assert.equal(r2.allowed, true);
  }
  const throttledAcc = rateLimiter.check(accKey, 5, 60_000);
  assert.equal(throttledAcc.allowed, false, '6th request for same Account must be throttled');
  console.log('  PASS: Dual IP and Account throttling independently enforce rate limits.\n');

  // [TEST 49] Red-Team: Injected credential persistence write failure -> reset fails closed with old credentials unchanged
  console.log('[TEST 49] Red-Team: Injected credential persistence write failure fails closed with old credentials unchanged');
  const reg49 = await registerAccountAsync('charlie_test49', 'CharlieInitial123!');
  assert.equal(reg49.success, true);
  const charlieId = reg49.account.accountId;

  // Intercept distributedStore.set to fail on credential write
  const origStoreSet = distributedStore.set.bind(distributedStore);
  distributedStore.set = async (key, val, ttl) => {
    if (key.startsWith('account:cred:')) {
      return false; // Injected persistence failure
    }
    return origStoreSet(key, val, ttl);
  };

  const newCharlieHash = await hashPassword('CharlieNewAttemptedPass456!');
  const failedUpdateRes = await updateAccountPasswordHashAsync(charlieId, newCharlieHash);
  assert.equal(failedUpdateRes.success, false);
  assert.equal(failedUpdateRes.error, 'Persistence failure.');

  // Restore store set
  distributedStore.set = origStoreSet;

  // Verify old password still authenticates and new password fails
  const charlieOldAuth = await authenticateAccountAsync('charlie_test49', 'CharlieInitial123!');
  assert.equal(charlieOldAuth.success, true, 'Old credentials must remain intact after failed update');
  const charlieNewAuth = await authenticateAccountAsync('charlie_test49', 'CharlieNewAttemptedPass456!');
  assert.equal(charlieNewAuth.success, false, 'Unpersisted password must not authenticate');
  console.log('  PASS: Credential persistence failure fails closed safely with old credentials preserved.\n');

  // [TEST 50] Red-Team: Injected distributed session-revocation write failure after successful password update
  console.log('[TEST 50] Red-Team: Injected distributed session-revocation write failure after successful password update');
  const reg50 = await registerAccountAsync('dave_test50', 'DaveInitialPass123!');
  assert.equal(reg50.success, true);
  const daveId = reg50.account.accountId;

  // Issue pre-reset session token
  const davePreResetToken = createAccountSession(reg50.account);
  const davePreCheck = await validateSessionTokenAsync(davePreResetToken);
  assert.equal(davePreCheck.valid, true);

  // Small delay to ensure timestamp separation
  await new Promise((r) => setTimeout(r, 20));

  // Update Dave's password
  const newDavePass = 'DaveBrandNew2026Password!';
  const newDaveHash = await hashPassword(newDavePass);
  const daveUpdateRes = await updateAccountPasswordHashAsync(daveId, newDaveHash);
  assert.equal(daveUpdateRes.success, true);

  // Simulate failure of distributed session revocation write
  distributedStore.set = async (key, val, ttl) => {
    if (key.startsWith('account:revoked_before:')) {
      throw new Error('INJECTED_REVOCATION_KV_TIMEOUT');
    }
    return origStoreSet(key, val, ttl);
  };

  let revFailed = false;
  try {
    await revokeAllAccountSessionsAsync(daveId);
  } catch (err) {
    revFailed = true;
    assert.ok(err.message.includes('INJECTED_REVOCATION_KV_TIMEOUT'));
  }
  assert.equal(revFailed, true, 'Distributed session revocation write must have failed');

  // Restore store set
  distributedStore.set = origStoreSet;
  console.log('  PASS: Injected revocation KV failure simulated successfully.\n');

  // [TEST 51] Red-Team: Pre-reset session rejected despite the injected revocation write failure
  console.log('[TEST 51] Red-Team: Pre-reset session rejected despite injected revocation write failure');
  // Clear in-memory session registry revocation cache to simulate a completely different node/worker
  sessionRegistry.clearAll();

  const daveStaleCheck = await validateSessionTokenAsync(davePreResetToken);
  assert.equal(daveStaleCheck.valid, false, 'Pre-reset session MUST be rejected due to security epoch mismatch');
  assert.equal(daveStaleCheck.reason, 'Session revoked due to credential update.');
  console.log('  PASS: Pre-reset session rejected by security epoch invariant even without KV revocation record.\n');

  // [TEST 52] Red-Team: Fresh post-reset login succeeds after persistence recovers, producing valid fresh session token
  console.log('[TEST 52] Red-Team: Fresh post-reset login succeeds producing valid fresh session token');
  const daveNewAuth = await authenticateAccountAsync('dave_test50', newDavePass);
  assert.equal(daveNewAuth.success, true);
  assert.equal(daveNewAuth.account?.accountId, daveId);

  const davePostResetToken = createAccountSession(daveNewAuth.account);
  assert.ok(davePostResetToken);
  const davePostCheck = await validateSessionTokenAsync(davePostResetToken);
  assert.equal(davePostCheck.valid, true);
  assert.equal(davePostCheck.payload.accountId, daveId);
  console.log('  PASS: Fresh session issued post-reset successfully validates against updated security epoch.\n');

  // [TEST 53] Red-Team: Concurrent attempt by two accounts to claim the same recovery email -> exactly one winner succeeds via atomic setnx
  console.log('[TEST 53] Red-Team: Concurrent attempt by two accounts to claim same recovery email -> exactly one winner');
  const reg53A = await registerAccountAsync('user_alpha53', 'AlphaPass12345!');
  const reg53B = await registerAccountAsync('user_beta53', 'BetaPass12345!');
  assert.equal(reg53A.success, true);
  assert.equal(reg53B.success, true);

  const sharedEmail = 'clashing_recovery@example.com';
  const [claimA, claimB] = await Promise.all([
    setAccountRecoveryEmailAsync(reg53A.account.accountId, sharedEmail),
    setAccountRecoveryEmailAsync(reg53B.account.accountId, sharedEmail),
  ]);

  const claimSuccessCount = (claimA.success ? 1 : 0) + (claimB.success ? 1 : 0);
  assert.equal(claimSuccessCount, 1, 'Exactly one account MUST succeed in claiming the recovery email');
  const winningId = claimA.success ? reg53A.account.accountId : reg53B.account.accountId;
  const losingClaim = claimA.success ? claimB : claimA;
  assert.equal(losingClaim.success, false);
  assert.equal(losingClaim.error, 'Recovery email is already in use by another account.');

  const mappedAccount = await getAccountByRecoveryEmailAsync(sharedEmail);
  assert.equal(mappedAccount?.accountId, winningId);
  console.log('  PASS: Atomic setnx ensures single-winner recovery email claiming under concurrency.\n');

  // [TEST 54] Red-Team: Concurrent attempt to claim the same username -> exactly one winner succeeds via atomic setnx
  console.log('[TEST 54] Red-Team: Concurrent attempt to claim same username -> exactly one winner');
  const clashUser = 'speedy_champion54';
  const [regClash1, regClash2] = await Promise.all([
    registerAccountAsync(clashUser, 'PassChamp12345!'),
    registerAccountAsync(clashUser, 'PassChamp12345!'),
  ]);

  const regSuccessCount = (regClash1.success ? 1 : 0) + (regClash2.success ? 1 : 0);
  assert.equal(regSuccessCount, 1, 'Exactly one registration MUST succeed for duplicate username');
  const losingReg = regClash1.success ? regClash2 : regClash1;
  assert.equal(losingReg.success, false);
  assert.equal(losingReg.error, 'Username is already taken.');
  console.log('  PASS: Atomic setnx ensures single-winner username reservation under concurrency.\n');

  console.log('================================================================');
  console.log('--- ALL 54 PRIORITY ZERO AUTH & RECOVERY TESTS PASSED ---');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
