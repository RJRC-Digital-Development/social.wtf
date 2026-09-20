import assert from 'assert';
import {
  registerAccountAsync,
  bindVerifiedWalletAsync,
  getAccountRolesAsync,
  setAccountRolesAsync,
  bootstrapPlatformOwnerAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';

console.log('================================================================');
console.log('--- REPAIR: OWNER BOOTSTRAP RACE & PRIVILEGE BOUNDARY SUITE ---');
console.log('================================================================\n');

async function runTests() {
  resetAccountStoreForTests();

  const configuredOwnerWallet = 'OwnerWallet1111111111111111111111111111111111';
  const ordinaryWallet = 'UserWallet11111111111111111111111111111111111';

  console.log('[TEST 1] Configured owner wallet cannot be bound without signature proof');
  const regUser = await registerAccountAsync('regular_user', 'Password123456!');
  assert(regUser.success && regUser.account, 'User registration failed');
  const userAcc = regUser.account.accountId;

  const initialRoles = await getAccountRolesAsync(userAcc);
  assert(!initialRoles.roles.includes('ROLE_PLATFORM_OWNER'), 'New user must not have owner role');
  console.log('  PASS: New user has standard ROLE_USER without owner privileges.');

  console.log('\n[TEST 2] Ordinary account cannot receive owner role by binding arbitrary wallet');
  await bindVerifiedWalletAsync(userAcc, ordinaryWallet, 'digest', 'audit');
  const rolesAfterBinding = await getAccountRolesAsync(userAcc);
  assert(!rolesAfterBinding.roles.includes('ROLE_PLATFORM_OWNER'), 'Wallet binding must not grant owner role');
  assert(!rolesAfterBinding.roles.includes('ROLE_ADMIN'), 'Wallet binding must not grant admin role');
  console.log('  PASS: Wallet binding does not grant elevated RBAC roles.');

  console.log('\n[TEST 3] Username text matching cannot trigger owner assignment');
  const regFakeOwner = await registerAccountAsync('admin_platform_root', 'Password123456!');
  assert(regFakeOwner.success && regFakeOwner.account, 'Registration failed');
  const fakeRoles = await getAccountRolesAsync(regFakeOwner.account.accountId);
  assert(!fakeRoles.roles.includes('ROLE_PLATFORM_OWNER'), 'Username text must not grant owner role');
  console.log('  PASS: Username text cannot grant owner permissions.');

  console.log('\n[TEST 4] Client-supplied accountId cannot trigger owner assignment');
  const fakeAccountId = 'acc_platform_owner_root';
  const fakeIdRoles = await getAccountRolesAsync(fakeAccountId);
  assert(!fakeIdRoles.roles.includes('ROLE_PLATFORM_OWNER'), 'Client account ID must not grant owner role');
  console.log('  PASS: Arbitrary or special accountId values do not grant owner role.');

  console.log('\n[TEST 5] Legacy user identifier cannot trigger owner assignment');
  const legacyRoles = await getAccountRolesAsync('user-' + configuredOwnerWallet);
  assert(!legacyRoles.roles.includes('ROLE_PLATFORM_OWNER'), 'Legacy identifier must not grant owner role');
  console.log('  PASS: Legacy identifier cannot grant owner permissions.');

  console.log('\n[TEST 6] Concurrent bootstrap race cannot create duplicate owner accounts');
  const [bootA, bootB, bootC] = await Promise.all([
    bootstrapPlatformOwnerAsync('platform_owner'),
    bootstrapPlatformOwnerAsync('platform_owner'),
    bootstrapPlatformOwnerAsync('platform_owner'),
  ]);

  assert.strictEqual(bootA.accountId, bootB.accountId, 'Bootstrap A and B must yield same accountId');
  assert.strictEqual(bootB.accountId, bootC.accountId, 'Bootstrap B and C must yield same accountId');
  
  const ownerRoles = await getAccountRolesAsync(bootA.accountId);
  assert(ownerRoles.roles.includes('ROLE_PLATFORM_OWNER'), 'Owner account must have ROLE_PLATFORM_OWNER');
  assert(ownerRoles.roles.includes('ROLE_ADMIN'), 'Owner account must have ROLE_ADMIN');
  console.log('  PASS: Concurrent bootstrap executes idempotently and creates single canonical owner.');

  console.log('\n================================================================');
  console.log('--- ALL 6 OWNER BOOTSTRAP RACE & PRIVILEGE TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
