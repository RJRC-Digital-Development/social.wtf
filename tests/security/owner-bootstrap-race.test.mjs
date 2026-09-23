import assert from 'node:assert/strict';
import { bindVerifiedWalletAsync, bootstrapPlatformOwnerAsync, getAccountRolesAsync, registerAccountAsync, resetAccountStoreForTests, setAccountRolesAsync } from '../../src/lib/data/accountStore.ts';
import { accountHasCapabilityAsync, resolveEffectiveAuthorizationAsync } from '../../src/lib/security/rbac.ts';
import { createAccountSession, verifySessionToken } from '../../src/lib/security/session.ts';
import { distributedStore } from '../../src/lib/security/distributedStore.ts';
import { resetProfileStore, saveOnboardedProfileAsync } from '../../src/lib/data/profileStore.ts';

process.env.SESSION_SECRET = ['owner', 'provisioning', 'security', 'test', 'secret'].join('_');

async function runTests() {
  resetAccountStoreForTests();
  resetProfileStore(true);
  distributedStore.clearLocalFallback();
  const ordinary = (await registerAccountAsync('platform_owner', 'OrdinaryPassword123!')).account;
  const owner = (await registerAccountAsync('human_owner', 'OwnerPassword123!')).account;
  assert.ok(ordinary && owner);
  const originalOwnerId = owner.accountId;

  console.log('[TEST 1] Username, handle, and wallet cannot manufacture owner authority');
  await bindVerifiedWalletAsync(ordinary.accountId, 'OwnerLikeWallet111111111111111111111111111', 'digest', 'audit');
  const profile = await saveOnboardedProfileAsync(ordinary.accountId, { handle: 'official_platform_owner', name: 'Owner-like public profile' });
  assert.equal(profile.success, true);
  assert.deepEqual((await getAccountRolesAsync(ordinary.accountId)).roles, ['ROLE_USER']);
  assert.equal(await accountHasCapabilityAsync(ordinary.accountId, 'telemetry:read'), false);

  console.log('[TEST 2] Configured owner must be an existing canonical account');
  process.env.PLATFORM_OWNER_ACCOUNT_ID = `acc_${'f'.repeat(32)}`;
  await assert.rejects(bootstrapPlatformOwnerAsync(), /PLATFORM_OWNER_ACCOUNT_NOT_FOUND/);
  process.env.PLATFORM_OWNER_ACCOUNT_ID = 'platform_owner';
  await assert.rejects(bootstrapPlatformOwnerAsync(), /PLATFORM_OWNER_ACCOUNT_ID_INVALID/);

  console.log('[TEST 3] Existing owner is reconciled without changing canonical identity');
  process.env.PLATFORM_OWNER_ACCOUNT_ID = originalOwnerId;
  const originalIsConfigured = distributedStore.isConfigured;
  distributedStore.isConfigured = () => true;
  const first = await bootstrapPlatformOwnerAsync();
  assert.equal(first.accountId, originalOwnerId);
  assert.equal(first.isNew, false);
  assert.deepEqual((await getAccountRolesAsync(originalOwnerId)).roles, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  assert.equal(await accountHasCapabilityAsync(originalOwnerId, 'telemetry:read'), true);
  const snapshot = await resolveEffectiveAuthorizationAsync(originalOwnerId);
  assert.equal(snapshot.accountId, originalOwnerId);
  assert.equal(snapshot.effectiveCapabilities.includes('telemetry:read'), true);

  console.log('[TEST 4] Bootstrap is idempotent and roles survive process-cache reset');
  assert.equal((await bootstrapPlatformOwnerAsync()).accountId, originalOwnerId);
  resetAccountStoreForTests();
  assert.deepEqual((await getAccountRolesAsync(originalOwnerId)).roles, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);

  console.log('[TEST 5] Stale claims and stale process cache cannot preserve revoked privilege');
  const staleToken = createAccountSession(owner, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const staleSession = verifySessionToken(staleToken);
  assert.equal(staleSession.valid && staleSession.payload.roles?.includes('ROLE_PLATFORM_OWNER'), true);
  await setAccountRolesAsync(originalOwnerId, ['ROLE_USER']);
  const current = await resolveEffectiveAuthorizationAsync(originalOwnerId);
  assert.deepEqual(current.roles, ['ROLE_USER']);
  assert.equal(current.effectiveCapabilities.includes('telemetry:read'), false);
  assert.equal(await accountHasCapabilityAsync(originalOwnerId, 'telemetry:read'), false);
  await setAccountRolesAsync(originalOwnerId, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  await distributedStore.set(`account:roles:${originalOwnerId}`, JSON.stringify({ accountId: originalOwnerId, roles: ['ROLE_USER'], directCapabilities: [], assignedAt: Date.now() }));
  assert.equal(await accountHasCapabilityAsync(originalOwnerId, 'telemetry:read'), false);

  await setAccountRolesAsync(originalOwnerId, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  delete process.env.PLATFORM_OWNER_ACCOUNT_ID;
  const mismatched = await resolveEffectiveAuthorizationAsync(originalOwnerId);
  assert.deepEqual(mismatched.roles, ['ROLE_USER']);
  assert.equal(mismatched.effectiveCapabilities.includes('telemetry:read'), false);
  process.env.PLATFORM_OWNER_ACCOUNT_ID = originalOwnerId;

  console.log('[TEST 6] Authoritative read and owner-role write failures fail closed');
  const originalGetWithStatus = distributedStore.getWithStatus;
  const originalSet = distributedStore.set;
  distributedStore.getWithStatus = async () => ({ ok: false, value: null });
  try {
    assert.equal(await accountHasCapabilityAsync(originalOwnerId, 'telemetry:read'), false);
    await assert.rejects(resolveEffectiveAuthorizationAsync(originalOwnerId), /AUTHORITATIVE_RBAC_UNAVAILABLE/);
  } finally {
    distributedStore.getWithStatus = originalGetWithStatus;
  }

  console.log('[TEST 7] Successful owner write followed by failed read-back rejects bootstrap');
  distributedStore.set = async () => true;
  distributedStore.getWithStatus = async () => ({ ok: false, value: null });
  try {
    await assert.rejects(bootstrapPlatformOwnerAsync(), /AUTHORITATIVE_RBAC_UNAVAILABLE/);
  } finally {
    distributedStore.getWithStatus = originalGetWithStatus;
    distributedStore.set = originalSet;
  }

  distributedStore.set = async () => false;
  try {
    await assert.rejects(bootstrapPlatformOwnerAsync(), /PLATFORM_OWNER_RBAC_WRITE_FAILED/);
  } finally {
    distributedStore.set = originalSet;
    distributedStore.isConfigured = originalIsConfigured;
  }
  console.log('--- ALL OWNER PROVISIONING & AUTHORITATIVE RBAC TESTS PASSED ---');
}

runTests().catch((error) => { console.error('Owner provisioning regression failure:', error); process.exit(1); });
