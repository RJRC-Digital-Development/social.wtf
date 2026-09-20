import assert from 'assert';
import {
  registerAccountAsync,
  listAllAccountsAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  recordAuditLogAsync,
  getAuditLogsAsync,
  resetAuditStoreForTests,
} from '../../src/lib/data/auditStore.ts';

console.log('================================================================');
console.log('--- REPAIR: OWNER DASHBOARD DATA-LEAK & SECRET SANITIZATION ---');
console.log('================================================================\n');

async function runTests() {
  resetAccountStoreForTests();
  resetAuditStoreForTests();

  console.log('[TEST 1] Account listing for Owner Dashboard contains NO credentials');
  await registerAccountAsync('victim_user', 'SecretPassword999!');
  const accounts = await listAllAccountsAsync();
  assert(accounts.length > 0, 'No accounts found');

  const forbiddenKeys = [
    'password',
    'passwordHash',
    'sessionToken',
    'token',
    'stepUpToken',
    'privateKey',
    'secretKey',
    'authHeader',
    'SESSION_SECRET',
  ];

  for (const acc of accounts) {
    const raw = JSON.stringify(acc);
    for (const key of forbiddenKeys) {
      assert(!acc[key], 'Account entity must not have key: ' + key);
      assert(!raw.toLowerCase().includes('secretpassword999'), 'Account serialization leaked plaintext password');
    }
  }
  console.log('  PASS: Account listing responses contains zero credential leaks.');

  console.log('\n[TEST 2] Serialized audit log records sanitize all sensitive keys');
  await recordAuditLogAsync({
    actorAccountId: 'acc_owner',
    capabilityUsed: 'test:sensitive',
    action: 'TEST_SENSITIVE_ACTION',
    targetType: 'ACCOUNT',
    targetId: 'res_1',
    ipHash: 'internal',
    userAgentHash: 'internal',
    outcome: 'SUCCESS',
    metadata: {
      password: 'PlaintextPassword123!',
      passwordHash: '$argon2id$v=19$...',
      token: 'session_token_xyz',
      stepUpToken: 'stepup_token_abc',
      SESSION_SECRET: 'super_secret_session_key',
      privateKey: 'private_key_pem_data',
      normalSetting: 'allowed_value',
    },
  });

  const auditLogs = await getAuditLogsAsync();
  assert(auditLogs.length > 0, 'No audit logs found');

  const serialized = JSON.stringify(auditLogs);
  assert(!serialized.includes('PlaintextPassword123!'), 'Audit log leaked plaintext password');
  assert(!serialized.includes('super_secret_session_key'), 'Audit log leaked SESSION_SECRET');
  assert(!serialized.includes('private_key_pem_data'), 'Audit log leaked privateKey');
  assert(!serialized.includes('private_key_pem_data'), 'Audit log leaked privateKey');
  console.log('  PASS: Audit log serialized response strictly purges all sensitive credentials.');

  console.log('\n================================================================');
  console.log('--- ALL 2 OWNER DATA-LEAK & SANITIZATION TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
