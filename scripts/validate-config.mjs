#!/usr/bin/env node

/**
 * Social.wtf Production Security Configuration Validator
 * Refuses unsafe configuration and enforces strict fail-closed constraints.
 * Never prints secrets or sensitive values.
 */

console.log('================================================================');
console.log('       SOCIAL.WTF PRODUCTION SECURITY CONFIG VALIDATOR          ');
console.log('================================================================\n');

const env = (process.env.SOCIAL_WTF_ENV || process.env.NODE_ENV || 'production').toLowerCase().trim();
const errors = [];
const warnings = [];

console.log(`Evaluating Target Environment: [${env.toUpperCase()}]`);

if (env === 'production') {
  // 1. Session Secret
  const sessionSecret = process.env.SESSION_SECRET || '';
  if (!sessionSecret) {
    errors.push('SESSION_SECRET is not defined.');
  } else if (sessionSecret.length < 32) {
    errors.push(`SESSION_SECRET is only ${sessionSecret.length} chars (minimum 32 chars required).`);
  } else if (
    sessionSecret.includes('your_secure_random_session_secret') ||
    sessionSecret.includes('placeholder') ||
    sessionSecret.includes('change_me')
  ) {
    errors.push('SESSION_SECRET contains default insecure placeholder value.');
  }

  // 2. Sandbox proof flags
  if (process.env.ALLOW_SANDBOX_VERIFICATION === 'true' || process.env.ALLOW_SANDBOX_PROOFS === 'true') {
    errors.push('ALLOW_SANDBOX_VERIFICATION is enabled in production mode.');
  }

  if (process.env.NEXT_PUBLIC_ALLOW_MOCK_VERIFICATION === 'true') {
    errors.push('NEXT_PUBLIC_ALLOW_MOCK_VERIFICATION is enabled in production mode.');
  }

  // 3. Distributed Store configuration
  const hasDistributed = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    process.env.REDIS_URL
  );

  if (!hasDistributed) {
    warnings.push('No distributed store (Redis/Upstash/Vercel KV) configured. Single-worker memory fallback active.');
  }

  // 4. Server Signer & Chain Config
  const hasSigner = Boolean(process.env.PLATFORM_PRIVATE_KEY);
  if (hasSigner) {
    console.log('Server Signer: Configured (Platform Hot Wallet)');
  } else {
    warnings.push('PLATFORM_PRIVATE_KEY not set; platform automated execution is offline (fail-closed).');
  }
} else {
  console.log(`Non-production mode (${env}): Sandbox and test relaxed constraints permitted.`);
}

console.log('\n--- VALIDATION RESULTS ---');
if (warnings.length > 0) {
  console.log('WARNINGS:');
  warnings.forEach((w) => console.log(`  [WARN] ${w}`));
}

if (errors.length > 0) {
  console.error('\nERRORS:');
  errors.forEach((e) => console.error(`  [FAIL] ${e}`));
  console.error('\nProduction security configuration validation FAILED. Exiting with code 1.\n');
  process.exit(1);
} else {
  console.log('\nPASSED: Security configuration is valid and meets safety requirements.\n');
  process.exit(0);
}
