import assert from 'node:assert/strict';
import {
  registerAccountAsync,
  setAccountRolesAsync,
  listAllAccountsAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  accountHasCapabilityAsync,
  issueStepUpChallengeAsync,
  completeStepUpAsync,
  validateStepUpTokenAsync,
} from '../../src/lib/security/rbac.ts';
import {
  getEffectiveFeatureStateAsync,
  updateRuntimeFeatureStateAsync,
  resetFeatureStoreForTests,
} from '../../src/lib/data/featureStore.ts';
import {
  recordAuditLogAsync,
  getAuditLogsAsync,
  resetAuditStoreForTests,
} from '../../src/lib/data/auditStore.ts';

process.env.SESSION_SECRET = 'a'.repeat(32);
process.env.ADULT_CLUB_ENABLED = 'false';

async function runTests() {
  console.log('================================================================');
  console.log('--- REPAIR: OWNER DASHBOARD & RBAC CAPABILITY SUITE ---');
  console.log('================================================================\n');

  resetAccountStoreForTests();
  resetFeatureStoreForTests();
  resetAuditStoreForTests();

  // Create accounts
  const resOwner = await registerAccountAsync('the_owner', 'OwnerPassword123!');
  const ownerUser = resOwner.account;
  const resAdmin = await registerAccountAsync('the_admin', 'AdminPassword123!');
  const adminUser = resAdmin.account;
  const resMod = await registerAccountAsync('the_moderator', 'ModPassword123!');
  const modUser = resMod.account;
  const resJoe = await registerAccountAsync('regular_joe', 'RegularPassword123!');
  const ordinaryUser = resJoe.account;

  // Assign roles
  process.env.PLATFORM_OWNER_ACCOUNT_ID = ownerUser.accountId;
  await setAccountRolesAsync(ownerUser.accountId, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  await setAccountRolesAsync(adminUser.accountId, ['ROLE_ADMIN', 'ROLE_USER']);
  await setAccountRolesAsync(modUser.accountId, ['ROLE_MODERATOR', 'ROLE_USER']);

  // [TEST 1] Role capability mapping
  console.log('[TEST 1] Role capability mapping');
  assert.equal(await accountHasCapabilityAsync(ownerUser.accountId, 'feature:toggle'), true);
  assert.equal(await accountHasCapabilityAsync(ownerUser.accountId, 'roles:manage'), true);
  assert.equal(await accountHasCapabilityAsync(ownerUser.accountId, 'telemetry:read'), true);
  assert.equal(await accountHasCapabilityAsync(adminUser.accountId, 'accounts:suspend'), true);
  assert.equal(await accountHasCapabilityAsync(adminUser.accountId, 'feature:toggle'), false);
  assert.equal(await accountHasCapabilityAsync(modUser.accountId, 'moderation:read'), true);
  assert.equal(await accountHasCapabilityAsync(modUser.accountId, 'accounts:suspend'), false);
  assert.equal(await accountHasCapabilityAsync(ordinaryUser.accountId, 'telemetry:read'), false);
  console.log('  PASS: Granular capabilities strictly enforced per role.\n');

  // [TEST 2] Step-Up challenge generation and completion
  console.log('[TEST 2] Step-Up challenge generation and completion');
  const challenge = await issueStepUpChallengeAsync(ownerUser.accountId);
  assert.ok(challenge.challengeNonce.startsWith('stepup_'));
  const stepUpResult = await completeStepUpAsync(ownerUser.accountId, challenge.challengeNonce, 'PASSWORD', 'OwnerPassword123!');
  assert.equal(stepUpResult.success, true);
  assert.ok(stepUpResult.stepUpToken && stepUpResult.stepUpToken.startsWith('stu_'));
  const isValid = await validateStepUpTokenAsync(ownerUser.accountId, stepUpResult.stepUpToken);
  assert.equal(isValid, true, 'Step up token must validate for the owner');
  console.log('  PASS: Step-up challenge and token verification working.\n');

  // [TEST 3] Replayed step-up challenge rejected
  console.log('[TEST 3] Replayed step-up challenge rejected');
  const replayed = await completeStepUpAsync(ownerUser.accountId, challenge.challengeNonce, 'PASSWORD', 'OwnerPassword123!');
  assert.equal(replayed.success, false, 'Replayed challenge nonce must be rejected');
  console.log('  PASS: Anti-replay on step-up challenge confirmed.\n');

  // [TEST 4] Two-Layer Feature Control: Cannot enable Adult Club if deployment forbids it
  console.log('[TEST 4] Two-Layer Feature Control: Cannot enable Adult Club if deployment forbids it');
  const attemptEnable = await updateRuntimeFeatureStateAsync({ adultClubEnabled: true });
  assert.equal(attemptEnable.success, false, 'Runtime attempt to enable deployment-forbidden feature must fail');
  assert.ok(attemptEnable.error && attemptEnable.error.includes('deployment configuration'), 'Error must cite deployment limit');
  const effectiveState = await getEffectiveFeatureStateAsync();
  assert.equal(effectiveState.adultClub, false, 'Effective adult club state must remain false');
  console.log('  PASS: Deployment configuration strictly bounds runtime feature toggles.\n');

  // [TEST 5] Two-Layer Feature Control: Runtime can disable permitted feature
  console.log('[TEST 5] Two-Layer Feature Control: Runtime can disable permitted feature');
  const disableReg = await updateRuntimeFeatureStateAsync({ registrationEnabled: false });
  assert.equal(disableReg.success, true);
  const stateAfter = await getEffectiveFeatureStateAsync();
  assert.equal(stateAfter.registration, false, 'Registration must be disabled at runtime');
  console.log('  PASS: Owner dashboard can disable runtime features.\n');

  // [TEST 6] Audit Log recording and query with zero secrets
  console.log('[TEST 6] Audit Log recording and query with zero secrets');
  await recordAuditLogAsync({
    actorAccountId: ownerUser.accountId,
    capabilityUsed: 'feature:toggle',
    action: 'REGISTRATION_DISABLED',
    targetType: 'SYSTEM_CONFIG',
    targetId: 'registration',
    ipHash: 'test_ip_hash',
    userAgentHash: 'test_ua_hash',
    stepUpMethodUsed: 'PASSWORD',
    outcome: 'SUCCESS',
    metadata: {
      passwordHash: '$argon2id$leaked', // Should be stripped
      secretToken: 'secret_123', // Should be stripped
      validField: 'allowed_meta',
    },
  });

  const logs = await getAuditLogsAsync(10);
  assert.ok(logs.length > 0, 'Audit log must contain recorded entry');
  const latest = logs[0];
  assert.equal(latest.actorAccountId, ownerUser.accountId);
  assert.equal(latest.action, 'REGISTRATION_DISABLED');
  assert.equal(latest.metadata && latest.metadata.validField, 'allowed_meta');
  assert.equal(latest.metadata && latest.metadata.passwordHash, undefined, 'Sensitive field passwordHash must be purged');
  assert.equal(latest.metadata && latest.metadata.secretToken, undefined, 'Sensitive field secretToken must be purged');
  console.log('  PASS: Audit log persists records and automatically purges credentials/secrets.\n');

  // [TEST 7] Accounts listing for Owner Dashboard
  console.log('[TEST 7] Accounts listing for Owner Dashboard');
  const allAccounts = await listAllAccountsAsync(100);
  assert.equal(allAccounts.length, 4, 'Must return exact real account count');
  for (const acc of allAccounts) {
    assert.equal(acc.passwordHash, undefined, 'No password hash exposed in accounts list');
  }
  console.log('  PASS: Owner account list returns real records without credential leaks.\n');

  console.log('================================================================');
  console.log('--- ALL 7 OWNER DASHBOARD & RBAC TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
