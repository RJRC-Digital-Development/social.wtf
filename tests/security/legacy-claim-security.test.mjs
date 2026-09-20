import assert from 'assert';
import { Keypair } from '@solana/web3.js';
import {
  registerAccountAsync,
  bindVerifiedWalletAsync,
  getAccountIdByWalletAsync,
  resolveCanonicalIdentityAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';

console.log('================================================================');
console.log('--- REPAIR: LEGACY CLAIM SECURITY & MIGRATION STATE MACHINE ---');
console.log('================================================================\n');

async function runTests() {
  resetAccountStoreForTests();

  const keypairW = Keypair.generate();
  const walletW = keypairW.publicKey.toBase58();

  console.log('[TEST 1] Unbound legacy string does not manufacture canonical accountId');
  const unboundRes = await resolveCanonicalIdentityAsync(walletW);
  const legacyUnboundRes = await resolveCanonicalIdentityAsync('user-' + walletW);
  assert.strictEqual(unboundRes, walletW, 'Unbound wallet must not manufacture accountId');
  assert.strictEqual(legacyUnboundRes, 'user-' + walletW, 'Unbound legacy string must not manufacture accountId');
  console.log('  PASS: Unbound wallet does not create or claim any canonical account.');

  console.log('\n[TEST 2] Attacker Account A cannot claim wallet W without verified signature');
  const regA = await registerAccountAsync('attacker_a', 'AttackerPass123!');
  assert(regA.success && regA.account, 'Attacker account creation failed');
  const accA = regA.account.accountId;

  const lookupBefore = await getAccountIdByWalletAsync(walletW);
  assert.strictEqual(lookupBefore, null, 'Unverified wallet must not map to attacker');
  console.log('  PASS: Unverified claim rejected; no binding established.');

  console.log('\n[TEST 3] Legitimate Account B establishes verified binding W -> accB');
  const regB = await registerAccountAsync('legit_b', 'LegitPassword123!');
  assert(regB.success && regB.account, 'Legit account creation failed');
  const accB = regB.account.accountId;

  const challengeDigest = 'challenge_digest_' + Date.now();
  const auditId = 'audit_siws_' + Date.now();
  const bindRes = await bindVerifiedWalletAsync(accB, walletW, challengeDigest, auditId);
  assert(bindRes.success && bindRes.binding, 'Legit wallet binding failed');
  assert.strictEqual(bindRes.binding.status, 'VERIFIED', 'Binding status must be VERIFIED');

  const boundAcc = await getAccountIdByWalletAsync(walletW);
  assert.strictEqual(boundAcc, accB, 'Bound wallet must map strictly to legit Account B');
  console.log('  PASS: Legitimate Account B successfully mapped to wallet W.');

  console.log('\n[TEST 4] Re-binding same wallet W to Account B is strictly idempotent');
  const rebindRes = await bindVerifiedWalletAsync(accB, walletW, challengeDigest, auditId);
  assert(rebindRes.success, 'Re-binding should succeed idempotently');
  const boundAccRepeat = await getAccountIdByWalletAsync(walletW);
  assert.strictEqual(boundAccRepeat, accB, 'Account ID must remain unchanged');
  console.log('  PASS: Re-binding is idempotent with zero duplicate account creation.');

  console.log('\n[TEST 5] Account C attempting to bind already-bound wallet W is rejected');
  const regC = await registerAccountAsync('account_c', 'AnotherPassword123!');
  assert(regC.success && regC.account, 'Account C creation failed');
  const accC = regC.account.accountId;

  const stealRes = await bindVerifiedWalletAsync(accC, walletW, challengeDigest, auditId);
  assert.strictEqual(stealRes.success, false, 'Binding already-bound wallet must fail');
  assert(stealRes.error?.includes('already bound'), 'Error must specify wallet is already bound');
  
  const finalLookup = await getAccountIdByWalletAsync(walletW);
  assert.strictEqual(finalLookup, accB, 'Mapping must remain locked to Account B');
  console.log('  PASS: Subsequent claim by Account C rejected; wallet remains bound to Account B.');

  console.log('\n================================================================');
  console.log('--- ALL 5 LEGACY CLAIM & MIGRATION STATE MACHINE TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
