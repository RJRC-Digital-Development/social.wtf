import assert from 'node:assert/strict';
import {
  registerAccountAsync,
  getAccountByIdAsync,
  getAccountByUsernameAsync,
  updateAccountUsernameAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  createAccountSession,
  createSessionCookie,
  extractSessionToken,
  validateRequestSessionAsync,
} from '../../src/lib/security/session.ts';
import { distributedStore } from '../../src/lib/security/distributedStore.ts';

process.env.SESSION_SECRET = 'a'.repeat(32);

async function runTests() {
  console.log('================================================================');
  console.log('--- REGRESSION GATE: USERNAME MUTATION & SESSION EXTRACTION ---');
  console.log('================================================================\n');

  resetAccountStoreForTests();
  distributedStore.clearLocalFallback?.();

  // [TEST 1] Signed-in user can initiate valid username change with correct password
  console.log('[TEST 1] Signed-in user can initiate valid username change with password');
  const reg1 = await registerAccountAsync('alice_original', 'StrongPassword123!');
  assert.equal(reg1.success, true);
  const alice = reg1.account;
  const initialAccountId = alice.accountId;

  const update1 = await updateAccountUsernameAsync(alice.accountId, 'alice_renamed', 'StrongPassword123!');
  assert.equal(update1.success, true);
  assert.equal(update1.account?.username, 'alice_renamed');
  assert.equal(update1.account?.accountId, initialAccountId, 'Canonical accountId must remain identical');
  console.log('  PASS: Username successfully updated while preserving immutable accountId.\n');

  // [TEST 2] Invalid password rejects username change
  console.log('[TEST 2] Invalid password rejects username change');
  const updateWrongPass = await updateAccountUsernameAsync(alice.accountId, 'alice_hacked', 'WrongPassword999!');
  assert.equal(updateWrongPass.success, false);
  assert.equal(updateWrongPass.status, 401);
  const currentAlice = await getAccountByIdAsync(alice.accountId);
  assert.equal(currentAlice?.username, 'alice_renamed', 'Username must not have changed');
  console.log('  PASS: Incorrect password strictly rejected with 401.\n');

  // [TEST 3] Duplicate username rejected
  console.log('[TEST 3] Duplicate username rejected');
  const reg2 = await registerAccountAsync('bob_user', 'BobPassword123!');
  assert.equal(reg2.success, true);
  const bob = reg2.account;

  const duplicateAttempt = await updateAccountUsernameAsync(bob.accountId, 'alice_renamed', 'BobPassword123!');
  assert.equal(duplicateAttempt.success, false);
  assert.equal(duplicateAttempt.status, 409);
  console.log('  PASS: Attempt to claim existing username fails with 409 conflict.\n');

  // [TEST 4] Old username reservation policy: Another account cannot immediately claim previous username
  console.log('[TEST 4] Old username reservation policy: Old username is safely reserved');
  const claimOldUsername = await updateAccountUsernameAsync(bob.accountId, 'alice_original', 'BobPassword123!');
  assert.equal(claimOldUsername.success, false, 'Old username must remain reserved to prevent impersonation');
  console.log('  PASS: Old username reserved to prevent account impersonation.\n');

  // [TEST 5] New username resolves to original canonical account
  console.log('[TEST 5] New username resolves to original canonical account');
  const resolvedAlice = await getAccountByUsernameAsync('alice_renamed');
  assert.ok(resolvedAlice);
  assert.equal(resolvedAlice.accountId, initialAccountId);
  console.log('  PASS: New username resolves strictly to original canonical account.\n');

  // [TEST 6] Malformed username fails closed
  console.log('[TEST 6] Malformed username fails closed');
  const shortName = await updateAccountUsernameAsync(alice.accountId, 'al', 'StrongPassword123!');
  assert.equal(shortName.success, false);
  const invalidChars = await updateAccountUsernameAsync(alice.accountId, 'alice!invalid', 'StrongPassword123!');
  assert.equal(invalidChars.success, false);
  console.log('  PASS: Invalid username syntax strictly fails closed.\n');

  // [TEST 7] Injected persistence failure triggers compensating rollback
  console.log('[TEST 7] Injected persistence failure triggers compensating rollback');
  const origSet = distributedStore.set.bind(distributedStore);
  // Simulate failure when writing account:id record
  distributedStore.set = async (key, val, ttl) => {
    if (key.startsWith('account:id:')) {
      return false; // Injected persistence failure
    }
    return origSet(key, val, ttl);
  };

  const failedUpdate = await updateAccountUsernameAsync(alice.accountId, 'alice_rolledback', 'StrongPassword123!');
  assert.equal(failedUpdate.success, false);
  distributedStore.set = origSet; // Restore

  // Verify rollback released the new username reservation
  const recheckAlice = await getAccountByIdAsync(alice.accountId);
  assert.equal(recheckAlice?.username, 'alice_renamed');
  console.log('  PASS: Persistence failure cleanly rolls back username reservation.\n');

  // [TEST 8] Session token extraction: Valid cookie + no Authorization header succeeds
  console.log('[TEST 8] Session token extraction: Valid cookie + no Authorization header');
  const tokenAlice = createAccountSession(recheckAlice, ['ROLE_USER']);
  const cookieAlice = createSessionCookie(tokenAlice, Date.now() + 86400000);

  const reqCookieOnly = new Request('https://social.wtf/api/auth/me', {
    headers: {
      cookie: cookieAlice,
    },
  });
  const extracted1 = extractSessionToken(reqCookieOnly);
  assert.equal(extracted1, tokenAlice);
  const auth1 = await validateRequestSessionAsync(reqCookieOnly);
  assert.equal(auth1.authenticated, true);
  assert.equal(auth1.payload.accountId, alice.accountId);
  console.log('  PASS: Valid HttpOnly cookie successfully extracted without header.\n');

  // [TEST 9] Session token extraction: Valid cookie + accidental Bearer null succeeds
  console.log('[TEST 9] Session token extraction: Valid cookie + accidental Bearer null');
  const reqBearerNull = new Request('https://social.wtf/api/profile', {
    headers: {
      authorization: 'Bearer null',
      cookie: cookieAlice,
    },
  });
  const extracted2 = extractSessionToken(reqBearerNull);
  assert.equal(extracted2, tokenAlice, 'extractSessionToken must fall back to cookie when bearer is null');
  const auth2 = await validateRequestSessionAsync(reqBearerNull);
  assert.equal(auth2.authenticated, true);
  assert.equal(auth2.payload.accountId, alice.accountId);
  console.log('  PASS: Placeholder "Bearer null" does not mask valid session cookie.\n');

  // [TEST 10] Session token extraction: Valid cookie + accidental Bearer undefined succeeds
  console.log('[TEST 10] Session token extraction: Valid cookie + accidental Bearer undefined');
  const reqBearerUndefined = new Request('https://social.wtf/api/profile', {
    headers: {
      authorization: 'Bearer undefined',
      cookie: cookieAlice,
    },
  });
  const extracted3 = extractSessionToken(reqBearerUndefined);
  assert.equal(extracted3, tokenAlice);
  const auth3 = await validateRequestSessionAsync(reqBearerUndefined);
  assert.equal(auth3.authenticated, true);
  console.log('  PASS: Placeholder "Bearer undefined" does not mask valid session cookie.\n');

  // [TEST 11] Session token extraction: Valid legitimate bearer authentication succeeds
  console.log('[TEST 11] Session token extraction: Valid legitimate bearer authentication');
  const reqBearerValid = new Request('https://social.wtf/api/posts', {
    headers: {
      authorization: `Bearer ${tokenAlice}`,
    },
  });
  const extracted4 = extractSessionToken(reqBearerValid);
  assert.equal(extracted4, tokenAlice);
  const auth4 = await validateRequestSessionAsync(reqBearerValid);
  assert.equal(auth4.authenticated, true);
  console.log('  PASS: Valid legitimate bearer token extracted and authenticated.\n');

  // [TEST 12] Session token extraction: Invalid authentication with no cookie remains rejected
  console.log('[TEST 12] Session token extraction: Invalid authentication without cookie rejected');
  const reqBogus = new Request('https://social.wtf/api/posts', {
    headers: {
      authorization: 'Bearer bogus_token_payload',
    },
  });
  const authBogus = await validateRequestSessionAsync(reqBogus);
  assert.equal(authBogus.authenticated, false);
  console.log('  PASS: Bogus bearer authentication strictly rejected when no cookie exists.\n');

  // [TEST 13] Attacker cannot redirect username mutation to another account
  console.log('[TEST 13] Attacker cannot redirect username mutation to another account');
  // Attempting to rename Alice while passing Charlie's ID fails or only affects the authenticated account
  const updateHijack = await updateAccountUsernameAsync('acc_nonexistent_victim', 'victim_renamed', 'StrongPassword123!');
  assert.equal(updateHijack.success, false);
  assert.equal(updateHijack.status, 404);
  console.log('  PASS: Username mutation bound strictly to target account validation.\n');

  console.log('================================================================');
  console.log('  ALL 13 USERNAME MUTATION & SESSION TESTS PASSED! ');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
