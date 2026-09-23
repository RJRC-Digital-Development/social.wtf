import { spawnSync } from 'child_process';
import path from 'path';

console.log('================================================================');
console.log('       SOCIAL.WTF FULL ADVERSARIAL SECURITY TEST SUITE         ');
console.log('================================================================\n');

const testFiles = [
  'fee-invariant.test.mjs',
  'sanitize.test.mjs',
  'wallet-auth.test.mjs',
  'rate-limiter.test.mjs',
  'session.test.mjs',
  'contract-invariants.test.mjs',
  'distributed-store.test.mjs',
  'authorization.test.mjs',
  'trust-wallet-signer.test.mjs',
  'profile-onboarding.test.mjs',
  'durable-persistence.test.mjs',
  'persistence-concurrency-gate.test.mjs',
  'admin-capability-authorization.test.mjs',
  'identity-separation.test.mjs',
  'fresh-wallet-access.test.mjs',
  'profile-persistence.test.mjs',
  'product-persistence.test.mjs',
  'wallet-connection-resilience.test.mjs',
  'post-persistence.test.mjs',
  'relationship-access.test.mjs',
  'platform-login-gate.test.mjs',
  'secret-club-authorization.test.mjs',
  'text-first-release.test.mjs',
  'account-auth.test.mjs',
  'wallet-binding.test.mjs',
  'owner-dashboard.test.mjs',
  'account-canonical-unification.test.mjs',
  'legacy-claim-security.test.mjs',
  'owner-bootstrap-race.test.mjs',
  'wallet-free-flow.test.mjs',
  'step-up-session.test.mjs',
  'nova-security-hardening.test.mjs',
  'username-normalization.test.mjs',
  'owner-data-leak.test.mjs',
  'auth-priority-zero.test.mjs',
  'account-wallet-decoupling.test.mjs',
  'treasury-configuration.test.mjs',
  'username-mutation.test.mjs',
];

let totalPassed = 0;
let totalFailed = 0;

for (const file of testFiles) {
  const filePath = path.join('tests', 'security', file);
  console.log(`Executing: ${file}...`);
  const result = spawnSync('node', [filePath], { stdio: 'inherit' });

  if (result.status === 0) {
    totalPassed++;
  } else {
    totalFailed++;
    console.error(`FAILED: ${file} exited with code ${result.status}`);
  }
}

console.log('================================================================');
console.log(`SUMMARY: ${totalPassed} suites PASSED, ${totalFailed} suites FAILED`);
console.log('================================================================');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('  ALL ADVERSARIAL SECURITY TESTS PASSED WITH ZERO FAILURES! \n');
  process.exit(0);
}
