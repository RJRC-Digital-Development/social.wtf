import assert from 'assert';

console.log('--- RUNNING RATE LIMITER & DOS RESISTANCE ADVERSARIAL TESTS ---');

class SlidingWindowRateLimiter {
  constructor() {
    this.records = new Map();
  }

  check(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= limit) {
      const oldestInWindow = record.timestamps[0];
      const resetMs = oldestInWindow ? oldestInWindow + windowMs - now : windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, resetMs),
        limit,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: limit - record.timestamps.length,
      resetMs: windowMs,
      limit,
    };
  }

  reset(key) {
    this.records.delete(key);
  }
}

const limiter = new SlidingWindowRateLimiter();

// Test 1: Allow up to threshold
{
  const testKey = 'ip:198.51.100.1';
  const limit = 5;
  const windowMs = 10_000;

  for (let i = 1; i <= limit; i++) {
    const res = limiter.check(testKey, limit, windowMs);
    assert.strictEqual(res.allowed, true, `Request ${i} should be allowed`);
    assert.strictEqual(res.remaining, limit - i);
  }
  console.log('✓ Test 1: Permitted requests up to limit quota (5/5)');

  // Test 2: Throttling / Rejection when limit exceeded
  const rejectedRes = limiter.check(testKey, limit, windowMs);
  assert.strictEqual(rejectedRes.allowed, false, '6th request must be throttled');
  assert.strictEqual(rejectedRes.remaining, 0);
  assert.ok(rejectedRes.resetMs > 0);
  console.log('✓ Test 2: DoS burst traffic throttled and rejected beyond limit quota');
}

// Test 3: Key Isolation
{
  const ipA = 'ip:198.51.100.2';
  const ipB = 'ip:198.51.100.3';
  const limit = 3;
  const windowMs = 10_000;

  for (let i = 0; i < limit; i++) {
    limiter.check(ipA, limit, windowMs);
  }

  // ipA is now exhausted
  assert.strictEqual(limiter.check(ipA, limit, windowMs).allowed, false);

  // ipB should still be completely unaffected (independent quota)
  const resB = limiter.check(ipB, limit, windowMs);
  assert.strictEqual(resB.allowed, true);
  assert.strictEqual(resB.remaining, 2);
  console.log('✓ Test 3: Per-IP / Per-Identity key isolation strictly enforced');
}

// Test 4: Reset capability
{
  const testKey = 'ip:reset-test';
  limiter.check(testKey, 1, 10_000);
  assert.strictEqual(limiter.check(testKey, 1, 10_000).allowed, false);

  limiter.reset(testKey);
  assert.strictEqual(limiter.check(testKey, 1, 10_000).allowed, true);
  console.log('✓ Test 4: Administrative state reset functions properly');
}

console.log('ALL RATE LIMITER & DOS RESISTANCE TESTS PASSED!\n');
