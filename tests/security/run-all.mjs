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
  console.log('🛡️  ALL ADVERSARIAL SECURITY TESTS PASSED WITH ZERO FAILURES! 🛡️\n');
  process.exit(0);
}
