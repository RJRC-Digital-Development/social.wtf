import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import {
  registerAccountAsync,
  bindVerifiedWalletAsync,
  getAccountIdByWalletAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import { resetAuditStoreForTests } from '../../src/lib/data/auditStore.ts';

process.env.SESSION_SECRET = 'a'.repeat(32);

async function runTests() {
  console.log('================================================================');
  console.log('--- REPAIR: WALLET BINDING & CRYPTOGRAPHIC PROOF SUITE ---');
  console.log('================================================================\n');

  resetAccountStoreForTests();
  resetAuditStoreForTests();

  // Create two separate accounts
  const resA = await registerAccountAsync('user_alpha', 'AlphaPassword123!');
  const userA = resA.account;
  const resB = await registerAccountAsync('user_beta', 'BetaPassword123!');
  const userB = resB.account;

  const walletA = Keypair.generate();
  const walletAAddress = walletA.publicKey.toBase58();

  // [TEST 1] Cryptographically bind wallet to Account A
  console.log('[TEST 1] Cryptographically bind wallet to Account A');
  const challengeDigest = 'sha256_mock_digest_123';
  const auditId = 'aud_test_001';

  const bindResult = await bindVerifiedWalletAsync(userA.accountId, walletAAddress, challengeDigest, auditId);
  assert.equal(bindResult.success, true, 'Wallet binding must succeed');
  assert.equal(bindResult.binding.status, 'VERIFIED');
  assert.equal(bindResult.binding.accountId, userA.accountId);
  assert.equal(bindResult.binding.walletAddress, walletAAddress);
  console.log('  PASS: Wallet successfully bound to Account A.\n');

  // [TEST 2] Lookup accountId by bound wallet address
  console.log('[TEST 2] Lookup accountId by bound wallet address');
  const foundAccountId = await getAccountIdByWalletAsync(walletAAddress);
  assert.equal(foundAccountId, userA.accountId, 'Lookup must return Account A accountId');
  console.log('  PASS: Wallet lookup maps precisely to Account A.\n');

  // [TEST 3] Attempt to bind already-bound wallet to Account B rejected
  console.log('[TEST 3] Attempt to bind already-bound wallet to Account B rejected');
  const conflictResult = await bindVerifiedWalletAsync(userB.accountId, walletAAddress, 'diff_digest', 'aud_test_002');
  assert.equal(conflictResult.success, false, 'Binding already bound wallet to second account must fail');
  assert.ok(conflictResult.error && conflictResult.error.includes('already bound'), 'Error must specify wallet is already bound');
  console.log('  PASS: Duplicate wallet binding across identities rejected.\n');

  // [TEST 4] Unbound wallet returns null accountId
  console.log('[TEST 4] Unbound wallet returns null accountId');
  const unboundWallet = Keypair.generate().publicKey.toBase58();
  const unboundResult = await getAccountIdByWalletAsync(unboundWallet);
  assert.equal(unboundResult, null, 'Unbound wallet must return null');
  console.log('  PASS: Unbound wallet does not map to any account.\n');

  // [TEST 5] Re-binding same wallet to same account is idempotent
  console.log('[TEST 5] Re-binding same wallet to same account is idempotent');
  const rebindResult = await bindVerifiedWalletAsync(userA.accountId, walletAAddress, challengeDigest, 'aud_test_003');
  assert.equal(rebindResult.success, true, 'Re-binding to same account must succeed idempotently');
  console.log('  PASS: Re-binding to same account is idempotent.\n');

  console.log('================================================================');
  console.log('--- ALL 5 WALLET BINDING TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
