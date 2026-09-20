import assert from 'assert';
import {
  registerAccountAsync,
  authenticateAccountAsync,
  normalizeUsername,
  validateUsername,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';

console.log('================================================================');
console.log('--- REPAIR: USERNAME NORMALIZATION & CONCURRENCY SUITE ---');
console.log('================================================================\n');

async function runTests() {
  resetAccountStoreForTests();

  console.log('[TEST 1] Exact normalization rules: trim, lowercase, strip @ prefix');
  assert.strictEqual(normalizeUsername('  @Alice_Test  '), 'alice_test');
  assert.strictEqual(normalizeUsername('ALICE'), 'alice');
  assert.strictEqual(normalizeUsername('@Bob_99'), 'bob_99');
  console.log('  PASS: Normalization rules conform strictly.');

  console.log('\n[TEST 2] Case collision: Alice, alice, ALICE cannot register separately');
  const reg1 = await registerAccountAsync('Alice', 'Password123456!');
  assert(reg1.success, 'First registration must succeed');

  const reg2 = await registerAccountAsync('alice', 'Password123456!');
  assert.strictEqual(reg2.success, false, 'Duplicate lower-case alice must fail');

  const reg3 = await registerAccountAsync('ALICE', 'Password123456!');
  assert.strictEqual(reg3.success, false, 'Duplicate upper-case ALICE must fail');
  console.log('  PASS: Case collision prevented; all casing variants map to single reservation.');

  console.log('\n[TEST 3] Registration and Login use identical normalization');
  const login1 = await authenticateAccountAsync('ALICE', 'Password123456!');
  const login2 = await authenticateAccountAsync('  @Alice  ', 'Password123456!');
  assert(login1.success && login1.account?.username === 'alice', 'Login with ALICE failed');
  assert(login2.success && login2.account?.username === 'alice', 'Login with @Alice failed');
  console.log('  PASS: Login and Registration share identical normalization.');

  console.log('\n[TEST 4] Unsupported Unicode / confusable characters rejected');
  const invalid1 = validateUsername('Аlice'); // Cyrillic A
  const invalid2 = validateUsername('alice@domain');
  const invalid3 = validateUsername('alice space');
  assert.strictEqual(invalid1.valid, false, 'Cyrillic homoglyph must be rejected');
  assert.strictEqual(invalid2.valid, false, 'Special character must be rejected');
  assert.strictEqual(invalid3.valid, false, 'Space must be rejected');
  console.log('  PASS: Conservative ASCII alphanumeric + underscore rule enforced.');

  console.log('\n[TEST 5] Concurrent duplicate registration creates only ONE account');
  const results = await Promise.all([
    registerAccountAsync('concurrency_user', 'Pass1234567!'),
    registerAccountAsync('CONCURRENCY_USER', 'Pass1234567!'),
    registerAccountAsync('  concurrency_user  ', 'Pass1234567!'),
  ]);

  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  assert.strictEqual(successes.length, 1, 'Exactly 1 concurrent registration must succeed');
  assert.strictEqual(failures.length, 2, 'Remaining 2 concurrent registrations must fail');
  console.log('  PASS: Concurrency test passed; atomic reservation prevents duplicates.');

  console.log('\n================================================================');
  console.log('--- ALL 5 USERNAME NORMALIZATION & CONCURRENCY TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
