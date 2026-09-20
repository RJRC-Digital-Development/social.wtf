import assert from 'node:assert/strict';
import {
  registerAccountAsync,
  authenticateAccountAsync,
  getAccountByIdAsync,
  getAccountByUsernameAsync,
  updateAccountStatusAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  createAccountSession,
  verifySessionToken,
  revokeSession,
  sessionRegistry,
} from '../../src/lib/security/session.ts';
import { hashPassword, verifyPassword } from '../../src/lib/security/password.ts';

process.env.SESSION_SECRET = 'a'.repeat(32);

async function runTests() {
  console.log('================================================================');
  console.log('--- REPAIR: ACCOUNT-FIRST AUTHENTICATION SUITE ---');
  console.log('================================================================\n');

  resetAccountStoreForTests();
  sessionRegistry.clearAll();

  // [TEST 1] Argon2id password hashing and verification
  console.log('[TEST 1] Argon2id password hashing and verification');
  const plain = 'SuperSecretP@ssword123';
  const hashed = await hashPassword(plain);
  assert.ok(hashed.startsWith('$argon2id$'), 'Password hash must be Argon2id format');
  const valid = await verifyPassword(hashed, plain);
  assert.equal(valid, true, 'Correct password must verify');
  const invalid = await verifyPassword(hashed, 'WrongPassword123');
  assert.equal(invalid, false, 'Incorrect password must fail verification');
  console.log('  PASS: Argon2id hashing and verification working securely.\n');

  // [TEST 2] Register new user without wallet
  console.log('[TEST 2] Register new user without wallet');
  const regResult = await registerAccountAsync('alice_social', 'AliceSecurePassword123!');
  assert.equal(regResult.success, true, 'Registration must succeed');
  assert.ok(regResult.account && regResult.account.accountId, 'Account must receive cryptographically random accountId');
  assert.equal(regResult.account.username, 'alice_social', 'Username must match normalized input');
  assert.equal(regResult.account.primaryWalletAddress, undefined, 'No wallet address should be present initially');
  // Verify password hash is never exposed on account object
  assert.equal(regResult.account.passwordHash, undefined, 'Password hash must not be exposed on account record');
  console.log('  PASS: User registered without wallet and received canonical accountId.\n');

  // [TEST 3] Duplicate username registration rejected
  console.log('[TEST 3] Duplicate username registration rejected');
  const dupResult = await registerAccountAsync('alice_social', 'DifferentPassword123!');
  assert.equal(dupResult.success, false, 'Duplicate username registration must fail');
  assert.equal(dupResult.error, 'Username is already taken.');
  console.log('  PASS: Duplicate username registration correctly rejected.\n');

  // [TEST 4] Authenticate with valid credentials
  console.log('[TEST 4] Authenticate with valid credentials');
  const authResult = await authenticateAccountAsync('alice_social', 'AliceSecurePassword123!');
  assert.equal(authResult.success, true, 'Authentication must succeed with valid credentials');
  assert.equal(authResult.account.accountId, regResult.account.accountId, 'Account ID must match');
  assert.deepEqual(authResult.roles, ['ROLE_USER'], 'Default role must be ROLE_USER');
  console.log('  PASS: Valid username/password login succeeded.\n');

  // [TEST 5] Authenticate with invalid password rejected
  console.log('[TEST 5] Authenticate with invalid password rejected');
  const badAuth = await authenticateAccountAsync('alice_social', 'WrongPassword!');
  assert.equal(badAuth.success, false, 'Bad password must fail');
  assert.equal(badAuth.error, 'Invalid username or password.');
  console.log('  PASS: Bad password rejected with safe generic error.\n');

  // [TEST 6] Non-existent username rejected
  console.log('[TEST 6] Non-existent username rejected');
  const nonExistent = await authenticateAccountAsync('nobody_user', 'SomePassword123!');
  assert.equal(nonExistent.success, false, 'Non-existent user must fail');
  assert.equal(nonExistent.error, 'Invalid username or password.');
  console.log('  PASS: Non-existent username rejected.\n');

  // [TEST 7] Account-first session lifecycle and token verification
  console.log('[TEST 7] Account-first session lifecycle and token verification');
  const sessionToken = createAccountSession(authResult.account, ['ROLE_USER']);
  assert.ok(sessionToken.startsWith('v2.'), 'Token must be v2 format');
  const verifiedSession = verifySessionToken(sessionToken);
  assert.equal(verifiedSession.valid, true, 'Session token must verify');
  if (verifiedSession.valid) {
    assert.equal(verifiedSession.payload.accountId, regResult.account.accountId);
    assert.equal(verifiedSession.payload.username, 'alice_social');
    assert.equal(verifiedSession.payload.scope, 'user');
  }
  console.log('  PASS: Session token issued, verified, and mapped to accountId.\n');

  // [TEST 8] Session revocation invalidates token
  console.log('[TEST 8] Session revocation invalidates token');
  const revoked = revokeSession(sessionToken);
  assert.equal(revoked, true, 'Session revocation must succeed');
  const verifyAfterRevoke = verifySessionToken(sessionToken);
  assert.equal(verifyAfterRevoke.valid, false, 'Revoked session must fail verification');
  console.log('  PASS: Session revocation immediately cuts token validity.\n');

  // [TEST 9] Suspended account cannot authenticate
  console.log('[TEST 9] Suspended account cannot authenticate');
  await updateAccountStatusAsync(regResult.account.accountId, 'SUSPENDED');
  const suspendedAuth = await authenticateAccountAsync('alice_social', 'AliceSecurePassword123!');
  assert.equal(suspendedAuth.success, false, 'Suspended account must be blocked from login');
  assert.ok(suspendedAuth.error && suspendedAuth.error.includes('suspended'), 'Error message must reflect account suspension');
  console.log('  PASS: Suspended account blocked from authenticating.\n');

  console.log('================================================================');
  console.log('--- ALL 9 ACCOUNT-FIRST AUTHENTICATION TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
