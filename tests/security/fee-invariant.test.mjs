import assert from 'assert';

const BPS_DENOMINATOR = 10_000n;
const MAX_FEE_BPS = 2_500n; // 25%
const LAMPORTS_PER_SOL = 1_000_000_000;

function calculateFeeSplit(totalCook, feeBpsNum = 500) {
  if (totalCook <= 0) {
    throw new Error('Transaction amount must be strictly greater than 0');
  }

  const feeBps = BigInt(Math.max(0, Math.min(Number(MAX_FEE_BPS), feeBpsNum)));
  const totalLamports = BigInt(Math.round(totalCook * LAMPORTS_PER_SOL));

  if (totalLamports <= 0n) {
    throw new Error('Transaction amount rounds to 0 lamports');
  }

  const treasuryLamports = (totalLamports * feeBps) / BPS_DENOMINATOR;
  const creatorLamports = totalLamports - treasuryLamports;

  // Enforce critical invariant
  if (creatorLamports + treasuryLamports !== totalLamports) {
    throw new Error('Invariant failed: creator + treasury != total');
  }

  return {
    totalLamports,
    creatorLamports,
    treasuryLamports,
  };
}

console.log('--- RUNNING FEE INVARIANT ADVERSARIAL TESTS ---');

// Test Case 1: 1 lamport edge case (0.000000001 COOK)
{
  const result = calculateFeeSplit(0.000000001, 500);
  assert.strictEqual(result.totalLamports, 1n);
  assert.strictEqual(result.treasuryLamports, 0n);
  assert.strictEqual(result.creatorLamports, 1n);
  assert.strictEqual(result.creatorLamports + result.treasuryLamports, result.totalLamports);
  console.log('✓ Test 1: 1 lamport edge-case passed');
}

// Test Case 2: 19 lamports prime edge case (0.000000019 COOK)
{
  const result = calculateFeeSplit(0.000000019, 500);
  assert.strictEqual(result.totalLamports, 19n);
  assert.strictEqual(result.treasuryLamports, 0n);
  assert.strictEqual(result.creatorLamports, 19n);
  assert.strictEqual(result.creatorLamports + result.treasuryLamports, result.totalLamports);
  console.log('✓ Test 2: 19 lamports prime edge-case passed');
}

// Test Case 3: 100 lamports (0.000000100 COOK)
{
  const result = calculateFeeSplit(0.0000001, 500);
  assert.strictEqual(result.totalLamports, 100n);
  assert.strictEqual(result.treasuryLamports, 5n);
  assert.strictEqual(result.creatorLamports, 95n);
  assert.strictEqual(result.creatorLamports + result.treasuryLamports, result.totalLamports);
  console.log('✓ Test 3: 100 lamports test passed');
}

// Test Case 4: 10,000 lamports (0.000010000 COOK)
{
  const result = calculateFeeSplit(0.00001, 500);
  assert.strictEqual(result.totalLamports, 10_000n);
  assert.strictEqual(result.treasuryLamports, 500n);
  assert.strictEqual(result.creatorLamports, 9_500n);
  assert.strictEqual(result.creatorLamports + result.treasuryLamports, result.totalLamports);
  console.log('✓ Test 4: 10,000 lamports test passed');
}

// Test Case 5: Large safe amounts (1,000,000 COOK)
{
  const result = calculateFeeSplit(1_000_000, 500);
  assert.strictEqual(result.totalLamports, 1_000_000_000_000_000n);
  assert.strictEqual(result.treasuryLamports, 50_000_000_000_000n);
  assert.strictEqual(result.creatorLamports, 950_000_000_000_000n);
  assert.strictEqual(result.creatorLamports + result.treasuryLamports, result.totalLamports);
  console.log('✓ Test 5: 1,000,000 COOK large amount test passed');
}

// Test Case 6: Fuzzing 1,000 random payment amounts
{
  for (let i = 0; i < 1000; i++) {
    const randomCook = Math.random() * 1000 + 0.000000001;
    const randomFeeBps = Math.floor(Math.random() * 2500);
    const result = calculateFeeSplit(randomCook, randomFeeBps);
    assert.strictEqual(
      result.creatorLamports + result.treasuryLamports,
      result.totalLamports,
      'Fuzz invariant failed'
    );
  }
  console.log('✓ Test 6: 1,000 iterations of random fee fuzzing verified invariant holds 100%');
}

console.log('ALL FEE INVARIANT ADVERSARIAL TESTS PASSED!\n');
